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
  sha256Hex,
} from "./lib/r2-backend";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveStreamingResponse } from "./lib/streaming-handler";
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

const ACTIVE_INTENT_STATUSES = ["pending", "uploading", "ready"];
const READY_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Libère le quota du panier avant une nouvelle intention : les intentions
 * expirées ne comptent plus, et celles du même média sont remplacées.
 * Limité au détenteur du draft_token. Un échec ici ne bloque pas l'envoi.
 */
async function releaseStaleUploadIntents(
  supabaseAdmin: any,
  params: { draftId: string; draftToken: string; itemId: string | null; fileKind: string },
): Promise<void> {
  try {
    const tokenHash = await sha256Hex(params.draftToken);
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("upload_intents")
      .update({ status: "expired", updated_at: now })
      .eq("draft_id", params.draftId)
      .eq("draft_token_hash", tokenHash)
      .in("status", ACTIVE_INTENT_STATUSES)
      .lt("expires_at", now);

    if (params.itemId) {
      await supabaseAdmin
        .from("upload_intents")
        .update({ status: "cancelled", updated_at: now })
        .eq("draft_id", params.draftId)
        .eq("draft_token_hash", tokenHash)
        .eq("item_id", params.itemId)
        .eq("file_kind", params.fileKind)
        .in("status", ACTIVE_INTENT_STATUSES)
        .is("order_id", null);
    }
  } catch (err) {
    console.warn("[upload-intent] Libération des anciennes intentions impossible:", err);
  }
}

/**
 * Un fichier vérifié reste utilisable 24 h, le temps que le client termine sa
 * commande. À n'appeler qu'après validation du draft_token.
 */
export async function extendReadyUploadIntent(supabaseAdmin: any, intentId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("upload_intents")
      .update({
        expires_at: new Date(Date.now() + READY_INTENT_LIFETIME_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", intentId)
      .eq("status", "ready")
      .is("order_id", null);
  } catch (err) {
    console.warn("[upload-verify] Prolongation de l'intention impossible:", err);
  }
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

  await releaseStaleUploadIntents(supabaseAdmin, {
    draftId: draft_id.trim(),
    draftToken: draft_token.trim(),
    itemId: cleanItemId,
    fileKind: file_kind,
  });

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

    if (result.success && result.status === "ready") {
      await extendReadyUploadIntent(supabaseAdmin, body.intent_id);
    }

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
    // Sur Vercel, les secrets sont dans process.env et CRON_SECRET authentifie les tâches planifiées
    const cronSecret =
      env?.PURGE_CRON_SECRET ||
      (typeof process !== "undefined"
        ? process.env?.["PURGE_CRON_SECRET"] || process.env?.["CRON_SECRET"]
        : "");
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
      return new Response(
        JSON.stringify({ error: `Erreur R2: ${r2Response.status} ${errText}` }),
        {
          status: r2Response.status,
          headers: { "content-type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[proxy-put] Erreur de transfert R2:", err);
    return new Response(
      JSON.stringify({ error: "Échec de transmission du fichier vers R2" }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Médias du site (staging/{draft}/{uuid}) et médias reçus sur WhatsApp (whatsapp/{conversation}/{message}).
const PRIVATE_MEDIA_KEY_PREFIX = `^(?:staging\\/[a-zA-Z0-9_-]{3,64}|whatsapp\\/${UUID_PATTERN})\\/${UUID_PATTERN}`;
const PRIVATE_MEDIA_KEY = {
  video: new RegExp(`${PRIVATE_MEDIA_KEY_PREFIX}\\.(?:mp4|webm|mov)$`, "i"),
  photo: new RegExp(`${PRIVATE_MEDIA_KEY_PREFIX}\\.(?:jpe?g|png|webp)$`, "i"),
};

async function signR2GetUrl(env: any, key: string): Promise<string | null> {
  const accountId = env?.R2_ACCOUNT_ID || (typeof process !== "undefined" ? process.env?.["R2_ACCOUNT_ID"] : "") || "";
  const accessKeyId = env?.R2_ACCESS_KEY_ID || (typeof process !== "undefined" ? process.env?.["R2_ACCESS_KEY_ID"] : "") || "";
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY || (typeof process !== "undefined" ? process.env?.["R2_SECRET_ACCESS_KEY"] : "") || "";
  const bucketName = env?.R2_BUCKET_NAME || (typeof process !== "undefined" ? process.env?.["R2_BUCKET_NAME"] : "") || "memora-videos";

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 3600 });
}

function signedMediaRedirect(signedUrl: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: signedUrl,
      "Access-Control-Allow-Origin": "*",
      // Bien plus court que la validité du lien signé (1 h), pour ne jamais rejouer un lien expiré
      "Cache-Control": "private, max-age=300",
    },
  });
}

/**
 * Extrait la clé R2 d'un média enregistré pour un souvenir. L'origine enregistrée
 * est ignorée, car elle peut être celle de l'admin (ex. localhost).
 */
function privateMediaKey(stored: string, requestOrigin: string, kind: "video" | "photo"): string | null {
  // L'admin a pu enregistrer « memora.tn/api/media?... » sans https://
  const withScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) || stored.startsWith("/") ? stored : `https://${stored}`;

  let storedUrl: URL;
  try {
    storedUrl = new URL(withScheme, requestOrigin);
  } catch {
    return null;
  }

  if (
    !["https:", "http:"].includes(storedUrl.protocol) ||
    storedUrl.username ||
    storedUrl.password ||
    storedUrl.pathname !== "/api/media"
  ) {
    return null;
  }

  const key = storedUrl.searchParams.get("key")?.trim() ?? "";
  return PRIVATE_MEDIA_KEY[kind].test(key) ? key : null;
}

/**
 * Page NFC : résout un souvenir actif par son slug côté serveur puis redirige vers
 * un lien R2 signé. La clé de stockage n'apparaît jamais dans la page.
 */
export async function handleMemoryMediaRoute(
  request: Request,
  env: any,
  dependencies?: { supabaseAdmin?: any; signUrl?: (key: string) => Promise<string | null> },
): Promise<Response> {
  const unavailable = () =>
    new Response("Souvenir introuvable ou indisponible", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const kind = url.searchParams.get("kind") === "photo" ? "photo" : "video";
  if (!slug || slug.length > 160 || /[\0\r\n]/.test(slug)) return unavailable();

  try {
    const supabaseAdmin = dependencies?.supabaseAdmin ?? getSupabaseAdmin(env);
    const { data: memory, error } = await supabaseAdmin
      .from("memories")
      .select("video_url, photo_url")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    const stored = kind === "photo" ? memory?.photo_url : memory?.video_url;
    if (error || !stored) return unavailable();

    const key = privateMediaKey(stored, url.origin, kind);
    if (!key) return unavailable();

    const signedUrl = await (dependencies?.signUrl ?? ((k: string) => signR2GetUrl(env, k)))(key);
    if (!signedUrl) {
      return new Response("Service vidéo indisponible", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    return signedMediaRedirect(signedUrl);
  } catch (error) {
    console.error("[memory-media] Lien signé impossible:", error);
    return new Response("Service vidéo indisponible", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export async function handleMediaRoute(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || typeof key !== "string" || !key.trim()) {
    return new Response(JSON.stringify({ error: "Paramètre key requis" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Seuls les médias clients (clé non devinable) peuvent être signés
  const cleanKey = key.trim().replace(/^\/+/, "");
  if (!PRIVATE_MEDIA_KEY.video.test(cleanKey) && !PRIVATE_MEDIA_KEY.photo.test(cleanKey)) {
    return new Response(JSON.stringify({ error: "Clé non autorisée" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const signedUrl = await signR2GetUrl(env, cleanKey);
    if (!signedUrl) {
      return new Response(JSON.stringify({ error: "Configuration stockage indisponible" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return signedMediaRedirect(signedUrl);
  } catch (err: any) {
    console.error("[media] Erreur génération URL présignée:", err);
    return new Response(JSON.stringify({ error: "Fichier média introuvable" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
}

type R2ObjectClient = {
  send(command: HeadObjectCommand | GetObjectCommand): Promise<any>;
};

function r2BodyToReadableStream(body: unknown): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  const streamWithMixin = body as { transformToWebStream?: () => ReadableStream<Uint8Array> };
  if (typeof streamWithMixin.transformToWebStream === "function") {
    return streamWithMixin.transformToWebStream();
  }

  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return body as ReadableStream<Uint8Array>;
  }

  const iterable = body as AsyncIterable<Uint8Array>;
  if (typeof iterable[Symbol.asyncIterator] !== "function") return null;

  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

function memoryVideoKey(videoUrl: string, requestOrigin: string): { key: string; contentType: string } | null {
  // `video_url` is an internal pointer written by the existing upload/admin flow.
  // Only this server-side value is accepted; a caller can never provide an R2 key.
  const key = privateMediaKey(videoUrl, requestOrigin, "video");
  if (!key) return null;

  const extension = key.split(".").pop()?.toLowerCase();
  const contentTypeByExtension: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };
  const contentType = extension ? contentTypeByExtension[extension] : undefined;
  return contentType ? { key, contentType } : null;
}

/**
 * NFC entry point: resolve an active memory server-side, then stream its
 * private R2 object through the permanent MÉMORA URL. No R2 URL is exposed.
 */
export async function handleNfcMemoryRoute(
  request: Request,
  env: any,
  slug: string,
  dependencies?: { supabaseAdmin?: any; r2Client?: R2ObjectClient },
): Promise<Response> {
  const unavailable = () =>
    new Response("Souvenir introuvable ou indisponible", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });

  const unavailableService = () =>
    new Response("Service vidéo indisponible", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });

  // A route segment has already excluded '/', but reject malformed values before
  // querying the database. Existing order-derived slugs remain valid.
  if (!slug || slug.length > 160 || /[\0\r\n]/.test(slug)) return unavailable();

  try {
    const supabaseAdmin = dependencies?.supabaseAdmin ?? getSupabaseAdmin(env);
    const { data: memory, error } = await supabaseAdmin
      .from("memories")
      .select("video_url")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (error || !memory?.video_url) return unavailable();

    const video = memoryVideoKey(memory.video_url, new URL(request.url).origin);
    if (!video) return unavailable();

    const accountId = env?.R2_ACCOUNT_ID || (typeof process !== "undefined" ? process.env?.["R2_ACCOUNT_ID"] : "") || "";
    const accessKeyId = env?.R2_ACCESS_KEY_ID || (typeof process !== "undefined" ? process.env?.["R2_ACCESS_KEY_ID"] : "") || "";
    const secretAccessKey = env?.R2_SECRET_ACCESS_KEY || (typeof process !== "undefined" ? process.env?.["R2_SECRET_ACCESS_KEY"] : "") || "";
    const bucketName = env?.R2_BUCKET_NAME || (typeof process !== "undefined" ? process.env?.["R2_BUCKET_NAME"] : "") || "memora-videos";

    if ((!accountId || !accessKeyId || !secretAccessKey) && !dependencies?.r2Client) return unavailableService();

    const r2Client = dependencies?.r2Client ?? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const head = await r2Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: video.key }));
    const totalSize = head.ContentLength;
    if (!Number.isSafeInteger(totalSize) || totalSize <= 0) return unavailable();

    const lastModified = head.LastModified instanceof Date ? head.LastModified.toUTCString() : undefined;
    const etag = head.ETag || `\"memora-${totalSize}-${head.LastModified?.getTime?.() ?? 0}\"`;
    const decision = resolveStreamingResponse({
      method: request.method as "GET" | "HEAD",
      rangeHeader: request.headers.get("range"),
      ifRangeHeader: request.headers.get("if-range"),
      ifNoneMatchHeader: request.headers.get("if-none-match"),
      ifModifiedSinceHeader: request.headers.get("if-modified-since"),
      totalSize,
      contentType: video.contentType,
      etag,
      lastModified,
    });

    const extension = video.key.split(".").pop()?.toLowerCase() ?? "mp4";
    const filename = `${slug.replace(/[^a-zA-Z0-9._-]/g, "_")}.${extension}`;
    const headers = new Headers(decision.headers);
    headers.set("Content-Disposition", `inline; filename=\"${filename}\"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    if (decision.isHead || decision.status === 304 || decision.status === 416) {
      return new Response(null, { status: decision.status, headers });
    }

    const getInput = {
      Bucket: bucketName,
      Key: video.key,
      ...(decision.range
        ? { Range: `bytes=${decision.range.start}-${decision.range.end}` }
        : {}),
    };
    const object = await r2Client.send(new GetObjectCommand(getInput));
    const body = r2BodyToReadableStream(object.Body);
    if (!body) return unavailableService();

    return new Response(body, { status: decision.status, headers });
  } catch (error) {
    console.error("[nfc-memory] Unable to stream video:", error);
    return unavailableService();
  }
}

/** Client service role pour les routes admin, ou null si la configuration manque. */
function getServiceRoleClient(env: any): any {
  const supabaseUrl =
    env?.VITE_SUPABASE_URL ||
    env?.SUPABASE_URL ||
    (typeof process !== "undefined"
      ? process.env?.["VITE_SUPABASE_URL"] || process.env?.["SUPABASE_URL"]
      : "");
  const serviceKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== "undefined" ? process.env?.["SUPABASE_SERVICE_ROLE_KEY"] : "");
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function handleDeleteOrderRoute(
  request: Request,
  env: any,
  dependencies?: { supabaseAdmin?: any },
): Promise<Response> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

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

  if (fetchErr || !order) {
    return new Response(JSON.stringify({ error: "Commande introuvable" }), {
      status: 404,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (order.status !== "cancelled") {
    return new Response(
      JSON.stringify({
        error: `Suppression interdite : la commande #${order.order_number} est au statut '${order.status}'. Seules les commandes annulées peuvent être supprimées. Une commande payée ne peut jamais être supprimée.`,
      }),
      {
        status: 400,
        headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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
      // Vercel Cron appelle les routes en GET
      if (url.pathname === "/api/upload/purge" && (request.method === "POST" || request.method === "GET")) {
        return await handleOrphanPurgeRoute(request, env);
      }
      if (url.pathname === "/api/upload/proxy-put" && (request.method === "PUT" || request.method === "POST")) {
        return await handleProxyPutRoute(request, env);
      }
      if (url.pathname === "/api/media" && request.method === "GET") {
        return await handleMediaRoute(request, env);
      }
      if (url.pathname === "/api/memory-media" && (request.method === "GET" || request.method === "HEAD")) {
        return await handleMemoryMediaRoute(request, env);
      }
      if (url.pathname === "/api/nfc-video" && (request.method === "GET" || request.method === "HEAD")) {
        const slug = url.searchParams.get("slug") ?? "";
        return await handleNfcMemoryRoute(request, env, slug);
      }
      if (url.pathname === "/api/whatsapp/webhook" || url.pathname.startsWith("/api/admin/whatsapp/")) {
        const whatsappResponse = await routeWhatsApp(request, env, ctx, {
          supabaseAdmin: () => getSupabaseAdmin(env),
          supabaseAdminOrNull: () => getServiceRoleClient(env),
          storage: () => getR2Adapter(env),
          signMediaUrl: (key) => signR2GetUrl(env, key),
        });
        if (whatsappResponse) return whatsappResponse;
      }
      if (url.pathname === "/api/internal/order-created" || url.pathname.startsWith("/api/admin/push/")) {
        const pushResponse = await routePush(request, env, {
          getSupabase: () => getServiceRoleClient(env),
        });
        if (pushResponse) return pushResponse;
      }
      if (url.pathname === "/api/admin/orders" && request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          },
        });
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
