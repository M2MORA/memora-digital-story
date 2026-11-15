/**
 * Upload intent : création (lien PUT présigné), vérification (HeadObject + complétion,
 * puis prolongation de 24 h) et purge des orphelins des intentions d'upload.
 *
 * Seul propriétaire JS des statuts et de l'expiration. SQL applique aussi l'expiration
 * (create_upload_intent fixe expires_at, complete_upload_intent et finalize_order la refusent) :
 * toute modification de ces règles doit être reportée dans les migrations.
 */

import type { PresignedPutResult, R2HeadResult, R2StorageAdapter } from "../lib/r2-backend";
import { checkFile, FILE_RULES, normalizeExtension, type UploadKind } from "../lib/file-rules";
import { sha256Hex, timingSafeCompare } from "./crypto";

export const UPLOAD_INTENT_STATUSES = [
  "pending",
  "uploading",
  "ready",
  "consumed",
  "purging",
  "cancelled",
  "expired",
] as const;
export type UploadIntentStatus = (typeof UPLOAD_INTENT_STATUSES)[number];

const ACTIVE_INTENT_STATUSES: UploadIntentStatus[] = ["pending", "uploading", "ready"];
/** Un fichier vérifié reste utilisable 24 h, le temps que le client termine sa commande. */
export const READY_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PRESIGNED_PUT_EXPIRES_SECONDS = 900;

export interface UploadIntentDependencies {
  /** Client Supabase service role (lève si non configuré). */
  db: () => any;
  /** Vérification HeadObject : binding Cloudflare ou adaptateur S3. */
  storage: () => Pick<R2StorageAdapter, "headObject">;
  /** Liens PUT présignés : exige les identifiants S3 (un binding ne sait pas signer). */
  uploadSigner: () => Required<Pick<R2StorageAdapter, "getPresignedPutUrl">>;
  /** Horloge en millisecondes (Date.now). */
  now: () => number;
}

// ---------------------------------------------------------------------------
// Validation de la requête de création
// ---------------------------------------------------------------------------

export interface UploadIntentRequest {
  draftId: string;
  draftToken: string;
  itemId: string | null;
  fileKind: UploadKind;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileExtension: string;
}

/** Premier champ refusé, dans l'ordre des contrôles. */
export type UploadIntentIssue =
  | "body"
  | "draft_id"
  | "draft_token"
  | "file_kind"
  | "file_name"
  | "file_extension"
  | `${UploadKind}_extension`
  | "mime_type"
  | `${UploadKind}_mime`
  | "file_size_bytes"
  | `${UploadKind}_size`
  | "item_id";

export type UploadIntentCheck =
  { ok: true; request: UploadIntentRequest } | { ok: false; issue: UploadIntentIssue };

export function checkUploadIntentRequest(body: unknown): UploadIntentCheck {
  const fail = (issue: UploadIntentIssue): UploadIntentCheck => ({ ok: false, issue });
  if (!body || typeof body !== "object") return fail("body");

  const {
    draft_id,
    draft_token,
    item_id,
    file_kind,
    file_name,
    mime_type,
    file_size_bytes,
    file_extension,
  } = body as Record<string, unknown>;

  if (typeof draft_id !== "string" || !/^[a-zA-Z0-9_-]{3,64}$/.test(draft_id.trim())) {
    return fail("draft_id");
  }
  if (typeof draft_token !== "string" || draft_token.trim().length < 8) return fail("draft_token");
  if (file_kind !== "video" && file_kind !== "photo") return fail("file_kind");
  if (
    typeof file_name !== "string" ||
    !file_name.trim() ||
    file_name.length > 255 ||
    /[\0\r\n]/.test(file_name)
  ) {
    return fail("file_name");
  }

  if (typeof file_extension !== "string" || !file_extension.trim()) return fail("file_extension");
  const cleanExt = normalizeExtension(file_extension);
  if (!(FILE_RULES[file_kind].extensions as readonly string[]).includes(cleanExt)) {
    return fail(`${file_kind}_extension`);
  }

  if (typeof mime_type !== "string" || !mime_type.trim() || /[\r\n\0]/.test(mime_type)) {
    return fail("mime_type");
  }
  const cleanMime = mime_type.trim().toLowerCase();
  const fileCheck = checkFile(file_kind, {
    extension: cleanExt,
    mimeType: cleanMime,
    sizeBytes: typeof file_size_bytes === "number" ? file_size_bytes : 0,
  });
  if (fileCheck === "mime") return fail(`${file_kind}_mime`);

  if (
    typeof file_size_bytes !== "number" ||
    !Number.isInteger(file_size_bytes) ||
    file_size_bytes <= 0
  ) {
    return fail("file_size_bytes");
  }
  if (fileCheck === "size") return fail(`${file_kind}_size`);

  let itemId: string | null = null;
  if (item_id !== undefined && item_id !== null) {
    if (typeof item_id !== "string" || !item_id.trim() || item_id.length > 64) {
      return fail("item_id");
    }
    itemId = item_id.trim();
  }

  return {
    ok: true,
    request: {
      draftId: draft_id.trim(),
      draftToken: draft_token.trim(),
      itemId,
      fileKind: file_kind,
      fileName: file_name.trim(),
      mimeType: cleanMime,
      fileSizeBytes: file_size_bytes,
      fileExtension: cleanExt,
    },
  };
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export type CreateUploadIntentResult =
  | { ok: true; intentId: string; upload: PresignedPutResult }
  | {
      ok: false;
      reason:
        | "storage_unavailable"
        | "db_unavailable"
        | "quota"
        | "rpc_error"
        | "db_exception"
        | "rejected"
        | "presign_failed";
    };

/**
 * Libère le quota du panier avant une nouvelle intention : les intentions
 * expirées ne comptent plus, et celles du même média sont remplacées.
 * Limité au détenteur du draft_token. Un échec ici ne bloque pas l'envoi.
 */
async function releaseStaleUploadIntents(
  db: any,
  request: UploadIntentRequest,
  nowMs: number,
): Promise<void> {
  try {
    const tokenHash = await sha256Hex(request.draftToken);
    const now = new Date(nowMs).toISOString();

    await db
      .from("upload_intents")
      .update({ status: "expired", updated_at: now })
      .eq("draft_id", request.draftId)
      .eq("draft_token_hash", tokenHash)
      .in("status", ACTIVE_INTENT_STATUSES)
      .lt("expires_at", now);

    if (request.itemId) {
      await db
        .from("upload_intents")
        .update({ status: "cancelled", updated_at: now })
        .eq("draft_id", request.draftId)
        .eq("draft_token_hash", tokenHash)
        .eq("item_id", request.itemId)
        .eq("file_kind", request.fileKind)
        .in("status", ACTIVE_INTENT_STATUSES)
        .is("order_id", null);
    }
  } catch (err) {
    console.warn("[upload-intent] Libération des anciennes intentions impossible:", err);
  }
}

export async function createUploadIntent(
  deps: UploadIntentDependencies,
  request: UploadIntentRequest,
): Promise<CreateUploadIntentResult> {
  let signer: ReturnType<UploadIntentDependencies["uploadSigner"]>;
  try {
    signer = deps.uploadSigner();
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }

  let db: any;
  try {
    db = deps.db();
  } catch {
    return { ok: false, reason: "db_unavailable" };
  }

  await releaseStaleUploadIntents(db, request, deps.now());

  let rpcData: any;
  try {
    const { data, error } = await db.rpc("create_upload_intent", {
      p_draft_id: request.draftId,
      p_draft_token: request.draftToken,
      p_file_kind: request.fileKind,
      p_file_name: request.fileName,
      p_mime_type: request.mimeType,
      p_file_size_bytes: request.fileSizeBytes,
      p_file_extension: request.fileExtension,
      p_item_id: request.itemId,
    });
    if (error) {
      // Message levé par create_upload_intent (SQL) quand le panier atteint 20 fichiers
      const quota = (error.message || "").includes("Quota de fichiers atteint");
      return { ok: false, reason: quota ? "quota" : "rpc_error" };
    }
    rpcData = data;
  } catch {
    return { ok: false, reason: "db_exception" };
  }

  if (!rpcData || !rpcData.success || !rpcData.intent_id || !rpcData.storage_key) {
    return { ok: false, reason: "rejected" };
  }

  try {
    const upload = await signer.getPresignedPutUrl({
      key: rpcData.storage_key,
      contentType: request.mimeType,
      expiresInSeconds: PRESIGNED_PUT_EXPIRES_SECONDS,
    });
    return { ok: true, intentId: rpcData.intent_id, upload };
  } catch {
    return { ok: false, reason: "presign_failed" };
  }
}

// ---------------------------------------------------------------------------
// Vérification
// ---------------------------------------------------------------------------

export interface VerificationRequest {
  intent_id: string;
  draft_token: string;
}

export interface VerificationResult {
  success: boolean;
  intent_id: string;
  status?: string | undefined;
  verified_size?: number | undefined;
  error?: string | undefined;
  code?: string | undefined;
}

/** À n'appeler qu'après validation du draft_token. */
async function extendReadyUploadIntent(db: any, intentId: string, nowMs: number): Promise<void> {
  try {
    await db
      .from("upload_intents")
      .update({
        expires_at: new Date(nowMs + READY_INTENT_LIFETIME_MS).toISOString(),
        updated_at: new Date(nowMs).toISOString(),
      })
      .eq("id", intentId)
      .eq("status", "ready")
      .is("order_id", null);
  } catch (err) {
    console.warn("[upload-verify] Prolongation de l'intention impossible:", err);
  }
}

/**
 * 1. Vérifie l'empreinte du token avant TOUT appel au stockage distant.
 * 2. Lit storage_key et file_size_bytes depuis PostgreSQL (jamais depuis le client).
 * 3. HeadObject : existence et égalité exacte de taille.
 * 4. complete_upload_intent (service_role) puis contrôle de rpcData.success.
 * 5. Une intention prête est prolongée de 24 h.
 * Lève si la base ou le stockage ne sont pas configurés.
 */
export async function verifyUploadIntent(
  deps: UploadIntentDependencies,
  request: VerificationRequest,
): Promise<VerificationResult> {
  const db = deps.db();
  const storage = deps.storage();
  const result = await verifyAndComplete(db, storage, request, deps.now());
  if (result.success && result.status === "ready") {
    await extendReadyUploadIntent(db, request.intent_id, deps.now());
  }
  return result;
}

async function verifyAndComplete(
  db: any,
  storage: Pick<R2StorageAdapter, "headObject">,
  request: VerificationRequest,
  nowMs: number,
): Promise<VerificationResult> {
  const { intent_id, draft_token } = request;

  if (!intent_id || typeof intent_id !== "string" || !intent_id.trim()) {
    return {
      success: false,
      intent_id: intent_id ?? "",
      error: "intent_id obligatoire",
      code: "INVALID_PARAM",
    };
  }
  if (!draft_token || typeof draft_token !== "string" || !draft_token.trim()) {
    return { success: false, intent_id, error: "draft_token obligatoire", code: "INVALID_PARAM" };
  }

  const { data: intent, error: fetchErr } = await db
    .from("upload_intents")
    .select("id, status, storage_key, file_size_bytes, expires_at, order_id, draft_token_hash")
    .eq("id", intent_id)
    .maybeSingle();

  if (fetchErr) {
    return {
      success: false,
      intent_id,
      error: "Erreur de base de données lors de la vérification",
      code: "DATABASE_ERROR",
    };
  }
  if (!intent) {
    return {
      success: false,
      intent_id,
      error: "Intention d'upload introuvable",
      code: "INTENT_NOT_FOUND",
    };
  }

  // Token vérifié AVANT tout accès au stockage distant
  const computedHash = await sha256Hex(draft_token);
  const isTokenValid = await timingSafeCompare(computedHash, intent.draft_token_hash || "");
  if (!isTokenValid) {
    return {
      success: false,
      intent_id,
      error: "Accès refusé : token d'autorisation invalide",
      code: "UNAUTHORIZED",
    };
  }

  const expiresAtMs = new Date(intent.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs < nowMs) {
    return {
      success: false,
      intent_id,
      error: "L'intention d'upload a expiré ou est invalide",
      code: "INTENT_EXPIRED",
    };
  }

  if (intent.status !== "pending" && intent.status !== "uploading") {
    if (intent.status === "ready") {
      return { success: true, intent_id, status: "ready", verified_size: intent.file_size_bytes };
    }
    return {
      success: false,
      intent_id,
      error: `Statut incompatible pour vérification: ${intent.status}`,
      code: "INVALID_STATUS",
    };
  }

  let headResult: R2HeadResult;
  try {
    headResult = await storage.headObject(intent.storage_key);
  } catch {
    return {
      success: false,
      intent_id,
      error: "Erreur lors de la vérification du stockage distant",
      code: "STORAGE_ERROR",
    };
  }

  if (!headResult.exists) {
    return {
      success: false,
      intent_id,
      error: "Fichier introuvable sur le stockage distant",
      code: "OBJECT_NOT_FOUND",
    };
  }

  if (headResult.contentLength !== intent.file_size_bytes) {
    return {
      success: false,
      intent_id,
      error: `Taille constatée (${headResult.contentLength} octets) non conforme à la taille déclarée (${intent.file_size_bytes} octets)`,
      code: "SIZE_MISMATCH",
    };
  }

  const { data: rpcData, error: rpcErr } = await db.rpc("complete_upload_intent", {
    p_intent_id: intent.id,
    p_draft_token: draft_token,
    p_verified_size_bytes: headResult.contentLength,
    p_verified_etag: headResult.etag ?? null,
    p_client_sha256: null,
  });

  if (rpcErr) {
    return {
      success: false,
      intent_id,
      error: "Échec de finalisation en base de données",
      code: rpcErr.code ?? "RPC_ERROR",
    };
  }

  if (!rpcData || typeof rpcData !== "object" || rpcData.success !== true) {
    const reason = rpcData?.reason ?? "COMPLETION_REJECTED";
    return {
      success: false,
      intent_id,
      error: `Complétion refusée par la base (${reason})`,
      code: reason,
    };
  }

  return {
    success: true,
    intent_id: intent.id,
    status: rpcData?.status ?? "ready",
    verified_size: headResult.contentLength,
  };
}

// ---------------------------------------------------------------------------
// Purge des orphelins (tâche planifiée)
// ---------------------------------------------------------------------------

export interface UploadPurgeDependencies {
  /** Client Supabase service role (lève si non configuré). */
  db: () => any;
  /** Suppression des objets : binding Cloudflare ou adaptateur S3. */
  storage: () => Pick<R2StorageAdapter, "deleteObject">;
  /** Secret attendu en `Authorization: Bearer …` ; vide = purge refusée. */
  cronSecret: () => string;
}

const MAX_DELETE_ATTEMPTS = 3;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Handler HTTP de /api/upload/purge (GET Vercel Cron ou POST).
 * Fail-closed sans secret, comparaison en temps constant, bornes strictes des paramètres.
 * Ne divulgue jamais les storage_key.
 */
export async function handleOrphanPurge(
  deps: UploadPurgeDependencies,
  request: Request,
): Promise<Response> {
  try {
    const cronSecret = deps.cronSecret();
    if (!cronSecret || typeof cronSecret !== "string" || !cronSecret.trim()) {
      return json(500, {
        error: "Configuration serveur incomplète (PURGE_CRON_SECRET non configuré)",
      });
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const isAuthorized = await timingSafeCompare(authHeader, `Bearer ${cronSecret.trim()}`);
    if (!isAuthorized) return json(401, { error: "Non autorisé" });

    let payload: { batch_size?: unknown; lease_seconds?: unknown } = {};
    try {
      payload = await request.json();
    } catch {
      // payload optionnel
    }

    let batchSize = 50;
    if (payload.batch_size !== undefined) {
      if (
        typeof payload.batch_size !== "number" ||
        !Number.isInteger(payload.batch_size) ||
        payload.batch_size < 1 ||
        payload.batch_size > 500
      ) {
        return json(400, {
          error: "Paramètre batch_size invalide (doit être un entier compris entre 1 et 500)",
        });
      }
      batchSize = payload.batch_size;
    }

    let leaseSeconds = 300;
    if (payload.lease_seconds !== undefined) {
      if (
        typeof payload.lease_seconds !== "number" ||
        !Number.isInteger(payload.lease_seconds) ||
        payload.lease_seconds < 30 ||
        payload.lease_seconds > 3600
      ) {
        return json(400, {
          error: "Paramètre lease_seconds invalide (doit être un entier compris entre 30 et 3600)",
        });
      }
      leaseSeconds = payload.lease_seconds;
    }

    return json(
      200,
      await purgeOrphanUploadIntents(deps.db(), deps.storage(), batchSize, leaseSeconds),
    );
  } catch {
    return json(500, { error: "Erreur lors du traitement de la purge" });
  }
}

/**
 * Purge à bail en deux phases :
 * 1. Réclame les intentions orphelines via claim_orphan_upload_intents_for_purge.
 * 2. DeleteObject avec retries à backoff exponentiel réel.
 * 3. Confirme en base via confirm_purge_upload_intents UNIQUEMENT après succès du stockage.
 */
async function purgeOrphanUploadIntents(
  db: any,
  storage: Pick<R2StorageAdapter, "deleteObject">,
  batchSize: number,
  leaseSeconds: number,
) {
  const { data: claimedRows, error: claimErr } = await db.rpc(
    "claim_orphan_upload_intents_for_purge",
    { p_batch_size: batchSize, p_lease_seconds: leaseSeconds },
  );
  if (claimErr) {
    throw new Error(`Échec réclamation des orphelins SQL: ${claimErr.message}`);
  }
  if (!claimedRows || claimedRows.length === 0) {
    return { claimed_count: 0, r2_deleted_count: 0, confirmed_db_count: 0, failed_count: 0 };
  }

  const purgeToken: string = claimedRows[0].purge_token;
  const deletedIds: string[] = [];
  let failedCount = 0;

  for (const item of claimedRows) {
    let deleted = false;
    for (let attempt = 1; attempt <= MAX_DELETE_ATTEMPTS && !deleted; attempt++) {
      deleted = (await storage.deleteObject(item.storage_key)).success;
      if (!deleted && attempt < MAX_DELETE_ATTEMPTS) {
        // Backoff exponentiel réel : 100ms, 200ms...
        await new Promise((r) => setTimeout(r, Math.min(100 * 2 ** (attempt - 1), 2000)));
      }
    }
    if (deleted) deletedIds.push(item.claimed_id);
    else failedCount++;
  }

  let confirmedDbCount = 0;
  if (deletedIds.length > 0) {
    const { data: delCount, error: confirmErr } = await db.rpc("confirm_purge_upload_intents", {
      p_purged_ids: deletedIds,
      p_purge_token: purgeToken,
    });
    if (confirmErr) {
      throw new Error(`Échec confirmation SQL des purges: ${confirmErr.message}`);
    }
    if (typeof delCount !== "number" || !Number.isInteger(delCount) || delCount < 0) {
      throw new Error(`Échec confirmation SQL des purges: retour invalide (${delCount})`);
    }
    confirmedDbCount = delCount;
  }

  return {
    claimed_count: claimedRows.length,
    r2_deleted_count: deletedIds.length,
    confirmed_db_count: confirmedDbCount,
    failed_count: failedCount,
  };
}
