/**
 * Ballech : traitement d'un message entrant, après la réponse 200 au webhook.
 * 1. médias → R2 (et rattachement à la commande en cours) ;
 * 2. mode « human » → Ballech se tait ;
 * 3. sinon l'agent LLM répond, avec deux outils : commande et passage à l'humain.
 */
import type { R2StorageAdapter } from "../../lib/r2-backend";
import type { WhatsAppClient } from "./client";
import { buildSystemPrompt } from "./knowledge";
import {
  withRateLimitRetry,
  type ChatTurn,
  type LlmProvider,
  type ToolCall,
  type ToolResult,
} from "./llm";
import { storeWhatsAppMedia } from "./media";
import type { BallechStore, Conversation, MediaInfo, MessageType, StoredMessage } from "./store";
import { TOOL_DEFINITIONS, orderRecap, validateOrderRequest } from "./tools";

export const HISTORY_LIMIT = 20;
export const MAX_TOOL_ROUNDS = 3;
/** Un média reçu est rattaché à une commande WhatsApp en attente créée dans ce délai. */
export const ORDER_MEDIA_WINDOW_MS = 48 * 60 * 60 * 1000;

export const FALLBACK_MESSAGE =
  "Sorry, Ballech ma najjamch ijawbek taw 🙏 Wa7ed mel équipe Mémora bech yjawbek 9rib.\n" +
  "Désolé, je ne peux pas répondre pour l'instant : un membre de l'équipe Mémora vous répond très vite.";

export const HANDOFF_MESSAGE =
  "Behi, n3adik l wa7ed mel équipe Mémora, yjawbek 9rib 🙌\n" +
  "Je passe la main à un membre de l'équipe Mémora, il vous répond très vite.";

export type AgentDeps = {
  store: BallechStore;
  client: WhatsAppClient;
  /** Construit à la demande : une clé manquante ne casse que le traitement LLM. */
  provider: () => LlmProvider | Promise<LlmProvider>;
  storage: () => R2StorageAdapter;
  now?: () => Date;
  retryBackoffMs?: number;
  log?: (message: string, error?: unknown) => void;
};

export type InboundJob = {
  conversationId: string;
  messageId: string;
  type: MessageType;
  mediaId?: string | undefined;
  caption?: string | undefined;
  /** false pour les messages d'un lot suivis d'un autre message du même client : une seule réponse. */
  respond?: boolean | undefined;
};

const MEDIA_MARKERS: Record<MessageType, string> = {
  text: "",
  image: "[photo reçue]",
  video: "[vidéo reçue]",
  audio: "[message vocal reçu]",
  document: "[document reçu]",
  other: "[message non pris en charge reçu]",
};

/** Genre du média pour la commande : un « document » image compte comme une photo. */
function mediaKind(
  type: MessageType,
  media: MediaInfo | undefined,
): "photo" | "video" | "audio" | "document" {
  const mime = media?.mime ?? "";
  if (type === "image" || mime.startsWith("image/")) return "photo";
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "audio") return "audio";
  return "document";
}

/**
 * Historique envoyé au LLM : le texte de la conversation tel quel (nom, adresse… l'agent
 * en a besoin), mais jamais les fichiers médias, remplacés par un marqueur.
 */
export function toChatTurns(messages: StoredMessage[]): ChatTurn[] {
  return messages.map((m) => {
    const marker = MEDIA_MARKERS[m.type] ?? "";
    const caption = m.type === "text" ? "" : (m.payload?.media?.caption ?? "");
    const text = m.type === "text" ? (m.body ?? "") : [marker, caption].filter(Boolean).join(" ");
    return { role: m.author === "customer" ? "user" : "assistant", text };
  });
}

type ItemMedia = { kind: string; storage_key: string; mime: string; message_id: string };

/** Ajoute des médias au premier article et recalcule media_status. */
export function attachMediaToItems(
  items: Array<Record<string, unknown>>,
  media: ItemMedia[],
): Array<Record<string, unknown>> {
  const [first, ...rest] = items.length ? items : [{}];
  const existing = (Array.isArray(first!["media"]) ? first!["media"] : []) as ItemMedia[];
  const known = new Set(existing.map((m) => m.storage_key));
  const all = [...existing, ...media.filter((m) => !known.has(m.storage_key))];
  const hasPhoto = all.some((m) => m.kind === "photo");
  return [
    { ...first, media: all, media_status: hasPhoto ? "received" : "pending_whatsapp" },
    ...rest,
  ];
}

function itemMediaFrom(messages: StoredMessage[]): ItemMedia[] {
  return messages
    .filter((m) => m.payload?.media?.storage_key)
    .map((m) => ({
      kind: mediaKind(m.type, m.payload.media),
      storage_key: m.payload.media!.storage_key,
      mime: m.payload.media!.mime,
      message_id: m.id,
    }));
}

function newOrderNumber(now: Date): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => (b % 36).toString(36))
    .join("")
    .toUpperCase();
  return `WA-${d}-${random}`;
}

export async function processInbound(deps: AgentDeps, job: InboundJob): Promise<void> {
  const log =
    deps.log ??
    ((message: string, error?: unknown) => console.error(`[ballech] ${message}`, error ?? ""));
  const now = deps.now ?? (() => new Date());

  const conversation = await deps.store.getConversation(job.conversationId);
  if (!conversation) return log(`conversation ${job.conversationId} introuvable`);

  // 1. Média : téléchargé tout de suite, quel que soit le mode (l'équipe le voit dans l'inbox).
  let mediaFailed = false;
  if (job.mediaId) {
    try {
      const media = await storeWhatsAppMedia({
        client: deps.client,
        storage: deps.storage(),
        mediaId: job.mediaId,
        type: job.type,
        conversationId: conversation.id,
        messageId: job.messageId,
        caption: job.caption,
      });
      const order = await deps.store.latestPendingOrder(
        conversation.id,
        new Date(now().getTime() - ORDER_MEDIA_WINDOW_MS),
      );
      await deps.store.updateMessage(job.messageId, {
        payload: { media_id: job.mediaId, media },
        ...(order ? { order_id: order.id } : {}),
      });
      if (order) {
        const kind = mediaKind(job.type, media);
        await deps.store.updateOrderItems(
          order.id,
          attachMediaToItems(order.items, [
            { kind, storage_key: media.storage_key, mime: media.mime, message_id: job.messageId },
          ]),
        );
      }
    } catch (error) {
      mediaFailed = true;
      log("média non récupéré", error);
      await deps.store
        .updateMessage(job.messageId, {
          payload: {
            media_id: job.mediaId,
            media_error: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => undefined);
    }
  }

  // 2. L'équipe a la main : Ballech ne répond pas.
  if (conversation.mode === "human") return;
  if (job.respond === false && !mediaFailed) return;

  if (mediaFailed) {
    await handOff(
      deps,
      conversation,
      "Média reçu mais non récupéré : le redemander au client",
      HANDOFF_MESSAGE,
    );
    return;
  }

  // 3. Agent LLM.
  try {
    await runAgent(deps, conversation, now);
  } catch (error) {
    log("agent en échec, passage à l'humain", error);
    await handOff(deps, conversation, "Ballech indisponible (erreur LLM)", FALLBACK_MESSAGE).catch(
      (e) => log("message de secours non envoyé", e),
    );
  }
}

async function sendBotMessage(
  deps: AgentDeps,
  conversation: Conversation,
  text: string,
  orderId?: string,
): Promise<void> {
  const sent = await deps.client.sendText(conversation.wa_phone, text);
  await deps.store.insertMessage({
    conversation_id: conversation.id,
    wa_message_id: sent.id,
    direction: "out",
    author: "bot",
    type: "text",
    body: text,
    payload: {},
    ...(orderId ? { order_id: orderId } : {}),
  });
  await deps.store.touchOutbound(conversation.id, (deps.now ?? (() => new Date()))());
}

async function handOff(
  deps: AgentDeps,
  conversation: Conversation,
  reason: string,
  message: string,
) {
  await deps.store.setMode(conversation.id, "human", reason);
  await sendBotMessage(deps, conversation, message);
}

async function runAgent(
  deps: AgentDeps,
  conversation: Conversation,
  now: () => Date,
): Promise<void> {
  const history = toChatTurns(await deps.store.recentMessages(conversation.id, HISTORY_LIMIT));
  const session = (await deps.provider()).createSession({
    system: buildSystemPrompt(),
    history,
    tools: TOOL_DEFINITIONS,
  });

  let reply = "";
  let orderCreated = false;
  let handedOff = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await withRateLimitRetry(() => session.send(), {
      backoffMs: deps.retryBackoffMs ?? 2000,
    });
    if (turn.text) reply = turn.text;
    if (!turn.toolCalls.length) break;

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      const result = await executeTool(deps, conversation, call, now, orderCreated);
      if (call.name === "create_order_request" && result["ok"] === true) orderCreated = true;
      if (call.name === "handoff_to_human") handedOff = true;
      results.push({ id: call.id, name: call.name, result });
    }
    if (handedOff) break;
    session.addToolResults(results);
  }

  if (handedOff) {
    await sendBotMessage(deps, conversation, reply || HANDOFF_MESSAGE);
    return;
  }
  // Après une commande, le récap officiel est déjà parti : une phrase de plus suffit.
  if (reply) await sendBotMessage(deps, conversation, reply);
  else if (!orderCreated) throw new Error("Réponse vide du modèle");
}

async function executeTool(
  deps: AgentDeps,
  conversation: Conversation,
  call: ToolCall,
  now: () => Date,
  alreadyOrdered: boolean,
): Promise<Record<string, unknown>> {
  if (call.name === "handoff_to_human") {
    const reason = String(call.args["reason"] ?? "Demande du client").slice(0, 300);
    await deps.store.setMode(conversation.id, "human", reason);
    return { ok: true };
  }

  if (call.name !== "create_order_request")
    return { ok: false, error: `Outil inconnu : ${call.name}` };
  if (alreadyOrdered) return { ok: false, error: "Commande déjà enregistrée dans ce message." };

  const validation = validateOrderRequest(call.args, conversation.wa_phone);
  if (!validation.ok) return { ok: false, error: validation.error };
  const order = validation.order;

  const mediaMessages = await deps.store.unlinkedMedia(conversation.id);
  const media = itemMediaFrom(mediaMessages);
  const items = attachMediaToItems(
    [
      {
        id: "wa-1",
        productId: "p1",
        format: "10x15",
        withFrame: order.with_frame,
        qty: order.quantity,
        ...(order.card_message ? { cardMessage: order.card_message } : {}),
      },
    ],
    media,
  );
  const hasPhoto = media.some((m) => m.kind === "photo");

  const created = await deps.store.createOrder({
    order_number: newOrderNumber(now()),
    customer_name: order.customer_name,
    customer_email: "whatsapp@memora.tn",
    customer_phone: order.customer_phone,
    shipping_address: {
      address: order.address,
      postalCode: "",
      city: order.governorate,
      country: "TN",
      carrier: order.carrier,
      recipient: order.customer_name,
      ...(order.notes ? { notes: order.notes } : {}),
    },
    items,
    subtotal: order.quote.itemsSubtotal + order.quote.framesSubtotal,
    shipping_fee: order.quote.shippingCost,
    total: order.quote.total,
    currency: "TND",
    status: "pending",
    source: "whatsapp",
    wa_conversation_id: conversation.id,
  });

  for (const m of mediaMessages) {
    if (m.payload?.media?.storage_key)
      await deps.store.updateMessage(m.id, { order_id: created.id });
  }

  await sendBotMessage(
    deps,
    conversation,
    orderRecap(order, created.order_number, hasPhoto),
    created.id,
  );
  return {
    ok: true,
    order_number: created.order_number,
    total_tnd: order.quote.total,
    recap_sent_to_customer: true,
    photo_received: hasPhoto,
  };
}
