/**
 * MÉMORA — Composants Backend Cloudflare R2 & Gestionnaire Sécurisé d'Upload (Phase 1.6)
 *
 * Ce module implémente les deux composants backend distincts exigés par l'audit :
 *
 * 1. Upload Verification (Vérification et complétion de l'intention d'upload) :
 *    - Reçoit intent_id et draft_token.
 *    - Vérifie IMMÉDIATEMENT le draft_token_hash avec comparaison en temps constant.
 *    - Ne fait JAMAIS appel à Cloudflare R2 si le token est invalide.
 *    - Ne fait JAMAIS confiance au client pour la storage_key.
 *    - Récupère storage_key et file_size_bytes de manière fiable depuis PostgreSQL.
 *    - Exécute HeadObject sur Cloudflare R2 après validation d'authentification.
 *    - Vérifie la présence de l'objet et l'égalité exacte de taille (ContentLength === file_size_bytes).
 *    - Appelle complete_upload_intent avec p_verified_size_bytes.
 *    - Valide explicitement rpcData.success === true.
 *
 * 2. Orphan Purge (Protocole de purge à bail en deux phases) :
 *    - Réclame les intentions orphelines via claim_orphan_upload_intents_for_purge.
 *    - Exécute DeleteObject sur Cloudflare R2 avec politique de retry à backoff exponentiel réel.
 *    - Traite uniquement les réponses 200, 204 et 404 (NoSuchKey) comme des succès idempotents.
 *    - Ne confirme la suppression en base (confirm_purge_upload_intents) QU'APRÈS succès garanti de R2.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface R2HeadResult {
  exists: boolean;
  contentLength: number;
  etag?: string | undefined;
  contentType?: string | undefined;
  lastModified?: Date | undefined;
}

export interface R2PutOptions {
  contentType?: string | undefined;
  customMetadata?: Record<string, string> | undefined;
}

export interface R2PutResult {
  success: boolean;
  etag?: string | undefined;
  error?: string | undefined;
}

export interface PresignedPutOptions {
  key: string;
  contentType: string;
  expiresInSeconds?: number | undefined;
}

export interface PresignedPutResult {
  url: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface R2StorageAdapter {
  headObject(key: string): Promise<R2HeadResult>;
  deleteObject(key: string): Promise<{ success: boolean; error?: string }>;
  putObject(
    key: string,
    payload: Uint8Array | ArrayBuffer | string,
    options?: R2PutOptions
  ): Promise<R2PutResult>;
  getPresignedPutUrl?(options: PresignedPutOptions): Promise<PresignedPutResult>;
}

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

export interface PurgeOptions {
  batchSize?: number | undefined;
  leaseSeconds?: number | undefined;
  maxRetries?: number | undefined;
}

export interface PurgeResult {
  claimed_count: number;
  r2_deleted_count: number;
  confirmed_db_count: number;
  failed_count: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * Comparaison cryptographique sécurisée (Double-HMAC via Web Crypto API standard).
 * Utilise une clé éphémère pour générer un HMAC de chaque chaîne avant vérification.
 * Garantit la non-divulgation de la longueur de la chaîne secrète et s'exécute dans
 * le moteur cryptographique natif (BoringSSL/OpenSSL).
 */
export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sigA = await crypto.subtle.sign("HMAC", key, aBytes);
  return await crypto.subtle.verify("HMAC", key, sigA, bBytes);
}

/**
 * Encode un segment d'URI conformément à la RFC 3986 exigée par AWS SigV4.
 * encodeURIComponent n'encode pas !, ', (, ), * qui doivent être encodés en hexadécimal.
 */
export function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Encode une clé d'objet S3 en préservant strictement les séparateurs de sous-répertoires '/'
 */
export function encodeS3UriPath(key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  return cleanKey
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

/**
 * Calcul SHA-256 hexadécimal UTF-8 (strictement équivalent à public.memora_sha256).
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", bytes as any);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Adaptateur pour R2 Bucket binding natif Cloudflare Worker (env.MEMORA_VIDEOS_BUCKET ou env.BUCKET)
 */
export class CloudflareR2BindingAdapter implements R2StorageAdapter {
  constructor(private bucket: any) {
    if (
      !bucket ||
      typeof bucket.head !== "function" ||
      typeof bucket.delete !== "function" ||
      typeof bucket.put !== "function"
    ) {
      throw new Error(
        "Binding Cloudflare R2 incomplet : méthodes head, delete et put requises"
      );
    }
  }

  async headObject(key: string): Promise<R2HeadResult> {
    const cleanKey = key.replace(/^\/+/, "");
    const obj = await this.bucket.head(cleanKey);
    if (!obj) {
      return { exists: false, contentLength: 0 };
    }
    return {
      exists: true,
      contentLength: obj.size,
      etag: obj.httpEtag ?? obj.etag,
      contentType: obj.httpMetadata?.contentType,
      lastModified: obj.uploaded,
    };
  }

  async deleteObject(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanKey = key.replace(/^\/+/, "");
      await this.bucket.delete(cleanKey);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erreur R2 delete" };
    }
  }

  async putObject(
    key: string,
    payload: Uint8Array | ArrayBuffer | string,
    options?: R2PutOptions
  ): Promise<R2PutResult> {
    try {
      if (typeof this.bucket.put !== "function") {
        return { success: false, error: "Binding R2 ne supporte pas put()" };
      }
      const cleanKey = key.replace(/^\/+/, "");
      const obj = await this.bucket.put(cleanKey, payload, {
        httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
        customMetadata: options?.customMetadata,
      });
      return {
        success: true,
        etag: obj?.httpEtag ?? obj?.etag,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erreur R2 put" };
    }
  }

  async getPresignedPutUrl(_options: PresignedPutOptions): Promise<PresignedPutResult> {
    throw new Error(
      "CloudflareR2BindingAdapter ne supporte pas la génération d'URL présignées S3. Utilisez S3CompatibleR2Adapter configuré avec R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY."
    );
  }
}

export interface S3R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * Adaptateur de stockage S3 / R2 compatible SigV4 via Web Crypto API native
 * (Ne nécessite aucune dépendance externe comme @aws-sdk/client-s3)
 */
export class S3CompatibleR2Adapter implements R2StorageAdapter {
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucketName: string;

  constructor(config: S3R2Config) {
    const accountId = config?.accountId?.trim() ?? "";
    const accessKeyId = config?.accessKeyId?.trim() ?? "";
    const secretAccessKey = config?.secretAccessKey?.trim() ?? "";
    const bucketName = config?.bucketName?.trim() ?? "";

    if (!accountId || !/^[a-zA-Z0-9_-]{8,64}$/.test(accountId)) {
      throw new Error(
        "Configuration R2 invalide : accountId doit comporter entre 8 et 64 caractères alphanumériques"
      );
    }
    if (!accessKeyId || accessKeyId.length < 8) {
      throw new Error("Configuration R2 invalide : accessKeyId obligatoire (au moins 8 caractères)");
    }
    if (!secretAccessKey || secretAccessKey.length < 16) {
      throw new Error(
        "Configuration R2 invalide : secretAccessKey obligatoire (au moins 16 caractères)"
      );
    }
    if (!bucketName || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)) {
      throw new Error(
        "Configuration R2 invalide : bucketName doit être un nom DNS conforme (3 à 63 caractères minuscules, chiffres, tirets)"
      );
    }

    this.accountId = accountId;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.bucketName = bucketName;
  }

  private get endpoint(): string {
    return `https://${this.accountId}.r2.cloudflarestorage.com/${this.bucketName}`;
  }

  async headObject(key: string): Promise<R2HeadResult> {
    const { url, headers } = await this.signRequest("HEAD", key);
    const resp = await fetch(url, {
      method: "HEAD",
      headers: { ...headers, "accept-encoding": "identity" },
    });

    if (resp.status === 404) {
      return { exists: false, contentLength: 0 };
    }
    if (!resp.ok) {
      throw new Error(`R2 HeadObject a retourné HTTP ${resp.status}`);
    }

    const cl = resp.headers.get("content-length");
    return {
      exists: true,
      contentLength: cl ? parseInt(cl, 10) : 0,
      etag: resp.headers.get("etag") ?? undefined,
      contentType: resp.headers.get("content-type") ?? undefined,
    };
  }

  async deleteObject(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { url, headers } = await this.signRequest("DELETE", key);
      const resp = await fetch(url, { method: "DELETE", headers });

      // S3 et R2 retournent 204 No Content ou 200 sur DeleteObject réussi
      if (resp.status === 204 || resp.status === 200) {
        return { success: true };
      }

      // En cas de 404, seule l'erreur spécifique NoSuchKey est un succès idempotent
      if (resp.status === 404) {
        const bodyText = await resp.text();
        if (bodyText.includes("<Code>NoSuchKey</Code>")) {
          return { success: true };
        }
        return {
          success: false,
          error: "R2 DeleteObject: Ressource ou Bucket introuvable (404)",
        };
      }

      return { success: false, error: `R2 DeleteObject a retourné HTTP ${resp.status}` };
    } catch {
      return { success: false, error: "Erreur réseau S3 DeleteObject" };
    }
  }

  async putObject(
    key: string,
    payload: Uint8Array | ArrayBuffer | string,
    options?: R2PutOptions
  ): Promise<R2PutResult> {
    try {
      const payloadBytes =
        typeof payload === "string"
          ? new TextEncoder().encode(payload)
          : payload instanceof Uint8Array
          ? payload
          : new Uint8Array(payload);

      const { url, headers } = await this.signRequest(
        "PUT",
        key,
        payloadBytes,
        options?.contentType
      );

      const resp = await fetch(url, {
        method: "PUT",
        headers,
        body: payloadBytes as any,
      });

      if (resp.status === 200 || resp.status === 204) {
        return {
          success: true,
          etag: resp.headers.get("etag") ?? undefined,
        };
      }

      return {
        success: false,
        error: `R2 PutObject a retourné HTTP ${resp.status}`,
      };
    } catch {
      return { success: false, error: "Erreur réseau S3 PutObject" };
    }
  }

  async getPresignedPutUrl(
    options: PresignedPutOptions,
    now: Date = new Date()
  ): Promise<PresignedPutResult> {
    if (!options || typeof options !== "object") {
      throw new Error("Options de génération d'URL présignée invalides ou manquantes");
    }

    const { key, contentType, expiresInSeconds = 900 } = options;

    // 1. Validation stricte de la clé d'objet
    if (typeof key !== "string" || !key.trim()) {
      throw new Error("Clé d'objet R2 invalide : chaîne non vide requise");
    }
    const cleanKey = key.trim().replace(/^\/+/, "");
    if (!cleanKey) {
      throw new Error("Clé d'objet R2 invalide : ne peut pas être vide");
    }
    if (cleanKey.includes("\0")) {
      throw new Error("Clé d'objet R2 invalide : présence d'un octet nul interdit");
    }
    // Détection de traversée de répertoire (path traversal)
    const segments = cleanKey.split("/");
    if (segments.some((segment) => segment === ".." || segment === ".")) {
      throw new Error("Clé d'objet R2 invalide : traversée de chemin interdite ('..' ou '.')");
    }

    // 2. Validation stricte du Content-Type
    if (typeof contentType !== "string" || !contentType.trim()) {
      throw new Error("Content-Type R2 invalide : chaîne non vide requise");
    }
    if (/[\r\n\0]/.test(contentType)) {
      throw new Error("Content-Type R2 invalide : caractères de contrôle ou retours à la ligne interdits");
    }
    const cleanContentType = contentType.trim();
    // Validation syntaxe MIME standard (RFC 2045/RFC 7231)
    if (
      !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:\s*;\s*[a-zA-Z0-9!#$&^_.+-]+=(?:"[a-zA-Z0-9!#$&^_.+-]+"|[a-zA-Z0-9!#$&^_.+-]+))*$/.test(
        cleanContentType
      )
    ) {
      throw new Error(`Content-Type R2 invalide : format MIME non conforme (${cleanContentType})`);
    }

    // 3. Validation de l'expiration (max 900 secondes = 15 minutes)
    if (
      typeof expiresInSeconds !== "number" ||
      !Number.isInteger(expiresInSeconds) ||
      isNaN(expiresInSeconds) ||
      !isFinite(expiresInSeconds)
    ) {
      throw new Error("Expiration R2 invalide : entier positif requis");
    }
    if (expiresInSeconds <= 0) {
      throw new Error("Expiration R2 invalide : doit être strictement supérieure à 0 seconde");
    }
    if (expiresInSeconds > 900) {
      throw new Error("Expiration R2 invalide : ne peut pas dépasser 900 secondes (15 minutes)");
    }

    // 4. Construction de l'URL et des paramètres temporels AWS SigV4
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    const region = "auto";
    const service = "s3";

    const encodedKeyPath = encodeS3UriPath(cleanKey);
    const url = `${this.endpoint}/${encodedKeyPath}`;
    const parsedUrl = new URL(url);

    const host = parsedUrl.host;
    const path = parsedUrl.pathname;

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    // 5. Canonical Query String
    // Les paramètres doivent être triés par ordre lexicographique strict (ASCII) selon la RFC 3986 :
    // X-Amz-Algorithm < X-Amz-Credential < X-Amz-Date < X-Amz-Expires < X-Amz-SignedHeaders
    const signedHeaders = "content-type;host";
    const canonicalQueryString =
      `X-Amz-Algorithm=AWS4-HMAC-SHA256&` +
      `X-Amz-Credential=${encodeRfc3986(this.accessKeyId)}%2F${dateStamp}%2F${region}%2F${service}%2Faws4_request&` +
      `X-Amz-Date=${amzDate}&` +
      `X-Amz-Expires=${expiresInSeconds}&` +
      `X-Amz-SignedHeaders=${encodeRfc3986(signedHeaders)}`;

    // 6. Canonical Headers (triés alphabétiquement : content-type < host)
    const canonicalHeaders =
      `content-type:${cleanContentType}\n` +
      `host:${host}\n`;

    // 7. Canonical Request
    // Méthode (PUT) + \n + Path + \n + QueryString + \n + CanonicalHeaders + \n + SignedHeaders + \n + Payload (UNSIGNED-PAYLOAD)
    const canonicalRequest =
      `PUT\n` +
      `${path}\n` +
      `${canonicalQueryString}\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `UNSIGNED-PAYLOAD`;

    const canonicalReqHash = await sha256Hex(canonicalRequest);

    // 8. String to Sign
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalReqHash}`;

    // 9. Calcul de la Signature SigV4
    const kDate = await this.hmac("AWS4" + this.secretAccessKey, dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, "aws4_request");
    const signature = await this.hmacHex(kSigning, stringToSign);

    // 10. Assemblage de l'URL finale présignée
    const presignedUrl = `${url}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    return {
      url: presignedUrl,
      requiredHeaders: {
        "Content-Type": cleanContentType,
      },
      expiresAt,
    };
  }

  private async signRequest(
    method: "HEAD" | "DELETE" | "PUT",
    key: string,
    payload: Uint8Array = new Uint8Array(0),
    contentType?: string
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const encodedKeyPath = encodeS3UriPath(key);
    const url = `${this.endpoint}/${encodedKeyPath}`;
    const parsedUrl = new URL(url);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    const region = "auto";
    const service = "s3";

    const host = parsedUrl.host;
    const path = parsedUrl.pathname;

    const payloadHash = await sha256Hex(payload);

    let canonicalHeaders = "";
    let signedHeaders = "";

    if (contentType && contentType.trim()) {
      // Tri alphabétique strict ASCII : content-type < host < x-amz-content-sha256 < x-amz-date
      canonicalHeaders =
        `content-type:${contentType.trim()}\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
      signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    } else {
      canonicalHeaders =
        `host:${host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
      signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    }

    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const canonicalReqHash = await sha256Hex(canonicalRequest);

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalReqHash}`;

    const kDate = await this.hmac("AWS4" + this.secretAccessKey, dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, "aws4_request");
    const signature = await this.hmacHex(kSigning, stringToSign);

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      authorization,
    };
    if (contentType && contentType.trim()) {
      headers["content-type"] = contentType.trim();
    }

    return { url, headers };
  }

  private async hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
    const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
    const arrayBuffer = rawKey.buffer.slice(
      rawKey.byteOffset,
      rawKey.byteOffset + rawKey.byteLength
    ) as ArrayBuffer;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      arrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
    return new Uint8Array(sig);
  }

  private async hmacHex(key: Uint8Array, data: string): Promise<string> {
    const res = await this.hmac(key, data);
    return Array.from(res)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

/**
 * COMPOSANT 1 : Upload Verification
 *
 * 1. Reçoit intent_id et draft_token.
 * 2. Vérifie immédiatement l'empreinte du token avant TOUT appel au stockage distant.
 * 3. Lit storage_key et file_size_bytes de manière fiable depuis PostgreSQL.
 * 4. N'accepte JAMAIS une storage_key passée par le client.
 * 5. Exécute HeadObject sur R2 pour vérifier l'existence et la taille exacte.
 * 6. Appelle complete_upload_intent (exclusivement avec service_role) avec p_verified_size_bytes.
 * 7. Valide explicitement le résultat métier rpcData.success.
 */
export async function verifyAndCompleteUploadIntent(
  supabaseAdmin: SupabaseClient,
  storage: R2StorageAdapter,
  request: VerificationRequest
): Promise<VerificationResult> {
  const { intent_id, draft_token } = request;

  if (!intent_id || typeof intent_id !== "string" || !intent_id.trim()) {
    return { success: false, intent_id: intent_id ?? "", error: "intent_id obligatoire", code: "INVALID_PARAM" };
  }
  if (!draft_token || typeof draft_token !== "string" || !draft_token.trim()) {
    return { success: false, intent_id, error: "draft_token obligatoire", code: "INVALID_PARAM" };
  }

  // 1. Lecture directe et sécurisée dans PostgreSQL (avec service_role)
  const { data: intent, error: fetchErr } = await supabaseAdmin
    .from("upload_intents")
    .select("id, status, storage_key, file_size_bytes, expires_at, order_id, draft_token_hash")
    .eq("id", intent_id)
    .maybeSingle();

  if (fetchErr) {
    return { success: false, intent_id, error: "Erreur de base de données lors de la vérification", code: "DATABASE_ERROR" };
  }
  if (!intent) {
    return { success: false, intent_id, error: "Intention d'upload introuvable", code: "INTENT_NOT_FOUND" };
  }

  // 2. VÉRIFICATION IMMÉDIATE DU TOKEN AVANT TOUT ACCÈS AU STOCKAGE DISTANT (P0)
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

  // 3. Vérification de validité temporelle (avec protection contre les dates NaN)
  const expiresAtMs = new Date(intent.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
    return {
      success: false,
      intent_id,
      error: "L'intention d'upload a expiré ou est invalide",
      code: "INTENT_EXPIRED",
    };
  }

  // 4. Vérification de statut : prêt à être vérifié
  // Le token a déjà été formellement validé à l'étape 2
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

  // 5. Exécution HeadObject sur le stockage R2 UNIQUEMENT après validation positive du token
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

  // 6. Vérification stricte de l'égalité de taille
  if (headResult.contentLength !== intent.file_size_bytes) {
    return {
      success: false,
      intent_id,
      error: `Taille constatée (${headResult.contentLength} octets) non conforme à la taille déclarée (${intent.file_size_bytes} octets)`,
      code: "SIZE_MISMATCH",
    };
  }

  // 7. Appel de la fonction de finalisation SQL réservée à service_role
  // Signature exacte : p_verified_size_bytes (BIGINT)
  const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("complete_upload_intent", {
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

  // 8. Validation stricte du résultat métier de la RPC (P0)
  if (!rpcData || typeof rpcData !== "object" || (rpcData as any).success !== true) {
    const reason = (rpcData as any)?.reason ?? "COMPLETION_REJECTED";
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
    status: (rpcData as any)?.status ?? "ready",
    verified_size: headResult.contentLength,
  };
}

/**
 * COMPOSANT 2 : Orphan Purge
 *
 * 1. Réclame les intentions orphelines via claim_orphan_upload_intents_for_purge.
 * 2. Exécute DeleteObject sur Cloudflare R2 avec retries à backoff exponentiel réel.
 * 3. Confirme la suppression en base via confirm_purge_upload_intents UNIQUEMENT après succès R2.
 */
export async function purgeOrphanUploadIntents(
  supabaseAdmin: SupabaseClient,
  storage: R2StorageAdapter,
  options: PurgeOptions = {}
): Promise<PurgeResult> {
  const batchSize = options.batchSize ?? 50;
  const leaseSeconds = options.leaseSeconds ?? 300;
  const maxRetries = options.maxRetries ?? 3;

  // 1. Réclamation atomique des cibles avec token de bail exclusif
  const { data: claimedRows, error: claimErr } = await supabaseAdmin.rpc(
    "claim_orphan_upload_intents_for_purge",
    {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
    }
  );

  if (claimErr) {
    throw new Error(`Échec réclamation des orphelins SQL: ${claimErr.message}`);
  }

  if (!claimedRows || claimedRows.length === 0) {
    return {
      claimed_count: 0,
      r2_deleted_count: 0,
      confirmed_db_count: 0,
      failed_count: 0,
      errors: [],
    };
  }

  const purgeToken: string = claimedRows[0].purge_token;
  const successfullyDeletedIds: string[] = [];
  const errors: Array<{ key: string; error: string }> = [];

  // 2. Suppression R2 avec politique de retry à backoff exponentiel réel
  for (const item of claimedRows) {
    let attempts = 0;
    let deleted = false;
    let lastErr = "";

    while (attempts < maxRetries && !deleted) {
      attempts++;
      const res = await storage.deleteObject(item.storage_key);
      if (res.success) {
        deleted = true;
      } else {
        lastErr = res.error ?? "Erreur inconnue";
        if (attempts < maxRetries) {
          // Backoff exponentiel réel : 100ms, 200ms, 400ms...
          const delayMs = Math.min(100 * Math.pow(2, attempts - 1), 2000);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    if (deleted) {
      successfullyDeletedIds.push(item.claimed_id);
    } else {
      errors.push({ key: item.storage_key, error: lastErr });
    }
  }

  // 3. Confirmation finale en base UNIQUEMENT pour les objets réellement supprimés de R2
  let confirmedDbCount = 0;
  if (successfullyDeletedIds.length > 0) {
    const { data: delCount, error: confirmErr } = await supabaseAdmin.rpc(
      "confirm_purge_upload_intents",
      {
        p_purged_ids: successfullyDeletedIds,
        p_purge_token: purgeToken,
      }
    );

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
    r2_deleted_count: successfullyDeletedIds.length,
    confirmed_db_count: confirmedDbCount,
    failed_count: errors.length,
    errors,
  };
}
