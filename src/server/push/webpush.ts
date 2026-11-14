/**
 * Envoi d'une notification Web Push (RFC 8030 + chiffrement RFC 8291 aes128gcm + VAPID RFC 8292),
 * avec WebCrypto seulement : aucune dépendance, et le même code tourne sur Node et sur les
 * runtimes « edge ». Testé par src/test/push.test.ts (déchiffrement indépendant) ; le vrai test est le bouton « Tester » de l'admin.
 */

const encoder = new TextEncoder();

export function b64uDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export type PushSubscriptionKeys = { p256dh: string; auth: string };

/** Corps chiffré (RFC 8291) d'un message pour un abonnement. `ephemeral` et `salt` ne servent qu'aux tests. */
export async function encryptPayload(
  subscription: PushSubscriptionKeys,
  payload: Uint8Array,
  options: { ephemeral?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  const uaPublic = b64uDecode(subscription.p256dh);
  const authSecret = b64uDecode(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("Clé p256dh invalide");
  if (authSecret.length !== 16) throw new Error("Secret auth invalide");
  if (payload.length > 3900) throw new Error("Message trop long pour un seul enregistrement");

  const ephemeral =
    options.ephemeral ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 = délimiteur de remplissage du dernier (et seul) enregistrement
  const plaintext = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** En-tête Authorization VAPID pour le service de push qui héberge `endpoint`. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  nowMs: number = Date.now(),
): Promise<string> {
  const publicBytes = b64uDecode(vapid.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error("VAPID_PUBLIC_KEY invalide");

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64uEncode(publicBytes.slice(1, 33)),
      y: b64uEncode(publicBytes.slice(33, 65)),
      d: vapid.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = b64uEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto renvoie déjà la signature brute r||s (64 octets) attendue par JWT.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64uEncode(signature)}, k=${vapid.publicKey}`;
}

export type PushMessage = {
  title: string;
  body: string;
  orderId?: string;
  /** Conversation WhatsApp à ouvrir au clic. */
  conversationId?: string;
  tag?: string;
};

export type SendResult = { status: number; ok: boolean; gone: boolean };

/** Envoie un message à un abonnement. `gone` = l'appareil n'existe plus (à supprimer). */
export async function sendWebPush(
  subscription: PushSubscriptionKeys & { endpoint: string },
  message: PushMessage,
  vapid: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(message)));
  const response = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
    },
    body: body as BodyInit,
    redirect: "error",
  });
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    gone: response.status === 404 || response.status === 410,
  };
}

/** Services de push connus : un abonnement vers un autre hôte est refusé (le serveur n'envoie pas n'importe où). */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "push.apple.com",
  "notify.windows.com",
  "push.services.mozilla.com",
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return PUSH_HOST_SUFFIXES.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
}

export function isValidSubscriptionKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== "string" || typeof auth !== "string") return false;
  try {
    const key = b64uDecode(p256dh);
    return key.length === 65 && key[0] === 4 && b64uDecode(auth).length === 16;
  } catch {
    return false;
  }
}
