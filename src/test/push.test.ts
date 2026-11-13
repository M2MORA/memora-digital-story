// @vitest-environment node
// Le chiffrement est vérifié par un déchiffrement écrit à part, suivant le RFC 8291.
import { describe, expect, it } from "vitest";
import { orderMessage, routePush } from "../server/push";
import {
  b64uDecode,
  b64uEncode,
  encryptPayload,
  isAllowedPushEndpoint,
  isValidSubscriptionKeys,
  vapidAuthorization,
} from "../server/push/webpush";

const enc = new TextEncoder();
const dec = new TextDecoder();
/** Les types DOM récents refusent Uint8Array<ArrayBufferLike> comme BufferSource. */
const bs = (bytes: Uint8Array) => bytes as unknown as BufferSource;

/** Appareil de test : une vraie paire de clés comme celle d'un navigateur. */
async function makeDevice() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    pair,
    keys: {
      p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
      auth: b64uEncode(auth),
    },
    authBytes: auth,
  };
}

/** Déchiffrement côté navigateur (RFC 8291), pour vérifier ce que le serveur envoie. */
async function decrypt(body: Uint8Array, device: Awaited<ReturnType<typeof makeDevice>>) {
  const salt = body.slice(0, 16);
  const idLen = body[20]!;
  const asPublic = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", device.pair.publicKey));

  const asKey = await crypto.subtle.importKey("raw", bs(asPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, device.pair.privateKey, 256));

  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) => {
    const k = await crypto.subtle.importKey("raw", bs(ikm), "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: bs(s), info: bs(info) }, k, n * 8));
  };
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(device.authBytes, secret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", bs(cek), "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(nonce) }, key, bs(ciphertext)));
  expect(plain[plain.length - 1]).toBe(2); // délimiteur du dernier enregistrement
  return dec.decode(plain.slice(0, -1));
}

async function makeVapid() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    pair,
    keys: {
      publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
      privateKey: jwk.d!,
      subject: "mailto:admin@memora.tn",
    },
  };
}

describe("chiffrement Web Push (RFC 8291)", () => {
  it("le navigateur retrouve le message (aller-retour)", async () => {
    const device = await makeDevice();
    const body = await encryptPayload(device.keys, enc.encode(JSON.stringify({ title: "Nouvelle commande", body: "#M1" })));
    expect(JSON.parse(await decrypt(body, device))).toEqual({ title: "Nouvelle commande", body: "#M1" });
  });

  it("refuse une clé d'abonnement invalide", async () => {
    await expect(encryptPayload({ p256dh: "abc", auth: "def" }, enc.encode("x"))).rejects.toThrow();
  });
});

describe("VAPID", () => {
  it("signe un jeton ES256 vérifiable avec la clé publique, pour le bon service", async () => {
    const vapid = await makeVapid();
    const now = Date.UTC(2026, 10, 14, 12, 0, 0);
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid.keys, now);

    const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(\S+)$/);
    expect(match).not.toBeNull();
    const [, h, c, s, k] = match!;
    expect(k).toBe(vapid.keys.publicKey);
    expect(JSON.parse(dec.decode(b64uDecode(h!)))).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(dec.decode(b64uDecode(c!)));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:admin@memora.tn");
    expect(claims.exp).toBe(Math.floor(now / 1000) + 12 * 3600);

    const signature = b64uDecode(s!);
    expect(signature.length).toBe(64);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.pair.publicKey,
      bs(signature),
      bs(enc.encode(`${h}.${c}`)),
    );
    expect(ok).toBe(true);
  });
});

describe("validation des abonnements", () => {
  it("n'accepte que les services de push connus, en https", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/xyz")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/Qabc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
  });

  it("vérifie la forme des clés", async () => {
    const device = await makeDevice();
    expect(isValidSubscriptionKeys(device.keys.p256dh, device.keys.auth)).toBe(true);
    expect(isValidSubscriptionKeys(device.keys.p256dh, "court")).toBe(false);
    expect(isValidSubscriptionKeys("court", device.keys.auth)).toBe(false);
    expect(isValidSubscriptionKeys(undefined, undefined)).toBe(false);
  });
});

describe("message de notification", () => {
  it("contient le numéro, le prénom et le montant, rien d'autre", () => {
    const m = orderMessage({
      id: "0b8f2a52-1111-4222-8333-444455556666",
      order_number: "M1042",
      customer_name: "Sarra Ben Ali",
      total: "89",
      currency: "TND",
    });
    expect(m.title).toBe("Nouvelle commande");
    expect(m.body).toBe("#M1042 · Sarra · 89.00 DT");
    expect(m.orderId).toBe("0b8f2a52-1111-4222-8333-444455556666");
    expect(JSON.stringify(m)).not.toMatch(/Ben Ali|phone|address|email/i);
  });
});

// ---------- Routes ----------

const ORDER_ID = "0b8f2a52-1111-4222-8333-444455556666";
const SECRET = "s".repeat(40);

type Op = { table: string; op: string; filters: [string, unknown][]; values?: unknown };

function makeDb(options: {
  order?: Record<string, unknown> | null;
  devices?: Record<string, unknown>[];
  user?: { id: string; app_metadata: Record<string, unknown> } | null;
}) {
  const log: Op[] = [];
  const from = (table: string) => {
    const q: Op = { table, op: "select", filters: [] };
    const result = () => {
      if (table === "orders") return { data: options.order ?? null, error: null };
      if (table === "admin_push_subscriptions" && q.op === "select") return { data: options.devices ?? [], error: null };
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
      lt: (c: string, v: unknown) => (q.filters.push([`lt:${c}`, v]), builder),
      limit: () => builder,
      maybeSingle: () => (log.push(q), Promise.resolve(result())),
      update: (v: unknown) => ((q.op = "update"), (q.values = v), builder),
      delete: () => ((q.op = "delete"), builder),
      upsert: (v: unknown) => ((q.op = "upsert"), (q.values = v), log.push(q), Promise.resolve({ error: null })),
      then: (resolve: (r: unknown) => unknown) => (log.push(q), Promise.resolve(result()).then(resolve)),
    };
    return builder;
  };
  const db = {
    from,
    auth: {
      getUser: async (token: string) =>
        token === "good-token" && options.user !== null
          ? { data: { user: options.user ?? { id: "admin-1", app_metadata: { role: "admin" } } }, error: null }
          : { data: { user: null }, error: { message: "bad" } },
    },
  };
  return { db, log };
}

async function pushEnv() {
  const vapid = await makeVapid();
  return {
    vapid,
    env: {
      VAPID_PUBLIC_KEY: vapid.keys.publicKey,
      VAPID_PRIVATE_KEY: vapid.keys.privateKey,
      VAPID_SUBJECT: vapid.keys.subject,
      ORDER_WEBHOOK_SECRET: SECRET,
    },
  };
}

const webhook = (headers: Record<string, string>, body: unknown = { order_id: ORDER_ID }) =>
  new Request("https://www.memora.tn/api/internal/order-created", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("POST /api/internal/order-created", () => {
  it("refuse sans secret ou avec un mauvais secret", async () => {
    const { env } = await pushEnv();
    const { db } = makeDb({});
    expect((await routePush(webhook({}), env, { getSupabase: () => db }))!.status).toBe(401);
    expect((await routePush(webhook({ authorization: "Bearer nope" }), env, { getSupabase: () => db }))!.status).toBe(401);
  });

  it("refuse (503) si le secret n'est pas configuré : jamais ouvert par défaut", async () => {
    const { env } = await pushEnv();
    const { db } = makeDb({});
    const res = await routePush(webhook({ authorization: `Bearer ${SECRET}` }), { ...env, ORDER_WEBHOOK_SECRET: "" }, { getSupabase: () => db });
    expect(res!.status).toBe(503);
  });

  it("refuse un identifiant de commande invalide", async () => {
    const { env } = await pushEnv();
    const { db } = makeDb({});
    const res = await routePush(webhook({ authorization: `Bearer ${SECRET}` }, { order_id: "1 OR 1=1" }), env, { getSupabase: () => db });
    expect(res!.status).toBe(400);
  });

  it("envoie la notification chiffrée à chaque appareil", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const { db, log } = makeDb({
      order: { id: ORDER_ID, order_number: "M1042", customer_name: "Sarra Ben Ali", total: 89, currency: "TND" },
      devices: [{ id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...device.keys, failures: 0 }],
    });
    const sent: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => (sent.push({ url, init }), new Response(null, { status: 201 }))) as typeof fetch;

    const res = await routePush(webhook({ authorization: `Bearer ${SECRET}` }), env, { getSupabase: () => db, fetchImpl });
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ sent: 1, removed: 0, failed: 0 });

    expect(sent).toHaveLength(1);
    const headers = sent[0]!.init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Authorization"]).toMatch(/^vapid t=.+, k=/);
    const message = JSON.parse(await decrypt(sent[0]!.init.body as Uint8Array, device));
    expect(message).toMatchObject({ title: "Nouvelle commande", body: "#M1042 · Sarra · 89.00 DT", orderId: ORDER_ID });
    expect(log.some((o) => o.op === "update" && o.table === "admin_push_subscriptions")).toBe(true);
  });

  it("supprime un appareil disparu (410) et compte un échec temporaire", async () => {
    const { env } = await pushEnv();
    const a = await makeDevice();
    const b = await makeDevice();
    const { db, log } = makeDb({
      order: { id: ORDER_ID, order_number: "M1", customer_name: "A", total: 10, currency: "TND" },
      devices: [
        { id: "gone", endpoint: "https://fcm.googleapis.com/fcm/send/gone", ...a.keys, failures: 0 },
        { id: "flaky", endpoint: "https://fcm.googleapis.com/fcm/send/flaky", ...b.keys, failures: 2 },
      ],
    });
    const fetchImpl = (async (url: string) =>
      new Response(null, { status: url.endsWith("/gone") ? 410 : 500 })) as typeof fetch;

    const res = await routePush(webhook({ authorization: `Bearer ${SECRET}` }), env, { getSupabase: () => db, fetchImpl });
    expect(await res!.json()).toEqual({ sent: 0, removed: 1, failed: 1 });
    expect(log.find((o) => o.op === "delete")?.filters).toEqual([["id", "gone"]]);
    expect(log.find((o) => o.op === "update")?.values).toEqual({ failures: 3 });
  });

  it("une panne du service de push ne fait pas échouer la réponse", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const { db } = makeDb({
      order: { id: ORDER_ID, order_number: "M1", customer_name: "A", total: 10, currency: "TND" },
      devices: [{ id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...device.keys, failures: 0 }],
    });
    const fetchImpl = (async () => {
      throw new Error("réseau coupé");
    }) as typeof fetch;
    const res = await routePush(webhook({ authorization: `Bearer ${SECRET}` }), env, { getSupabase: () => db, fetchImpl });
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ sent: 0, removed: 0, failed: 1 });
  });
});

describe("routes /api/admin/push/*", () => {
  const admin = (path: string, method: string, body?: unknown, token = "good-token") =>
    new Request(`https://www.memora.tn/api/admin/push/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it("refuse sans session admin", async () => {
    const { env } = await pushEnv();
    const { db } = makeDb({});
    expect((await routePush(admin("config", "GET", undefined, "bad"), env, { getSupabase: () => db }))!.status).toBe(401);
    const { db: notAdmin } = makeDb({ user: { id: "u", app_metadata: {} } });
    expect((await routePush(admin("config", "GET"), env, { getSupabase: () => notAdmin }))!.status).toBe(403);
  });

  it("donne la clé publique seulement (jamais la clé privée)", async () => {
    const { env, vapid } = await pushEnv();
    const { db } = makeDb({});
    const res = await routePush(admin("config", "GET"), env, { getSupabase: () => db });
    const text = await res!.text();
    expect(JSON.parse(text)).toEqual({ publicKey: vapid.keys.publicKey });
    expect(text).not.toContain(vapid.keys.privateKey);
  });

  it("enregistre un appareil pour l'admin connecté", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const { db, log } = makeDb({});
    const res = await routePush(
      admin("subscribe", "POST", { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: device.keys, user_agent: "Safari" }),
      env,
      { getSupabase: () => db },
    );
    expect(res!.status).toBe(200);
    expect(log.find((o) => o.op === "upsert")?.values).toMatchObject({
      user_id: "admin-1",
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      user_agent: "Safari",
      failures: 0,
    });
  });

  it("refuse un endpoint qui n'est pas un service de push", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const { db, log } = makeDb({});
    const res = await routePush(admin("subscribe", "POST", { endpoint: "https://evil.example.com/x", keys: device.keys }), env, {
      getSupabase: () => db,
    });
    expect(res!.status).toBe(400);
    expect(log.some((o) => o.op === "upsert")).toBe(false);
  });

  it("limite le nombre d'appareils par admin", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, endpoint: `https://fcm.googleapis.com/fcm/send/${i}` }));
    const { db } = makeDb({ devices: many });
    const res = await routePush(
      admin("subscribe", "POST", { endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: device.keys }),
      env,
      { getSupabase: () => db },
    );
    expect(res!.status).toBe(409);
  });

  it("le test n'envoie qu'aux appareils de l'admin qui le demande", async () => {
    const { env } = await pushEnv();
    const device = await makeDevice();
    const { db, log } = makeDb({
      devices: [{ id: "mine", endpoint: "https://fcm.googleapis.com/fcm/send/mine", ...device.keys, failures: 0 }],
    });
    const sent: string[] = [];
    const fetchImpl = (async (url: string) => (sent.push(url), new Response(null, { status: 201 }))) as typeof fetch;
    const res = await routePush(admin("test", "POST"), env, { getSupabase: () => db, fetchImpl });
    expect(await res!.json()).toEqual({ sent: 1, removed: 0, failed: 0 });
    expect(log.find((o) => o.op === "select" && o.table === "admin_push_subscriptions")?.filters).toEqual([["user_id", "admin-1"]]);
    expect(sent).toEqual(["https://fcm.googleapis.com/fcm/send/mine"]);
  });

  it("ne répond pas aux routes qui ne sont pas les siennes", async () => {
    const { env } = await pushEnv();
    const { db } = makeDb({});
    const res = await routePush(new Request("https://www.memora.tn/api/media?key=x"), env, { getSupabase: () => db });
    expect(res).toBeNull();
  });
});
