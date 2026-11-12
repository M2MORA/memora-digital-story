/**
 * Routes admin de l'inbox WhatsApp (appelées depuis l'app admin, autre origine) :
 * POST /api/admin/whatsapp/send   { conversation_id, text } → réponse de l'équipe au client
 * GET  /api/admin/whatsapp/media?key=whatsapp/…              → { url } signée (1 h)
 */
import { requireAdmin } from "../admin-auth";
import type { WhatsAppClient } from "./client";
import type { BallechStore } from "./store";

/** Hors de cette fenêtre après le dernier message du client, WhatsApp exige un modèle validé. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MEDIA_KEY = /^whatsapp\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const adminPreflight = () => new Response(null, { status: 204, headers: CORS });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export type AdminRouteDeps = {
  getSupabase: () => SupabaseAdmin | null;
  store: (supabase: SupabaseAdmin) => BallechStore;
  client: () => WhatsAppClient;
  signMediaUrl: (key: string) => Promise<string | null>;
  now?: () => Date;
};

export async function handleAdminSend(request: Request, deps: AdminRouteDeps): Promise<Response> {
  const check = await requireAdmin(request, deps.getSupabase, "[admin/whatsapp]");
  if (!check.ok) return json(check.status, { error: check.error });

  const body = (await request.json().catch(() => null)) as {
    conversation_id?: unknown;
    text?: unknown;
  } | null;
  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!conversationId || !text) return json(400, { error: "conversation_id et text requis" });
  if (text.length > 4096) return json(400, { error: "Message trop long (4096 caractères max)" });

  const store = deps.store(check.supabase);
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return json(404, { error: "Conversation introuvable" });

  const now = (deps.now ?? (() => new Date()))();
  const lastInbound = conversation.last_inbound_at
    ? new Date(conversation.last_inbound_at).getTime()
    : 0;
  if (now.getTime() - lastInbound > CUSTOMER_SERVICE_WINDOW_MS) {
    return json(409, {
      error:
        "Plus de 24 h depuis le dernier message du client : WhatsApp bloque la réponse libre. Attends qu'il réécrive.",
    });
  }

  let sentId: string | null;
  try {
    sentId = (await deps.client().sendText(conversation.wa_phone, text)).id;
  } catch (error) {
    console.error("[admin/whatsapp] envoi refusé", error);
    return json(502, { error: "WhatsApp a refusé l'envoi. Réessaie dans un instant." });
  }

  await store.insertMessage({
    conversation_id: conversation.id,
    wa_message_id: sentId,
    direction: "out",
    author: "admin",
    type: "text",
    body: text,
    payload: {},
  });
  await store.touchOutbound(conversation.id, now);
  // L'équipe répond : Ballech se tait jusqu'à ce qu'on lui rende la main.
  if (conversation.mode !== "human")
    await store.setMode(conversation.id, "human", "Réponse de l'équipe");

  return json(200, { success: true, wa_message_id: sentId });
}

export async function handleAdminMedia(request: Request, deps: AdminRouteDeps): Promise<Response> {
  const check = await requireAdmin(request, deps.getSupabase, "[admin/whatsapp]");
  if (!check.ok) return json(check.status, { error: check.error });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!MEDIA_KEY.test(key)) return json(403, { error: "Clé non autorisée" });

  const url = await deps.signMediaUrl(key).catch(() => null);
  if (!url) return json(500, { error: "Stockage indisponible" });
  return json(200, { url });
}
