import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  CloudflareR2BindingAdapter,
  S3CompatibleR2Adapter,
  R2StorageAdapter,
} from "./lib/r2-backend";
import {
  readEnv,
  readR2Config,
  readSupabaseConfig,
  type SupabaseServerConfig,
} from "./server/config";
import {
  mediaKeyRedirect,
  memoryMediaRedirect,
  memoryVideoStream,
  type MemoryMediaDependencies,
} from "./server/memory-media";
import { corsJson } from "./server/http";
import {
  checkUploadIntentRequest,
  createUploadIntent,
  handleOrphanPurge,
  verifyUploadIntent,
  type CreateUploadIntentResult,
  type UploadIntentDependencies,
  type UploadIntentIssue,
} from "./server/upload-intents";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./server/admin-auth";
import { routeWhatsApp } from "./server/whatsapp";
import { routePush } from "./server/push";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export function getR2Adapter(env: any): R2StorageAdapter {
  const bucketBinding = env?.MEMORA_VIDEOS_BUCKET || env?.R2_BUCKET || env?.BUCKET;
  if (bucketBinding) {
    const hasHead = typeof bucketBinding.head === "function";
    const hasDelete = typeof bucketBinding.delete === "function";
    const hasPut = typeof bucketBinding.put === "function";

    if (hasHead && hasDelete && hasPut) {
      return new CloudflareR2BindingAdapter(bucketBinding);
    }

    throw new Error(
      "Configuration Cloudflare R2 invalide : le binding existe mais n'implémente pas toutes les méthodes requises (head, delete, put)",
    );
  }

  return new S3CompatibleR2Adapter(readR2Config(env));
}

export function getS3R2Adapter(env: any): S3CompatibleR2Adapter {
  return new S3CompatibleR2Adapter(readR2Config(env));
}

function getSupabaseAdmin(env: any) {
  const { url, serviceRoleKey } = readSupabaseConfig(env);
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function uploadIntentDependencies(env: any): UploadIntentDependencies {
  return {
    db: () => getSupabaseAdmin(env),
    storage: () => getR2Adapter(env),
    uploadSigner: () => getS3R2Adapter(env),
    now: Date.now,
  };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const UPLOAD_INTENT_ISSUE_MESSAGES: Record<UploadIntentIssue, string> = {
  body: "Corps de requête invalide (objet JSON attendu)",
  draft_id:
    "draft_id invalide (caractères alphanumériques, tiret ou souligné attendus, longueur 3 à 64)",
  draft_token: "draft_token invalide ou manquant (au moins 8 caractères requis)",
  file_kind: "file_kind invalide (attendu: 'video' ou 'photo')",
  file_name: "file_name invalide ou manquant (max 255 caractères sans caractères de contrôle)",
  file_extension: "file_extension invalide ou manquante",
  video_extension: "Extension vidéo non autorisée (mp4, mov, webm requis)",
  photo_extension: "Extension photo non autorisée (jpg, jpeg, png, webp requis)",
  mime_type: "mime_type invalide ou manquant",
  video_mime: "Type MIME vidéo non autorisé",
  photo_mime: "Type MIME photo non autorisé",
  file_size_bytes: "file_size_bytes invalide (entier strictement positif attendu)",
  video_size: "Fichier vidéo trop volumineux (max 5 Go)",
  photo_size: "Fichier photo trop volumineux (max 25 Mo)",
  item_id: "item_id invalide (chaîne de 1 à 64 caractères attendue)",
};

const CREATE_UPLOAD_INTENT_ERRORS: Record<
  Extract<CreateUploadIntentResult, { ok: false }>["reason"],
  [number, string]
> = {
  storage_unavailable: [503, "Service de stockage Cloudflare R2 non disponible"],
  db_unavailable: [500, "Service de base de données non disponible"],
  quota: [429, "Quota de fichiers atteint pour ce panier (max 20)"],
  rpc_error: [500, "Erreur lors de la création de l'intention d'upload"],
  db_exception: [500, "Erreur interne de communication base de données"],
  rejected: [500, "Échec de création de l'intention d'upload"],
  presign_failed: [500, "Échec de génération de l'URL d'upload"],
};

export async function handleUploadIntentRoute(
  request: Request,
  deps: UploadIntentDependencies,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Corps de requête JSON invalide" });
  }

  const check = checkUploadIntentRequest(body);
  if (!check.ok) return jsonResponse(400, { error: UPLOAD_INTENT_ISSUE_MESSAGES[check.issue] });

  const result = await createUploadIntent(deps, check.request);
  if (!result.ok) {
    const [status, error] = CREATE_UPLOAD_INTENT_ERRORS[result.reason];
    return jsonResponse(status, { error });
  }

  // Jamais de storage_key, de token ni de secret dans la réponse
  return jsonResponse(200, {
    success: true,
    intent_id: result.intentId,
    upload_url: result.upload.url,
    required_headers: result.upload.requiredHeaders,
    expires_at: result.upload.expiresAt,
  });
}

export async function handleUploadVerificationRoute(
  request: Request,
  deps: UploadIntentDependencies,
): Promise<Response> {
  try {
    const body = (await request.json()) as { intent_id?: string; draft_token?: string };
    if (!body?.intent_id || !body?.draft_token) {
      return jsonResponse(400, { error: "intent_id et draft_token sont obligatoires" });
    }

    const result = await verifyUploadIntent(deps, {
      intent_id: body.intent_id,
      draft_token: body.draft_token,
    });

    const status = result.success ? 200 : result.code === "INTENT_NOT_FOUND" ? 404 : 400;
    return jsonResponse(status, result);
  } catch {
    return jsonResponse(500, { error: "Erreur interne lors de la vérification" });
  }
}

export async function handleProxyPutRoute(request: Request, _env: any): Promise<Response> {
  const uploadUrl = request.headers.get("x-upload-url");
  if (!uploadUrl) {
    return new Response(JSON.stringify({ error: "En-tête x-upload-url requis" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Sécurité SSRF: vérification stricte du domaine de destination (Cloudflare R2 uniquement)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(uploadUrl);
  } catch {
    return new Response(JSON.stringify({ error: "URL d'upload invalide" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname.endsWith(".r2.cloudflarestorage.com")
  ) {
    return new Response(JSON.stringify({ error: "Destination non autorisée" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const body = await request.arrayBuffer();

  try {
    const r2Response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body,
    });

    if (!r2Response.ok) {
      const errText = await r2Response.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Erreur R2: ${r2Response.status} ${errText}` }), {
        status: r2Response.status,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[proxy-put] Erreur de transfert R2:", err);
    return new Response(JSON.stringify({ error: "Échec de transmission du fichier vers R2" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

// Les liens signés exigent les identifiants S3 (un binding R2 ne sait pas signer) : les routes média restent sur l'adaptateur S3.
function memoryMediaDependencies(env: any): MemoryMediaDependencies {
  return { db: () => getSupabaseAdmin(env), storage: () => getS3R2Adapter(env) };
}

const adminOrdersCors = corsJson("DELETE, OPTIONS");

/** Client service role pour les routes admin, ou null si la configuration manque. */
function getServiceRoleClient(env: any): any {
  let config: SupabaseServerConfig;
  try {
    config = readSupabaseConfig(env);
  } catch {
    return null;
  }
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function handleDeleteOrderRoute(
  request: Request,
  env: any,
  dependencies?: { supabaseAdmin?: any },
): Promise<Response> {
  const { json } = adminOrdersCors;
  const deny = (status: number, error: string) => json(status, { error });

  const check = await requireAdmin(
    request,
    () => dependencies?.supabaseAdmin ?? getServiceRoleClient(env),
    "[admin/orders]",
  );
  if (!check.ok) return deny(check.status, check.error);
  const supabase = check.supabase;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return deny(400, "Paramètre id requis");

  // Règle de sécurité stricte : seule une commande avec le statut 'cancelled' peut être supprimée
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status, order_number")
    .eq("id", id)
    .single();

  if (fetchErr || !order) return deny(404, "Commande introuvable");

  if (order.status !== "cancelled") {
    return deny(
      400,
      `Suppression interdite : la commande #${order.order_number} est au statut '${order.status}'. Seules les commandes annulées peuvent être supprimées. Une commande payée ne peut jamais être supprimée.`,
    );
  }

  const { error } = await supabase.from("orders").delete().eq("id", id);
  // 23514 = refused by the trg_guard_order_delete trigger (status changed since the check above)
  if (error) return deny(error.code === "23514" ? 400 : 500, error.message);

  return json(200, { success: true });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/upload/intent" && request.method === "POST") {
        return await handleUploadIntentRoute(request, uploadIntentDependencies(env));
      }
      if (url.pathname === "/api/upload/verify" && request.method === "POST") {
        return await handleUploadVerificationRoute(request, uploadIntentDependencies(env));
      }
      // Vercel Cron appelle les routes en GET
      if (
        url.pathname === "/api/upload/purge" &&
        (request.method === "POST" || request.method === "GET")
      ) {
        return await handleOrphanPurge(
          {
            db: () => getSupabaseAdmin(env),
            storage: () => getR2Adapter(env),
            // Sur Vercel, CRON_SECRET authentifie les tâches planifiées
            cronSecret: () => readEnv(env, "PURGE_CRON_SECRET") || readEnv(env, "CRON_SECRET"),
          },
          request,
        );
      }
      if (
        url.pathname === "/api/upload/proxy-put" &&
        (request.method === "PUT" || request.method === "POST")
      ) {
        return await handleProxyPutRoute(request, env);
      }
      if (url.pathname === "/api/media" && request.method === "GET") {
        return await mediaKeyRedirect(request, () => getS3R2Adapter(env));
      }
      if (
        url.pathname === "/api/memory-media" &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        return await memoryMediaRedirect(request, memoryMediaDependencies(env));
      }
      if (
        url.pathname === "/api/nfc-video" &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const slug = url.searchParams.get("slug") ?? "";
        return await memoryVideoStream(request, slug, memoryMediaDependencies(env));
      }
      if (
        url.pathname === "/api/whatsapp/webhook" ||
        url.pathname.startsWith("/api/admin/whatsapp/")
      ) {
        const whatsappResponse = await routeWhatsApp(request, env, ctx, {
          supabaseAdmin: () => getSupabaseAdmin(env),
          supabaseAdminOrNull: () => getServiceRoleClient(env),
          storage: () => getR2Adapter(env),
          signMediaUrl: async (key) => getS3R2Adapter(env).getSignedGetUrl(key),
        });
        if (whatsappResponse) return whatsappResponse;
      }
      if (
        url.pathname === "/api/internal/order-created" ||
        url.pathname.startsWith("/api/admin/push/")
      ) {
        const pushResponse = await routePush(request, env, {
          getSupabase: () => getServiceRoleClient(env),
        });
        if (pushResponse) return pushResponse;
      }
      if (url.pathname === "/api/admin/orders" && request.method === "OPTIONS") {
        return adminOrdersCors.preflight();
      }
      if (url.pathname === "/api/admin/orders" && request.method === "DELETE") {
        return await handleDeleteOrderRoute(request, env);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
