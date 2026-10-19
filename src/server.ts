import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  verifyAndCompleteUploadIntent,
  purgeOrphanUploadIntents,
  CloudflareR2BindingAdapter,
  S3CompatibleR2Adapter,
  R2StorageAdapter,
  timingSafeCompare,
} from "./lib/r2-backend";
import { createClient } from "@supabase/supabase-js";

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
      "Configuration Cloudflare R2 invalide : le binding existe mais n'implémente pas toutes les méthodes requises (head, delete, put)"
    );
  }

  const accountId =
    (typeof env?.R2_ACCOUNT_ID === "string" ? env.R2_ACCOUNT_ID.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_ACCOUNT_ID"] === "string"
      ? process.env["R2_ACCOUNT_ID"]!.trim()
      : "");

  const accessKeyId =
    (typeof env?.R2_ACCESS_KEY_ID === "string" ? env.R2_ACCESS_KEY_ID.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_ACCESS_KEY_ID"] === "string"
      ? process.env["R2_ACCESS_KEY_ID"]!.trim()
      : "");

  const secretAccessKey =
    (typeof env?.R2_SECRET_ACCESS_KEY === "string" ? env.R2_SECRET_ACCESS_KEY.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_SECRET_ACCESS_KEY"] === "string"
      ? process.env["R2_SECRET_ACCESS_KEY"]!.trim()
      : "");

  const bucketName =
    (typeof env?.R2_BUCKET_NAME === "string" ? env.R2_BUCKET_NAME.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_BUCKET_NAME"] === "string"
      ? process.env["R2_BUCKET_NAME"]!.trim()
      : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    const missing: string[] = [];
    if (!accountId) missing.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
    if (!bucketName) missing.push("R2_BUCKET_NAME");
    throw new Error(
      `Configuration Cloudflare R2 manquante (variables requises : ${missing.join(", ")})`
    );
  }

  return new S3CompatibleR2Adapter({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
  });
}

export function getS3R2Adapter(env: any): S3CompatibleR2Adapter {
  const accountId =
    (typeof env?.R2_ACCOUNT_ID === "string" ? env.R2_ACCOUNT_ID.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_ACCOUNT_ID"] === "string"
      ? process.env["R2_ACCOUNT_ID"]!.trim()
      : "");

  const accessKeyId =
    (typeof env?.R2_ACCESS_KEY_ID === "string" ? env.R2_ACCESS_KEY_ID.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_ACCESS_KEY_ID"] === "string"
      ? process.env["R2_ACCESS_KEY_ID"]!.trim()
      : "");

  const secretAccessKey =
    (typeof env?.R2_SECRET_ACCESS_KEY === "string" ? env.R2_SECRET_ACCESS_KEY.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_SECRET_ACCESS_KEY"] === "string"
      ? process.env["R2_SECRET_ACCESS_KEY"]!.trim()
      : "");

  const bucketName =
    (typeof env?.R2_BUCKET_NAME === "string" ? env.R2_BUCKET_NAME.trim() : "") ||
    (typeof process !== "undefined" && typeof process.env?.["R2_BUCKET_NAME"] === "string"
      ? process.env["R2_BUCKET_NAME"]!.trim()
      : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    const missing: string[] = [];
    if (!accountId) missing.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
    if (!bucketName) missing.push("R2_BUCKET_NAME");
    throw new Error(
      `Configuration Cloudflare R2 S3 manquante (variables requises : ${missing.join(", ")})`
    );
  }

  return new S3CompatibleR2Adapter({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
  });
}

function getSupabaseAdmin(env: any) {
  const url =
    env?.SUPABASE_URL ||
    env?.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env?.["VITE_SUPABASE_URL"] : "") ||
    "";
  // Suppression définitive du fallback VITE_SUPABASE_SERVICE_ROLE_KEY
  const serviceKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== "undefined" ? process.env?.["SUPABASE_SERVICE_ROLE_KEY"] : "") ||
    "";

  if (!url || !serviceKey) {
    throw new Error("Configuration Supabase serveur manquante (URL ou SUPABASE_SERVICE_ROLE_KEY)");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function handleUploadIntentRoute(
  request: Request,
  env: any,
  dependencies?: {
    supabaseAdmin?: any;
    s3Adapter?: S3CompatibleR2Adapter;
  }
): Promise<Response> {
  // 1. Validation du JSON d'entrée
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête JSON invalide" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!body || typeof body !== "object") {
    return new Response(
      JSON.stringify({ error: "Corps de requête invalide (objet JSON attendu)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const {
    draft_id,
    draft_token,
    item_id,
    file_kind,
    file_name,
    mime_type,
    file_size_bytes,
    file_extension,
  } = body;

  // 2. Validation stricte des champs du contrat
  if (typeof draft_id !== "string" || !/^[a-zA-Z0-9_-]{3,64}$/.test(draft_id.trim())) {
    return new Response(
      JSON.stringify({
        error: "draft_id invalide (caractères alphanumériques, tiret ou souligné attendus, longueur 3 à 64)",
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (typeof draft_token !== "string" || draft_token.trim().length < 8) {
    return new Response(
      JSON.stringify({ error: "draft_token invalide ou manquant (au moins 8 caractères requis)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (file_kind !== "video" && file_kind !== "photo") {
    return new Response(
      JSON.stringify({ error: "file_kind invalide (attendu: 'video' ou 'photo')" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (typeof file_name !== "string" || !file_name.trim() || file_name.length > 255 || /[\0\r\n]/.test(file_name)) {
    return new Response(
      JSON.stringify({ error: "file_name invalide ou manquant (max 255 caractères sans caractères de contrôle)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (typeof file_extension !== "string" || !file_extension.trim()) {
    return new Response(
      JSON.stringify({ error: "file_extension invalide ou manquante" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  const cleanExt = file_extension.trim().toLowerCase().replace(/^\.+/, "");
  const allowedVideoExts = ["mp4", "mov", "webm"];
  const allowedPhotoExts = ["jpg", "jpeg", "png", "webp"];

  if (file_kind === "video" && !allowedVideoExts.includes(cleanExt)) {
    return new Response(
      JSON.stringify({ error: "Extension vidéo non autorisée (mp4, mov, webm requis)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  if (file_kind === "photo" && !allowedPhotoExts.includes(cleanExt)) {
    return new Response(
      JSON.stringify({ error: "Extension photo non autorisée (jpg, jpeg, png, webp requis)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (typeof mime_type !== "string" || !mime_type.trim() || /[\r\n\0]/.test(mime_type)) {
    return new Response(
      JSON.stringify({ error: "mime_type invalide ou manquant" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  const cleanMime = mime_type.trim().toLowerCase();
  const allowedVideoMimes = ["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"];
  const allowedPhotoMimes = ["image/jpeg", "image/png", "image/webp"];

  if (file_kind === "video" && !allowedVideoMimes.includes(cleanMime) && !cleanMime.startsWith("video/")) {
    return new Response(
      JSON.stringify({ error: "Type MIME vidéo non autorisé" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  if (file_kind === "photo" && !allowedPhotoMimes.includes(cleanMime)) {
    return new Response(
      JSON.stringify({ error: "Type MIME photo non autorisé" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (
    typeof file_size_bytes !== "number" ||
    !Number.isInteger(file_size_bytes) ||
    file_size_bytes <= 0
  ) {
    return new Response(
      JSON.stringify({ error: "file_size_bytes invalide (entier strictement positif attendu)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const MAX_VIDEO_BYTES = 5368709120; // 5 Go
  const MAX_PHOTO_BYTES = 26214400;   // 25 Mo

  if (file_kind === "video" && file_size_bytes > MAX_VIDEO_BYTES) {
    return new Response(
      JSON.stringify({ error: "Fichier vidéo trop volumineux (max 5 Go)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  if (file_kind === "photo" && file_size_bytes > MAX_PHOTO_BYTES) {
    return new Response(
      JSON.stringify({ error: "Fichier photo trop volumineux (max 25 Mo)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  let cleanItemId: string | null = null;
  if (item_id !== undefined && item_id !== null) {
    if (typeof item_id !== "string" || !item_id.trim() || item_id.length > 64) {
      return new Response(
        JSON.stringify({ error: "item_id invalide (chaîne de 1 à 64 caractères attendue)" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    cleanItemId = item_id.trim();
  }

  // 3. Résolution de l'adaptateur R2 S3-compatible (Fail-Closed si indisponible -> 503)
  let s3Adapter: S3CompatibleR2Adapter;
  try {
    s3Adapter = dependencies?.s3Adapter || getS3R2Adapter(env);
  } catch {
    return new Response(
      JSON.stringify({ error: "Service de stockage Cloudflare R2 non disponible" }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  // 4. Résolution du client Supabase
  let supabaseAdmin: any;
  try {
    supabaseAdmin = dependencies?.supabaseAdmin || getSupabaseAdmin(env);
  } catch {
    return new Response(
      JSON.stringify({ error: "Service de base de données non disponible" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // 5. Appel de la procédure stockée create_upload_intent
  let rpcData: any;
  try {
    const { data, error } = await supabaseAdmin.rpc("create_upload_intent", {
      p_draft_id: draft_id.trim(),
      p_draft_token: draft_token.trim(),
      p_file_kind: file_kind,
      p_file_name: file_name.trim(),
      p_mime_type: cleanMime,
      p_file_size_bytes: file_size_bytes,
      p_file_extension: cleanExt,
      p_item_id: cleanItemId,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("Quota de fichiers atteint")) {
        return new Response(
          JSON.stringify({ error: "Quota de fichiers atteint pour ce panier (max 20)" }),
          { status: 429, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Erreur lors de la création de l'intention d'upload" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    rpcData = data;
  } catch {
    return new Response(
      JSON.stringify({ error: "Erreur interne de communication base de données" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!rpcData || !rpcData.success || !rpcData.intent_id || !rpcData.storage_key) {
    return new Response(
      JSON.stringify({ error: "Échec de création de l'intention d'upload" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // 6. Génération de l'URL présignée PUT SigV4 (900s max)
  try {
    const presigned = await s3Adapter.getPresignedPutUrl({
      key: rpcData.storage_key,
      contentType: cleanMime,
      expiresInSeconds: 900,
    });

    // 7. Réponse sans jamais divulguer la storage_key, le token ou les secrets
    return new Response(
      JSON.stringify({
        success: true,
        intent_id: rpcData.intent_id,
        upload_url: presigned.url,
        required_headers: presigned.requiredHeaders,
        expires_at: presigned.expiresAt,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Échec de génération de l'URL d'upload" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

export async function handleUploadVerificationRoute(request: Request, env: any): Promise<Response> {
  try {
    const body = (await request.json()) as { intent_id?: string; draft_token?: string };
    if (!body?.intent_id || !body?.draft_token) {
      return new Response(
        JSON.stringify({ error: "intent_id et draft_token sont obligatoires" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const supabaseAdmin = getSupabaseAdmin(env);
    const storage = getR2Adapter(env);

    const result = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
      intent_id: body.intent_id,
      draft_token: body.draft_token,
    });

    const status = result.success ? 200 : result.code === "INTENT_NOT_FOUND" ? 404 : 400;
    return new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Erreur interne lors de la vérification" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handleOrphanPurgeRoute(request: Request, env: any): Promise<Response> {
  try {
    // Comportement fail-closed P0 : Si PURGE_CRON_SECRET est absent ou vide -> refus 500
    const cronSecret = env?.PURGE_CRON_SECRET;
    if (!cronSecret || typeof cronSecret !== "string" || !cronSecret.trim()) {
      return new Response(
        JSON.stringify({ error: "Configuration serveur incomplète (PURGE_CRON_SECRET non configuré)" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // Comparaison en temps constant (P0)
    const authHeader = request.headers.get("authorization") ?? "";
    const expectedHeader = `Bearer ${cronSecret.trim()}`;
    const isAuthorized = await timingSafeCompare(authHeader, expectedHeader);
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    let payload: { batch_size?: unknown; lease_seconds?: unknown } = {};
    try {
      payload = await request.json();
    } catch {
      // payload optionnel
    }

    // Validation stricte des bornes des paramètres (P0)
    let batchSize: number | undefined;
    if (payload.batch_size !== undefined) {
      if (
        typeof payload.batch_size !== "number" ||
        !Number.isInteger(payload.batch_size) ||
        payload.batch_size < 1 ||
        payload.batch_size > 500
      ) {
        return new Response(
          JSON.stringify({ error: "Paramètre batch_size invalide (doit être un entier compris entre 1 et 500)" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      batchSize = payload.batch_size;
    }

    let leaseSeconds: number | undefined;
    if (payload.lease_seconds !== undefined) {
      if (
        typeof payload.lease_seconds !== "number" ||
        !Number.isInteger(payload.lease_seconds) ||
        payload.lease_seconds < 30 ||
        payload.lease_seconds > 3600
      ) {
        return new Response(
          JSON.stringify({ error: "Paramètre lease_seconds invalide (doit être un entier compris entre 30 et 3600)" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      leaseSeconds = payload.lease_seconds;
    }

    const supabaseAdmin = getSupabaseAdmin(env);
    const storage = getR2Adapter(env);

    const result = await purgeOrphanUploadIntents(supabaseAdmin, storage, {
      batchSize,
      leaseSeconds,
    });

    // Ne jamais divulguer les storage_key dans les réponses HTTP (P0/P1)
    return new Response(
      JSON.stringify({
        claimed_count: result.claimed_count,
        r2_deleted_count: result.r2_deleted_count,
        confirmed_db_count: result.confirmed_db_count,
        failed_count: result.failed_count,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Erreur lors du traitement de la purge" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/upload/intent" && request.method === "POST") {
        return await handleUploadIntentRoute(request, env);
      }
      if (url.pathname === "/api/upload/verify" && request.method === "POST") {
        return await handleUploadVerificationRoute(request, env);
      }
      if (url.pathname === "/api/upload/purge" && request.method === "POST") {
        return await handleOrphanPurgeRoute(request, env);
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
