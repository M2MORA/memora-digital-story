/** Point d'entrée des routes WhatsApp de Ballech, branché dans src/server.ts. */
import type { R2StorageAdapter } from "../../lib/r2-backend";
import { notifyAllAdmins, whatsappAlertMessage } from "../push";
import { adminPreflight, handleAdminMedia, handleAdminSend, type AdminRouteDeps } from "./admin";
import { createWhatsAppClient } from "./client";
import { whatsappConfig } from "./env";
import { providerFromEnv } from "./llm";
import { createSupabaseStore } from "./store";
import { handleWhatsAppWebhook, runtimeWaitUntil } from "./webhook";

export type WhatsAppServerDeps = {
  /** Client Supabase service role (lève une erreur si non configuré). */
  supabaseAdmin: () => unknown;
  /** Même client, ou null si non configuré (routes admin). */
  supabaseAdminOrNull: () => unknown | null;
  storage: () => R2StorageAdapter;
  signMediaUrl: (key: string) => Promise<string | null>;
};

export async function routeWhatsApp(
  request: Request,
  env: unknown,
  ctx: unknown,
  deps: WhatsAppServerDeps,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  if (
    pathname === "/api/whatsapp/webhook" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    const config = whatsappConfig(env);
    const client = createWhatsAppClient(config);
    const store = createSupabaseStore(deps.supabaseAdmin());
    return handleWhatsAppWebhook(request, {
      config,
      store,
      waitUntil: runtimeWaitUntil(ctx),
      agent: () => ({
        store,
        client,
        provider: () => providerFromEnv(env),
        storage: deps.storage,
        notifyTeam: (alert) =>
          notifyAllAdmins(env, deps.supabaseAdminOrNull(), whatsappAlertMessage(alert)),
      }),
    });
  }

  if (pathname.startsWith("/api/admin/whatsapp/")) {
    if (request.method === "OPTIONS") return adminPreflight();
    const adminDeps: AdminRouteDeps = {
      getSupabase: deps.supabaseAdminOrNull,
      store: createSupabaseStore,
      client: () => createWhatsAppClient(whatsappConfig(env)),
      signMediaUrl: deps.signMediaUrl,
    };
    if (pathname === "/api/admin/whatsapp/send" && request.method === "POST")
      return handleAdminSend(request, adminDeps);
    if (pathname === "/api/admin/whatsapp/media" && request.method === "GET")
      return handleAdminMedia(request, adminDeps);
  }

  return null;
}
