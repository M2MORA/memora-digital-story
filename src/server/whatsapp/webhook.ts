/**
 * Webhook WhatsApp Cloud API : /api/whatsapp/webhook
 * GET  → vérification de l'abonnement par Meta (hub.challenge).
 * POST → signature vérifiée, message dédupliqué et enregistré, 200 immédiat,
 *        puis traitement (média + agent) en arrière-plan.
 */
import { timingSafeCompare } from "../../lib/r2-backend";
import { processInbound, type AgentDeps, type InboundJob } from "./agent";
import type { WhatsAppConfig } from "./env";
import type { BallechStore, MessageType } from "./store";

type MetaMedia = { id?: string; caption?: string; mime_type?: string };
type MetaMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MetaMedia;
  video?: MetaMedia;
  audio?: MetaMedia;
  document?: MetaMedia & { filename?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};
type MetaChangeValue = {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: MetaMessage[];
};
type MetaPayload = {
  object?: string;
  entry?: { changes?: { field?: string; value?: MetaChangeValue }[] }[];
};

const MEDIA_TYPES = ["image", "video", "audio", "document"] as const;

export type WebhookDeps = {
  config: WhatsAppConfig;
  store: BallechStore;
  agent: () => AgentDeps;
  /** Planifie un travail après la réponse (waitUntil du runtime). Absent : traité avant la réponse. */
  waitUntil?: ((promise: Promise<unknown>) => void) | undefined;
  now?: () => Date;
};

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, corps brut). */
export async function verifyMetaSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeCompare(header.slice("sha256=".length).toLowerCase(), expected);
}

/** Retrouve le waitUntil du runtime : Cloudflare (ctx) ou Vercel (contexte de requête). */
export function runtimeWaitUntil(ctx: unknown): ((promise: Promise<unknown>) => void) | undefined {
  const fromCtx = (ctx as { waitUntil?: unknown } | null | undefined)?.waitUntil;
  if (typeof fromCtx === "function")
    return (p) => (fromCtx as (p: Promise<unknown>) => void).call(ctx, p);

  const vercel = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined;
  const vercelWaitUntil = vercel?.get?.()?.waitUntil;
  return typeof vercelWaitUntil === "function" ? vercelWaitUntil : undefined;
}

function classify(
  message: MetaMessage,
): { type: MessageType; body: string | null; media?: MetaMedia } | null {
  switch (message.type) {
    case "text":
      return { type: "text", body: message.text?.body ?? "" };
    case "button":
      return { type: "text", body: message.button?.text ?? "" };
    case "interactive":
      return {
        type: "text",
        body:
          message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "",
      };
    case "reaction":
      return null; // un emoji posé sur un message : rien à traiter
    default: {
      const mediaType = MEDIA_TYPES.find((t) => t === message.type);
      if (mediaType) {
        const media = message[mediaType];
        return { type: mediaType, body: media?.caption ?? null, ...(media ? { media } : {}) };
      }
      return { type: "other", body: null };
    }
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleWhatsAppWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (
      mode === "subscribe" &&
      deps.config.verifyToken &&
      (await timingSafeCompare(token, deps.config.verifyToken))
    ) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return json(403, { error: "Vérification refusée" });
  }

  if (!deps.config.appSecret) return json(500, { error: "WHATSAPP_APP_SECRET non configuré" });
  const raw = await request.text();
  if (
    !(await verifyMetaSignature(
      deps.config.appSecret,
      raw,
      request.headers.get("x-hub-signature-256"),
    ))
  ) {
    return json(401, { error: "Signature invalide" });
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(raw) as MetaPayload;
  } catch {
    return json(400, { error: "JSON invalide" });
  }

  const now = deps.now ?? (() => new Date());
  const jobs: InboundJob[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      // Les accusés de lecture/livraison (value.statuses) sont ignorés en V1.
      for (const message of value?.messages ?? []) {
        if (!message.from || !message.id) continue;
        const classified = classify(message);
        if (!classified) continue;

        const name = value?.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null;
        const conversation = await deps.store.ensureConversation(message.from, name);
        const inserted = await deps.store.insertMessage({
          conversation_id: conversation.id,
          wa_message_id: message.id,
          direction: "in",
          author: "customer",
          type: classified.type,
          body: classified.body,
          payload: classified.media?.id ? { media_id: classified.media.id } : {},
        });
        if (!inserted.inserted || !inserted.id) continue; // Meta a renvoyé un message déjà traité

        const at = message.timestamp ? new Date(Number(message.timestamp) * 1000) : now();
        await deps.store.markInbound(
          { ...conversation, customer_name: conversation.customer_name || name },
          at,
        );
        jobs.push({
          conversationId: conversation.id,
          messageId: inserted.id,
          type: classified.type,
          mediaId: classified.media?.id,
          caption: classified.media?.caption,
        });
      }
    }
  }

  if (jobs.length) {
    // Messages d'une même conversation traités dans l'ordre ; conversations en parallèle.
    const byConversation = new Map<string, InboundJob[]>();
    for (const job of jobs)
      byConversation.set(job.conversationId, [
        ...(byConversation.get(job.conversationId) ?? []),
        job,
      ]);
    const work = Promise.all(
      [...byConversation.values()].map(async (list) => {
        for (const [index, job] of list.entries()) {
          const respond = index === list.length - 1;
          await processInbound(deps.agent(), { ...job, respond }).catch((error) =>
            console.error("[ballech] traitement en échec", error),
          );
        }
      }),
    );
    if (deps.waitUntil) deps.waitUntil(work);
    else await work;
  }

  return json(200, { received: jobs.length });
}
