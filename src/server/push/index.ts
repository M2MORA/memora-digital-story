/**
 * Notifications push de l'admin (commande jdida) :
 * POST   /api/internal/order-created   appelé par la base (pg_net) à chaque nouvelle commande
 * GET    /api/admin/push/config        { publicKey } : clé VAPID publique pour s'abonner
 * POST   /api/admin/push/subscribe     enregistre l'appareil de l'admin connecté
 * DELETE /api/admin/push/subscribe     retire cet appareil
 * POST   /api/admin/push/test          envoie une notification de test à SES appareils
 *
 * Variables d'environnement (jamais dans le dépôt) :
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), ORDER_WEBHOOK_SECRET.
 */
import { timingSafeCompare } from "../../lib/r2-backend";
import { requireAdmin } from "../admin-auth";
import { readEnv } from "../whatsapp/env";
import {
  isAllowedPushEndpoint,
  isValidSubscriptionKeys,
  sendWebPush,
  type PushMessage,
  type VapidKeys,
} from "./webpush";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEVICES_PER_ADMIN = 10;
const MAX_FAILURES = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export type PushRouteDeps = {
  getSupabase: () => SupabaseAdmin | null;
  fetchImpl?: typeof fetch;
};

function vapidFromEnv(env: unknown): VapidKeys | null {
  const publicKey = readEnv(env, "VAPID_PUBLIC_KEY");
  const privateKey = readEnv(env, "VAPID_PRIVATE_KEY");
  const subject = readEnv(env, "VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

/** Envoie à chaque appareil ; supprime ceux qui n'existent plus, désactive ceux qui échouent trop. */
async function sendToDevices(
  supabase: SupabaseAdmin,
  devices: Subscription[],
  message: PushMessage,
  vapid: VapidKeys,
  fetchImpl?: typeof fetch,
) {
  const summary = { sent: 0, removed: 0, failed: 0 };
  await Promise.all(
    devices.map(async (device) => {
      try {
        const result = await sendWebPush(device, message, vapid, fetchImpl);
        if (result.ok) {
          summary.sent += 1;
          await supabase
            .from("admin_push_subscriptions")
            .update({ failures: 0, last_success_at: new Date().toISOString() })
            .eq("id", device.id);
        } else if (result.gone) {
          summary.removed += 1;
          await supabase.from("admin_push_subscriptions").delete().eq("id", device.id);
        } else {
          summary.failed += 1;
          await supabase
            .from("admin_push_subscriptions")
            .update({ failures: device.failures + 1 })
            .eq("id", device.id);
        }
      } catch (error) {
        summary.failed += 1;
        console.error("[push] envoi impossible", error instanceof Error ? error.message : error);
      }
    }),
  );
  return summary;
}

/** Prénom seulement + montant : jamais l'adresse ni le téléphone dans une notification. */
export function orderMessage(order: {
  id: string;
  order_number: string;
  customer_name: string;
  total: number | string;
  currency?: string | null;
}): PushMessage {
  const firstName = String(order.customer_name ?? "").trim().split(/\s+/)[0] ?? "";
  const amount = `${Number(order.total).toFixed(2)} ${order.currency && order.currency !== "TND" ? order.currency : "DT"}`;
  return {
    title: "Nouvelle commande",
    body: [`#${order.order_number}`, firstName, amount].filter(Boolean).join(" · "),
    orderId: order.id,
    tag: `order-${order.id}`,
  };
}

async function handleOrderCreated(request: Request, env: unknown, deps: PushRouteDeps): Promise<Response> {
  const secret = readEnv(env, "ORDER_WEBHOOK_SECRET");
  if (!secret) return json(503, { error: "Webhook non configuré" });

  const provided = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!provided || !(await timingSafeCompare(provided, secret))) return json(401, { error: "Non autorisé" });

  const vapid = vapidFromEnv(env);
  if (!vapid) return json(503, { error: "Notifications non configurées" });

  const body = (await request.json().catch(() => null)) as { order_id?: unknown } | null;
  const orderId = typeof body?.order_id === "string" ? body.order_id : "";
  if (!UUID.test(orderId)) return json(400, { error: "order_id invalide" });

  const supabase = deps.getSupabase();
  if (!supabase) return json(500, { error: "Base de données non configurée" });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, total, currency")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[push] lecture de la commande impossible", error.message);
    return json(500, { error: "Lecture de la commande impossible" });
  }
  if (!order) return json(404, { error: "Commande introuvable" });

  const { data: devices } = await supabase
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth, failures")
    .lt("failures", MAX_FAILURES)
    .limit(100);

  const summary = await sendToDevices(supabase, (devices ?? []) as Subscription[], orderMessage(order), vapid, deps.fetchImpl);
  return json(200, summary);
}

export async function routePush(request: Request, env: unknown, deps: PushRouteDeps): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/internal/order-created") {
    if (request.method !== "POST") return json(405, { error: "Méthode non autorisée" });
    return handleOrderCreated(request, env, deps);
  }

  if (!pathname.startsWith("/api/admin/push/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const check = await requireAdmin(request, deps.getSupabase, "[admin/push]");
  if (!check.ok) return json(check.status, { error: check.error });
  const { supabase, userId } = check;

  const vapid = vapidFromEnv(env);

  if (pathname === "/api/admin/push/config" && request.method === "GET") {
    if (!vapid) return json(503, { error: "Notifications non configurées sur le serveur" });
    return json(200, { publicKey: vapid.publicKey });
  }

  if (pathname === "/api/admin/push/subscribe" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
      user_agent?: unknown;
    } | null;
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (!isAllowedPushEndpoint(endpoint) || !isValidSubscriptionKeys(p256dh, auth)) {
      return json(400, { error: "Abonnement invalide" });
    }
    if (!userId) return json(401, { error: "Session invalide" });

    const { data: existing } = await supabase
      .from("admin_push_subscriptions")
      .select("id, endpoint")
      .eq("user_id", userId);
    const known = (existing ?? []) as { id: string; endpoint: string }[];
    if (known.length >= MAX_DEVICES_PER_ADMIN && !known.some((d) => d.endpoint === endpoint)) {
      return json(409, { error: `Maximum ${MAX_DEVICES_PER_ADMIN} appareils. Retire-en un d'abord.` });
    }

    const userAgent = typeof body?.user_agent === "string" ? body.user_agent.slice(0, 300) : null;
    const { error } = await supabase.from("admin_push_subscriptions").upsert(
      { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent, failures: 0 },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("[admin/push] enregistrement impossible", error.message);
      return json(500, { error: "Enregistrement impossible" });
    }
    return json(200, { success: true });
  }

  if (pathname === "/api/admin/push/subscribe" && request.method === "DELETE") {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string" || !userId) return json(400, { error: "endpoint requis" });
    await supabase.from("admin_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", userId);
    return json(200, { success: true });
  }

  if (pathname === "/api/admin/push/test" && request.method === "POST") {
    if (!vapid) return json(503, { error: "Notifications non configurées sur le serveur" });
    if (!userId) return json(401, { error: "Session invalide" });
    const { data: devices } = await supabase
      .from("admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth, failures")
      .eq("user_id", userId)
      .limit(MAX_DEVICES_PER_ADMIN);
    if (!devices?.length) return json(404, { error: "Aucun appareil enregistré" });
    const summary = await sendToDevices(
      supabase,
      devices as Subscription[],
      { title: "MÉMORA", body: "Les notifications fonctionnent.", tag: "test" },
      vapid,
      deps.fetchImpl,
    );
    return json(200, summary);
  }

  return json(404, { error: "Route inconnue" });
}
