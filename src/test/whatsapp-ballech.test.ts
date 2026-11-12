import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  processInbound,
  toChatTurns,
  FALLBACK_MESSAGE,
  type AgentDeps,
} from "../server/whatsapp/agent";
import { handleAdminSend } from "../server/whatsapp/admin";
import { createWhatsAppClient, type WhatsAppClient } from "../server/whatsapp/client";
import { createAnthropicProvider } from "../server/whatsapp/llm/anthropic";
import {
  DEFAULT_GEMINI_MODELS,
  createGeminiProvider,
  resetGeminiCooldowns,
} from "../server/whatsapp/llm/gemini";
import { withRateLimitRetry, type ChatTurn, type LlmProvider } from "../server/whatsapp/llm";
import { storeWhatsAppMedia } from "../server/whatsapp/media";
import type { BallechStore, Conversation, OrderRow, StoredMessage } from "../server/whatsapp/store";
import { normalizeTunisianPhone, orderRecap, validateOrderRequest } from "../server/whatsapp/tools";
import {
  handleWhatsAppWebhook,
  verifyMetaSignature,
  type WebhookDeps,
} from "../server/whatsapp/webhook";

const SECRET = "app-secret";
const WA_PHONE = "21698765432";
const CONFIG = {
  verifyToken: "verify-me",
  appSecret: SECRET,
  accessToken: "token",
  phoneNumberId: "PNID",
  graphVersion: "v23.0",
};

// ---------------------------------------------------------------- fakes

function fakeStore() {
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const conversations = new Map<string, Conversation & { handoff_reason?: string | null }>();
  const messages: StoredMessage[] = [];
  const orders: (OrderRow & { id: string; created_at: string })[] = [];

  const store: BallechStore = {
    async ensureConversation(waPhone, name) {
      const found = [...conversations.values()].find((c) => c.wa_phone === waPhone);
      if (found) return { ...found };
      const c: Conversation = {
        id: uuid(),
        wa_phone: waPhone,
        customer_name: name,
        mode: "bot",
        last_inbound_at: null,
        unread_count: 0,
      };
      conversations.set(c.id, c);
      return { ...c };
    },
    async markInbound(c, at) {
      const cur = conversations.get(c.id)!;
      cur.unread_count += 1;
      cur.last_inbound_at = at.toISOString();
    },
    async insertMessage(m) {
      if (m.wa_message_id && messages.some((x) => x.wa_message_id === m.wa_message_id)) {
        return { inserted: false, id: null };
      }
      const row: StoredMessage = {
        id: uuid(),
        created_at: new Date(Date.now() + messages.length).toISOString(),
        order_id: null,
        ...m,
      } as StoredMessage;
      messages.push(row);
      return { inserted: true, id: row.id };
    },
    async updateMessage(id, patch) {
      Object.assign(
        messages.find((m) => m.id === id)!,
        patch,
      );
    },
    async getConversation(id) {
      const c = conversations.get(id);
      return c ? { ...c } : null;
    },
    async recentMessages(conversationId, limit) {
      return messages.filter((m) => m.conversation_id === conversationId).slice(-limit);
    },
    async setMode(id, mode, reason) {
      Object.assign(conversations.get(id)!, { mode, handoff_reason: reason });
    },
    async touchOutbound() {},
    async createOrder(row) {
      const order = { ...row, id: uuid(), created_at: new Date().toISOString() };
      orders.push(order);
      return { id: order.id, order_number: order.order_number };
    },
    async latestPendingOrder(conversationId) {
      const o = [...orders].reverse().find((x) => x.wa_conversation_id === conversationId);
      return o ? { id: o.id, items: o.items } : null;
    },
    async updateOrderItems(orderId, items) {
      orders.find((o) => o.id === orderId)!.items = items;
    },
    async unlinkedMedia(conversationId) {
      return messages.filter(
        (m) =>
          m.conversation_id === conversationId &&
          m.type !== "text" &&
          m.direction === "in" &&
          !m.order_id,
      );
    },
  };
  return { store, conversations, messages, orders };
}

function fakeClient() {
  const sent: { to: string; body: string }[] = [];
  const client: WhatsAppClient = {
    sendText: vi.fn(async (to: string, body: string) => {
      sent.push({ to, body });
      return { id: `wamid.out.${sent.length}` };
    }),
    getMediaUrl: vi.fn(async () => ({
      url: "https://lookaside.example/media",
      mimeType: "image/jpeg",
      fileSize: 3,
    })),
    downloadMedia: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  return { client, sent };
}

function fakeStorage() {
  const puts: { key: string; contentType?: string | undefined }[] = [];
  return {
    puts,
    storage: {
      headObject: vi.fn(),
      deleteObject: vi.fn(),
      putObject: vi.fn(
        async (key: string, _payload: unknown, options?: { contentType?: string | undefined }) => {
          puts.push({ key, contentType: options?.contentType });
          return { success: true };
        },
      ),
    },
  };
}

/** Fournisseur scripté : chaque appel à send() renvoie le tour suivant. */
function scriptedProvider(
  turns: Array<
    { text?: string; toolCalls?: { name: string; args: Record<string, unknown> }[] } | Error
  >,
) {
  const histories: ChatTurn[][] = [];
  const toolResults: unknown[] = [];
  let call = 0;
  const provider: LlmProvider = {
    name: "gemini",
    model: "test",
    createSession({ history }) {
      histories.push(history);
      return {
        async send() {
          const next = turns[Math.min(call++, turns.length - 1)]!;
          if (next instanceof Error) throw next;
          return {
            text: next.text ?? "",
            toolCalls: (next.toolCalls ?? []).map((t, i) => ({ id: `call-${i}`, ...t })),
          };
        },
        addToolResults(results) {
          toolResults.push(...results);
        },
      };
    },
  };
  return { provider, histories, toolResults, calls: () => call };
}

function rateLimit() {
  return Object.assign(new Error("Too Many Requests"), { status: 429 });
}

const ORDER_ARGS = {
  customer_name: "Amira Ben Salah",
  governorate: "Sousse",
  address: "12 rue de la Plage, Sousse",
  quantity: 2,
  carrier: "aramex",
  language: "derja",
  confirmed_by_customer: true,
};

function sign(body: string) {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function metaPayload(messages: Record<string, unknown>[]) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: { contacts: [{ wa_id: WA_PHONE, profile: { name: "Amira" } }], messages },
          },
        ],
      },
    ],
  });
}

function textMessage(id: string, body: string) {
  return {
    from: WA_PHONE,
    id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body },
  };
}

function webhookRequest(body: string, signature = sign(body)) {
  return new Request("https://www.memora.tn/api/whatsapp/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": signature, "content-type": "application/json" },
    body,
  });
}

function setup(provider: LlmProvider, options: { waitUntil?: WebhookDeps["waitUntil"] } = {}) {
  const db = fakeStore();
  const wa = fakeClient();
  const r2 = fakeStorage();
  const providerFactory = vi.fn(() => provider);
  const agentDeps: AgentDeps = {
    store: db.store,
    client: wa.client,
    provider: providerFactory,
    storage: () => r2.storage,
    retryBackoffMs: 0,
    log: () => {},
  };
  const deps: WebhookDeps = {
    config: CONFIG,
    store: db.store,
    agent: () => agentDeps,
    waitUntil: options.waitUntil,
  };
  return { db, wa, r2, deps, agentDeps, providerFactory };
}

// ---------------------------------------------------------------- webhook

describe("webhook WhatsApp : sécurité et dédoublonnage", () => {
  it("accepte la vérification Meta avec le bon jeton seulement", async () => {
    const { deps } = setup(scriptedProvider([{ text: "ok" }]).provider);
    const ok = await handleWhatsAppWebhook(
      new Request(
        "https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42",
      ),
      deps,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");

    const ko = await handleWhatsAppWebhook(
      new Request(
        "https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42",
      ),
      deps,
    );
    expect(ko.status).toBe(403);
  });

  it("vérifie la signature HMAC X-Hub-Signature-256", async () => {
    const body = metaPayload([textMessage("wamid.1", "salam")]);
    expect(await verifyMetaSignature(SECRET, body, sign(body))).toBe(true);
    expect(await verifyMetaSignature(SECRET, body, sign(`${body} `))).toBe(false);
    expect(await verifyMetaSignature(SECRET, body, null)).toBe(false);

    const { deps, db } = setup(scriptedProvider([{ text: "ok" }]).provider);
    const res = await handleWhatsAppWebhook(webhookRequest(body, "sha256=deadbeef"), deps);
    expect(res.status).toBe(401);
    expect(db.messages).toHaveLength(0);
  });

  it("n'enregistre et ne traite qu'une fois un message renvoyé par Meta", async () => {
    const script = scriptedProvider([{ text: "Ahla! Kifech najjem n3awnek?" }]);
    const { deps, db, wa } = setup(script.provider);
    const body = metaPayload([textMessage("wamid.1", "salam")]);

    expect((await (await handleWhatsAppWebhook(webhookRequest(body), deps)).json()).received).toBe(
      1,
    );
    expect((await (await handleWhatsAppWebhook(webhookRequest(body), deps)).json()).received).toBe(
      0,
    );

    expect(db.messages.filter((m) => m.direction === "in")).toHaveLength(1);
    expect(wa.sent).toEqual([{ to: WA_PHONE, body: "Ahla! Kifech najjem n3awnek?" }]);
    expect([...db.conversations.values()][0]!.unread_count).toBe(1);
  });

  it("répond 200 avant la fin du traitement de l'agent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: LlmProvider = {
      name: "gemini",
      model: "test",
      createSession: () => ({
        async send() {
          await gate;
          return { text: "réponse tardive", toolCalls: [] };
        },
        addToolResults() {},
      }),
    };
    const background: Promise<unknown>[] = [];
    const { deps, wa } = setup(slow, { waitUntil: (p) => background.push(p) });

    const res = await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.9", "prix?")])),
      deps,
    );
    expect(res.status).toBe(200);
    expect(background).toHaveLength(1);
    expect(wa.sent).toHaveLength(0); // l'agent tourne encore

    release();
    await Promise.all(background);
    expect(wa.sent.map((s) => s.body)).toEqual(["réponse tardive"]);
  });

  it("ne fait aucun appel LLM quand l'équipe a la main", async () => {
    const script = scriptedProvider([{ text: "ne doit pas partir" }]);
    const { deps, db, wa, providerFactory } = setup(script.provider);
    const conversation = await db.store.ensureConversation(WA_PHONE, "Amira");
    await db.store.setMode(conversation.id, "human", "test");

    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.2", "allo?")])),
      deps,
    );
    expect(providerFactory).not.toHaveBeenCalled();
    expect(wa.sent).toHaveLength(0);
    expect(db.messages).toHaveLength(1); // le message est quand même visible dans l'inbox
  });
});

// ---------------------------------------------------------------- commande

describe("create_order_request", () => {
  it("prend le numéro WhatsApp par défaut et calcule le prix côté serveur", () => {
    const result = validateOrderRequest(ORDER_ARGS, WA_PHONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.customer_phone).toBe("+216 98765432");
    // 2 × 49 DT + Aramex 8 DT
    expect(result.order.quote.total).toBe(106);
  });

  it("accepte un autre numéro seulement s'il a 8 chiffres", () => {
    const other = validateOrderRequest({ ...ORDER_ARGS, phone: "22 111 333" }, WA_PHONE);
    expect(other.ok && other.order.customer_phone).toBe("+216 22111333");
    expect(validateOrderRequest({ ...ORDER_ARGS, phone: "12345" }, WA_PHONE).ok).toBe(false);
    expect(normalizeTunisianPhone("+216 98 765 432")).toBe("+216 98765432");
  });

  it("refuse un gouvernorat inconnu ou une commande non confirmée", () => {
    expect(validateOrderRequest({ ...ORDER_ARGS, governorate: "Paris" }, WA_PHONE).ok).toBe(false);
    expect(validateOrderRequest({ ...ORDER_ARGS, confirmed_by_customer: false }, WA_PHONE).ok).toBe(
      false,
    );
  });

  it("rédige le récapitulatif dans la langue du client", () => {
    const base = validateOrderRequest(ORDER_ARGS, WA_PHONE);
    if (!base.ok) throw new Error("commande invalide");
    expect(orderRecap(base.order, "WA-1", true)).toMatch(/tsajlet/);
    expect(orderRecap({ ...base.order, language: "en" }, "WA-1", true)).toMatch(
      /Order WA-1 registered/,
    );
    expect(orderRecap({ ...base.order, language: "ar" }, "WA-1", true)).toMatch(/تسجّلت/);
    expect(orderRecap({ ...base.order, language: "fr" }, "WA-1", false)).toMatch(
      /Envoyez-nous ici la photo/,
    );
  });

  it("crée la commande avec les médias reçus, media_status 'received' et envoie le récap", async () => {
    const script = scriptedProvider([
      { toolCalls: [{ name: "create_order_request", args: ORDER_ARGS }] },
      { text: "Yaatik essa7a!" },
    ]);
    const { deps, db, wa, r2 } = setup(script.provider);
    const image = {
      from: WA_PHONE,
      id: "wamid.img",
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "image",
      image: { id: "MEDIA1", mime_type: "image/jpeg" },
    };
    await handleWhatsAppWebhook(webhookRequest(metaPayload([image])), deps);
    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.ok", "ey nconfirmi")])),
      deps,
    );

    expect(db.orders).toHaveLength(1);
    const order = db.orders[0]!;
    expect(order).toMatchObject({
      source: "whatsapp",
      status: "pending",
      currency: "TND",
      total: 106,
    });
    expect(order.customer_phone).toBe("+216 98765432");
    expect(order.items[0]).toMatchObject({ media_status: "received", qty: 2 });
    expect((order.items[0]!["media"] as unknown[])[0]).toMatchObject({
      kind: "photo",
      storage_key: r2.puts[0]!.key,
    });
    expect(db.messages.find((m) => m.wa_message_id === "wamid.img")!.order_id).toBe(order.id);
    expect(
      wa.sent.some((s) => s.body.includes(order.order_number) && s.body.includes("106 DT")),
    ).toBe(true);
    expect(wa.sent[wa.sent.length - 1]!.body).toBe("Yaatik essa7a!");
  });

  it("marque 'pending_whatsapp' sans photo", async () => {
    const script = scriptedProvider([
      { toolCalls: [{ name: "create_order_request", args: ORDER_ARGS }] },
      { text: "" },
    ]);
    const { deps, db } = setup(script.provider);
    await handleWhatsAppWebhook(webhookRequest(metaPayload([textMessage("wamid.ok", "ey")])), deps);
    expect(db.orders[0]!.items[0]).toMatchObject({ media_status: "pending_whatsapp" });
  });
});

// ---------------------------------------------------------------- médias

describe("médias WhatsApp", () => {
  it("récupère l'URL via Graph API, télécharge avec le jeton et range dans R2", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer token");
      if (href === "https://graph.facebook.com/v23.0/MEDIA1") {
        return new Response(
          JSON.stringify({
            url: "https://lookaside.fbsbx.com/x",
            mime_type: "video/mp4",
            file_size: 4,
          }),
        );
      }
      if (href === "https://lookaside.fbsbx.com/x")
        return new Response(new Uint8Array([9, 9, 9, 9]));
      return new Response("not found", { status: 404 });
    });
    const client = createWhatsAppClient(CONFIG, fetchMock as unknown as typeof fetch);
    const r2 = fakeStorage();

    const media = await storeWhatsAppMedia({
      client,
      storage: r2.storage,
      mediaId: "MEDIA1",
      type: "video",
      conversationId: "11111111-1111-4111-8111-111111111111",
      messageId: "22222222-2222-4222-8222-222222222222",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(media).toMatchObject({
      storage_key:
        "whatsapp/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4",
      mime: "video/mp4",
      size: 4,
    });
    expect(r2.puts).toEqual([{ key: media.storage_key, contentType: "video/mp4" }]);
  });

  it("refuse un type de fichier inattendu", async () => {
    const { client } = fakeClient();
    (client.getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "u",
      mimeType: "application/x-msdownload",
      fileSize: 10,
    });
    await expect(
      storeWhatsAppMedia({
        client,
        storage: fakeStorage().storage,
        mediaId: "M",
        type: "document",
        conversationId: "c",
        messageId: "m",
      }),
    ).rejects.toThrow(/refusé/);
  });

  it("n'envoie au LLM qu'un marqueur, jamais le fichier ni son lien", async () => {
    const script = scriptedProvider([{ text: "wsolt el taswira ✅" }]);
    const { deps, wa } = setup(script.provider);
    const image = {
      from: WA_PHONE,
      id: "wamid.img2",
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "image",
      image: { id: "MEDIA9", mime_type: "image/jpeg", caption: "hedhi el taswira" },
    };
    await handleWhatsAppWebhook(webhookRequest(metaPayload([image])), deps);

    const sentToLlm = JSON.stringify(script.histories);
    expect(script.histories[0]).toEqual([{ role: "user", text: "[photo reçue] hedhi el taswira" }]);
    expect(sentToLlm).not.toContain("whatsapp/");
    expect(sentToLlm).not.toContain("lookaside");
    expect(sentToLlm).not.toContain("MEDIA9");
    expect(wa.sent[0]!.body).toBe("wsolt el taswira ✅");
  });

  it("garde le texte de la conversation (nom, adresse) dans l'historique", () => {
    const turns = toChatTurns([
      {
        id: "1",
        conversation_id: "c",
        wa_message_id: "w",
        direction: "in",
        author: "customer",
        type: "text",
        body: "Amira, 12 rue de la Plage",
        payload: {},
        order_id: null,
        created_at: "",
      },
      {
        id: "2",
        conversation_id: "c",
        wa_message_id: "w2",
        direction: "out",
        author: "admin",
        type: "text",
        body: "Behi",
        payload: {},
        order_id: null,
        created_at: "",
      },
    ]);
    expect(turns).toEqual([
      { role: "user", text: "Amira, 12 rue de la Plage" },
      { role: "assistant", text: "Behi" },
    ]);
  });
});

// ---------------------------------------------------------------- fournisseurs

describe("fournisseurs LLM : Gemini et Anthropic", () => {
  function geminiProvider() {
    let step = 0;
    const generateContent = vi.fn(async () => {
      step++;
      if (step === 1) {
        const call = { id: "g1", name: "create_order_request", args: ORDER_ARGS };
        return {
          candidates: [
            {
              content: { role: "model", parts: [{ functionCall: call, thoughtSignature: "sig" }] },
            },
          ],
          functionCalls: [call],
        };
      }
      return {
        candidates: [{ content: { role: "model", parts: [{ text: "Merci!" }] } }],
        functionCalls: undefined,
      };
    });
    return {
      generateContent,
      provider: createGeminiProvider({ apiKey: "k", generateContent: generateContent as never }),
    };
  }

  function anthropicProvider() {
    let step = 0;
    const createMessage = vi.fn(async () => {
      step++;
      if (step === 1) {
        return {
          content: [
            { type: "tool_use", id: "a1", name: "create_order_request", input: ORDER_ARGS },
          ],
          stop_reason: "tool_use",
        };
      }
      return { content: [{ type: "text", text: "Merci!" }], stop_reason: "end_turn" };
    });
    return {
      createMessage,
      provider: createAnthropicProvider({ apiKey: "k", createMessage: createMessage as never }),
    };
  }

  async function runWith(provider: LlmProvider) {
    const { deps, db, wa } = setup(provider);
    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.c", "ey confirmé")])),
      deps,
    );
    const { order_number: _n, ...order } = db.orders[0]!;
    return {
      order: { ...order, id: "x", created_at: "x", wa_conversation_id: "x" },
      last: wa.sent[wa.sent.length - 1]!.body,
    };
  }

  it("mêmes appels d'outils → même commande", async () => {
    const gemini = geminiProvider();
    const anthropic = anthropicProvider();
    const a = await runWith(gemini.provider);
    const b = await runWith(anthropic.provider);
    expect(a).toEqual(b);
    expect(a.order.total).toBe(106);
    expect(a.last).toBe("Merci!");
  });

  it("renvoie le contenu du modèle (signature de pensée) et le résultat de l'outil à Gemini", async () => {
    const gemini = geminiProvider();
    await runWith(gemini.provider);
    const second = (
      gemini.generateContent.mock.calls as unknown as [
        { contents: { role: string; parts: Record<string, unknown>[] }[] },
      ][]
    )[1]![0];
    // Le tableau est partagé (mutation après l'appel) : on cherche la réponse d'outil.
    const at = second.contents.findIndex((c) => "functionResponse" in (c.parts[0] ?? {}));
    expect(second.contents[at - 1]!.parts[0]).toMatchObject({ thoughtSignature: "sig" });
    expect(second.contents[at]!.parts[0]).toMatchObject({
      functionResponse: { id: "g1", name: "create_order_request" },
    });
  });

  it("envoie le tool_result attendu par Anthropic", async () => {
    const anthropic = anthropicProvider();
    await runWith(anthropic.provider);
    const second = (
      anthropic.createMessage.mock.calls as unknown as [
        { messages: { role: string; content: unknown }[] },
      ][]
    )[1]![0];
    // Le tableau est partagé (mutation après l'appel) : on cherche le tour tool_result.
    const last = second.messages.find(
      (m) =>
        Array.isArray(m.content) && (m.content as { type: string }[])[0]?.type === "tool_result",
    )!;
    expect(last.role).toBe("user");
    expect((last.content as { type: string; tool_use_id: string }[])[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "a1",
    });
  });
});

// ---------------------------------------------------------------- 429

describe("limite de débit (429)", () => {
  it("réessaie une fois après un délai", async () => {
    const wait = vi.fn(async () => {});
    let calls = 0;
    const value = await withRateLimitRetry(
      async () => {
        calls++;
        if (calls === 1) throw rateLimit();
        return "ok";
      },
      { wait, backoffMs: 1500 },
    );
    expect(value).toBe("ok");
    expect(wait).toHaveBeenCalledWith(1500);
  });

  it("répond normalement si le second essai passe", async () => {
    const script = scriptedProvider([rateLimit(), { text: "Ahla!" }]);
    const { deps, wa, db } = setup(script.provider);
    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.r", "salam")])),
      deps,
    );
    expect(script.calls()).toBe(2);
    expect(wa.sent.map((s) => s.body)).toEqual(["Ahla!"]);
    expect([...db.conversations.values()][0]!.mode).toBe("bot");
  });

  it("envoie le message de secours et passe à l'humain après deux 429", async () => {
    const script = scriptedProvider([rateLimit(), rateLimit(), { text: "trop tard" }]);
    const { deps, wa, db } = setup(script.provider);
    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.r2", "salam")])),
      deps,
    );
    expect(script.calls()).toBe(2);
    expect(wa.sent.map((s) => s.body)).toEqual([FALLBACK_MESSAGE]);
    expect([...db.conversations.values()][0]).toMatchObject({ mode: "human" });
  });

  it("passe à l'humain quand le client le demande", async () => {
    const script = scriptedProvider([
      {
        text: "Behi, n3adik l'équipe",
        toolCalls: [{ name: "handoff_to_human", args: { reason: "demande un humain" } }],
      },
    ]);
    const { deps, wa, db } = setup(script.provider);
    await handleWhatsAppWebhook(
      webhookRequest(metaPayload([textMessage("wamid.h", "nheb nahki m3a 3abd")])),
      deps,
    );
    expect([...db.conversations.values()][0]).toMatchObject({
      mode: "human",
      handoff_reason: "demande un humain",
    });
    expect(wa.sent.map((s) => s.body)).toEqual(["Behi, n3adik l'équipe"]);
  });
});

// ---------------------------------------------------------------- admin

describe("POST /api/admin/whatsapp/send", () => {
  const admin = { app_metadata: { role: "admin" } };
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: admin }, error: null })) },
  };

  async function sendAs(lastInbound: string | null) {
    const db = fakeStore();
    const wa = fakeClient();
    const c = await db.store.ensureConversation(WA_PHONE, "Amira");
    db.conversations.get(c.id)!.last_inbound_at = lastInbound;
    const res = await handleAdminSend(
      new Request("https://x/api/admin/whatsapp/send", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ conversation_id: c.id, text: "Salam, ena Sarra mel équipe" }),
      }),
      {
        getSupabase: () => supabase,
        store: () => db.store,
        client: () => wa.client,
        signMediaUrl: async () => null,
      },
    );
    return { res, db, wa, id: c.id };
  }

  it("envoie la réponse et met Ballech en pause", async () => {
    const { res, db, wa, id } = await sendAs(new Date().toISOString());
    expect(res.status).toBe(200);
    expect(wa.sent).toEqual([{ to: WA_PHONE, body: "Salam, ena Sarra mel équipe" }]);
    expect(db.messages[0]).toMatchObject({ author: "admin", direction: "out" });
    expect(db.conversations.get(id)!.mode).toBe("human");
  });

  it("refuse hors de la fenêtre de 24 h", async () => {
    const { res, wa } = await sendAs(new Date(Date.now() - 25 * 3600 * 1000).toISOString());
    expect(res.status).toBe(409);
    expect(wa.sent).toHaveLength(0);
  });

  it("exige un administrateur", async () => {
    const res = await handleAdminSend(
      new Request("https://x/api/admin/whatsapp/send", { method: "POST", body: "{}" }),
      {
        getSupabase: () => supabase,
        store: () => fakeStore().store,
        client: () => fakeClient().client,
        signMediaUrl: async () => null,
      },
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------- modèles Gemini

describe("Gemini : choix du modèle", () => {
  const overloaded = () => Object.assign(new Error("high demand"), { status: 503 });
  const textReply = (text: string) => ({
    candidates: [{ content: { role: "model", parts: [{ text }] } }],
    functionCalls: undefined,
  });

  it("passe au modèle suivant si le premier est surchargé, puis le met de côté", async () => {
    resetGeminiCooldowns();
    const models: string[] = [];
    const generateContent = vi.fn(async ({ model }: { model: string }) => {
      models.push(model);
      if (model === DEFAULT_GEMINI_MODELS[0]) throw overloaded();
      return textReply(`ok ${model}`);
    });
    const provider = createGeminiProvider({
      apiKey: "k",
      generateContent: generateContent as never,
    });

    const first = await provider
      .createSession({ system: "s", history: [{ role: "user", text: "salam" }], tools: [] })
      .send();
    expect(first.text).toBe(`ok ${DEFAULT_GEMINI_MODELS[1]}`);

    // Message suivant : le modèle surchargé n'est pas réessayé pendant le délai.
    models.length = 0;
    await provider
      .createSession({ system: "s", history: [{ role: "user", text: "salam" }], tools: [] })
      .send();
    expect(models).toEqual([DEFAULT_GEMINI_MODELS[1]]);
  });

  it("garde le même modèle pendant toute la boucle d'outils", async () => {
    resetGeminiCooldowns();
    const models: string[] = [];
    const generateContent = vi.fn(async ({ model }: { model: string }) => {
      models.push(model);
      return textReply("ok");
    });
    const session = createGeminiProvider({
      apiKey: "k",
      model: "gemini-test",
      generateContent: generateContent as never,
    }).createSession({ system: "s", history: [{ role: "user", text: "salam" }], tools: [] });
    await session.send();
    session.addToolResults([{ id: "1", name: "x", result: {} }]);
    await session.send();
    expect(models).toEqual(["gemini-test", "gemini-test"]);
  });

  it("ne change pas de modèle sur une erreur de requête (400)", async () => {
    resetGeminiCooldowns();
    const generateContent = vi.fn(async () => {
      throw Object.assign(new Error("bad request"), { status: 400 });
    });
    const session = createGeminiProvider({
      apiKey: "k",
      generateContent: generateContent as never,
    }).createSession({ system: "s", history: [{ role: "user", text: "salam" }], tools: [] });
    await expect(session.send()).rejects.toThrow("bad request");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini : délai dépassé", () => {
  it("passe au modèle suivant quand un modèle ne répond pas à temps", async () => {
    resetGeminiCooldowns();
    const generateContent = vi.fn(async ({ model }: { model: string }) => {
      if (model === DEFAULT_GEMINI_MODELS[0])
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      return { candidates: [{ content: { role: "model", parts: [{ text: model }] } }] };
    });
    const turn = await createGeminiProvider({
      apiKey: "k",
      generateContent: generateContent as never,
    })
      .createSession({ system: "s", history: [{ role: "user", text: "salam" }], tools: [] })
      .send();
    expect(turn.text).toBe(DEFAULT_GEMINI_MODELS[1]);
  });
});
