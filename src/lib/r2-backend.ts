/**
 * MÉMORA — Composants Backend Cloudflare R2 & Gestionnaire Sécurisé d'Upload (Phase 1.6)
 *
 * Adaptateurs de stockage R2 (binding Cloudflare, S3 compatible).
 * DeleteObject traite uniquement 200, 204 et 404 (NoSuchKey) comme des succès idempotents.
 * Le cycle de vie des intentions d'upload (dont la purge) vit dans src/server/upload-intents.ts.
 */

import { sha256Hex } from "../server/crypto";

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

export interface R2ByteRange {
  start: number;
  end: number;
}

export interface R2StorageAdapter {
  headObject(key: string): Promise<R2HeadResult>;
  deleteObject(key: string): Promise<{ success: boolean; error?: string }>;
  putObject(
    key: string,
    payload: Uint8Array | ArrayBuffer | string,
    options?: R2PutOptions,
  ): Promise<R2PutResult>;
  getPresignedPutUrl?(options: PresignedPutOptions): Promise<PresignedPutResult>;
  /** Lien de lecture signé (GET), valable `expiresInSeconds`. */
  getSignedGetUrl?(key: string, expiresInSeconds?: number): Promise<string>;
  /** Lecture de l'objet, entière ou limitée à une plage d'octets inclusive. null si l'objet n'existe pas. */
  getObjectRange?(key: string, range?: R2ByteRange): Promise<ReadableStream<Uint8Array> | null>;
}

/**
 * Encode un segment d'URI conformément à la RFC 3986 exigée par AWS SigV4.
 * encodeURIComponent n'encode pas !, ', (, ), * qui doivent être encodés en hexadécimal.
 */
export function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
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
      throw new Error("Binding Cloudflare R2 incomplet : méthodes head, delete et put requises");
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
    options?: R2PutOptions,
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
      "CloudflareR2BindingAdapter ne supporte pas la génération d'URL présignées S3. Utilisez S3CompatibleR2Adapter configuré avec R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY.",
    );
  }

  async getSignedGetUrl(_key: string, _expiresInSeconds?: number): Promise<string> {
    throw new Error(
      "CloudflareR2BindingAdapter ne supporte pas la génération d'URL présignées S3. Utilisez S3CompatibleR2Adapter configuré avec R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY.",
    );
  }

  async getObjectRange(
    key: string,
    range?: R2ByteRange,
  ): Promise<ReadableStream<Uint8Array> | null> {
    const cleanKey = key.replace(/^\/+/, "");
    const obj = await this.bucket.get(
      cleanKey,
      range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined,
    );
    return obj?.body ?? null;
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

  // Résolu à l'appel : un fetch natif détaché de globalThis lève « Illegal invocation » sur Workers.
  constructor(
    config: S3R2Config,
    private fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    const accountId = config?.accountId?.trim() ?? "";
    const accessKeyId = config?.accessKeyId?.trim() ?? "";
    const secretAccessKey = config?.secretAccessKey?.trim() ?? "";
    const bucketName = config?.bucketName?.trim() ?? "";

    if (!accountId || !/^[a-zA-Z0-9_-]{8,64}$/.test(accountId)) {
      throw new Error(
        "Configuration R2 invalide : accountId doit comporter entre 8 et 64 caractères alphanumériques",
      );
    }
    if (!accessKeyId || accessKeyId.length < 8) {
      throw new Error(
        "Configuration R2 invalide : accessKeyId obligatoire (au moins 8 caractères)",
      );
    }
    if (!secretAccessKey || secretAccessKey.length < 16) {
      throw new Error(
        "Configuration R2 invalide : secretAccessKey obligatoire (au moins 16 caractères)",
      );
    }
    if (!bucketName || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)) {
      throw new Error(
        "Configuration R2 invalide : bucketName doit être un nom DNS conforme (3 à 63 caractères minuscules, chiffres, tirets)",
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
    const resp = await this.fetchFn(url, {
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
    const lastModified = resp.headers.get("last-modified");
    return {
      exists: true,
      contentLength: cl ? parseInt(cl, 10) : 0,
      etag: resp.headers.get("etag") ?? undefined,
      contentType: resp.headers.get("content-type") ?? undefined,
      lastModified: lastModified ? new Date(lastModified) : undefined,
    };
  }

  async getObjectRange(
    key: string,
    range?: R2ByteRange,
  ): Promise<ReadableStream<Uint8Array> | null> {
    const { url, headers } = await this.signRequest("GET", key);
    const resp = await this.fetchFn(url, {
      method: "GET",
      headers: range ? { ...headers, range: `bytes=${range.start}-${range.end}` } : headers,
    });

    if (resp.status === 404) return null;
    if (!resp.ok) {
      throw new Error(`R2 GetObject a retourné HTTP ${resp.status}`);
    }
    return resp.body;
  }

  /** Lien GET présigné SigV4 (1 h par défaut, comme l'ancien présigneur aws-sdk des routes média). */
  async getSignedGetUrl(
    key: string,
    expiresInSeconds = 3600,
    now: Date = new Date(),
  ): Promise<string> {
    const cleanKey = key.trim().replace(/^\/+/, "");
    if (
      !cleanKey ||
      cleanKey.includes("\0") ||
      cleanKey.split("/").some((s) => s === ".." || s === ".")
    ) {
      throw new Error("Clé d'objet R2 invalide");
    }
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > 604800) {
      throw new Error("Expiration R2 invalide : entier entre 1 et 604800 secondes requis");
    }
    return this.presignUrl("GET", cleanKey, expiresInSeconds, now);
  }

  async deleteObject(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { url, headers } = await this.signRequest("DELETE", key);
      const resp = await this.fetchFn(url, { method: "DELETE", headers });

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
    options?: R2PutOptions,
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
        options?.contentType,
      );

      const resp = await this.fetchFn(url, {
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
    now: Date = new Date(),
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
      throw new Error(
        "Content-Type R2 invalide : caractères de contrôle ou retours à la ligne interdits",
      );
    }
    const cleanContentType = contentType.trim();
    // Validation syntaxe MIME standard (RFC 2045/RFC 7231)
    if (
      !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:\s*;\s*[a-zA-Z0-9!#$&^_.+-]+=(?:"[a-zA-Z0-9!#$&^_.+-]+"|[a-zA-Z0-9!#$&^_.+-]+))*$/.test(
        cleanContentType,
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

    // 4 à 10. Signature SigV4 de l'URL (Content-Type signé)
    const presignedUrl = await this.presignUrl(
      "PUT",
      cleanKey,
      expiresInSeconds,
      now,
      cleanContentType,
    );
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    return {
      url: presignedUrl,
      requiredHeaders: {
        "Content-Type": cleanContentType,
      },
      expiresAt,
    };
  }

  /** URL présignée SigV4 (UNSIGNED-PAYLOAD) ; signe le Content-Type quand il est fourni. */
  private async presignUrl(
    method: "GET" | "PUT",
    cleanKey: string,
    expiresInSeconds: number,
    now: Date,
    contentType?: string,
  ): Promise<string> {
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

    // Paramètres triés par ordre lexicographique strict (ASCII) selon la RFC 3986 :
    // X-Amz-Algorithm < X-Amz-Credential < X-Amz-Date < X-Amz-Expires < X-Amz-SignedHeaders
    const signedHeaders = contentType ? "content-type;host" : "host";
    const canonicalQueryString =
      `X-Amz-Algorithm=AWS4-HMAC-SHA256&` +
      `X-Amz-Credential=${encodeRfc3986(this.accessKeyId)}%2F${dateStamp}%2F${region}%2F${service}%2Faws4_request&` +
      `X-Amz-Date=${amzDate}&` +
      `X-Amz-Expires=${expiresInSeconds}&` +
      `X-Amz-SignedHeaders=${encodeRfc3986(signedHeaders)}`;

    // En-têtes canoniques triés alphabétiquement : content-type < host
    const canonicalHeaders =
      (contentType ? `content-type:${contentType}\n` : "") + `host:${host}\n`;

    const canonicalRequest =
      `${method}\n` +
      `${path}\n` +
      `${canonicalQueryString}\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `UNSIGNED-PAYLOAD`;

    const canonicalReqHash = await sha256Hex(canonicalRequest);
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalReqHash}`;

    const kDate = await this.hmac("AWS4" + this.secretAccessKey, dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, "aws4_request");
    const signature = await this.hmacHex(kSigning, stringToSign);

    return `${url}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }

  private async signRequest(
    method: "HEAD" | "DELETE" | "PUT" | "GET",
    key: string,
    payload: Uint8Array = new Uint8Array(0),
    contentType?: string,
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
        `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
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
      rawKey.byteOffset + rawKey.byteLength,
    ) as ArrayBuffer;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      arrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
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
