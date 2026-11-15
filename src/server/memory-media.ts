/**
 * Memory media : slug → clé de stockage → lien signé (redirection) ou flux par plages.
 * Le stockage et la base sont injectés ; la logique des plages reste dans le streaming handler.
 */

import type { R2StorageAdapter } from "../lib/r2-backend";
import { resolveStreamingResponse } from "../lib/streaming-handler";

export type MediaStorage = Pick<R2StorageAdapter, "headObject"> &
  Required<Pick<R2StorageAdapter, "getSignedGetUrl" | "getObjectRange">>;

export interface MemoryMediaDependencies {
  /** Client Supabase service role (lu uniquement : table memories). */
  db: () => any;
  /** Lève si la configuration du stockage manque. */
  storage: () => MediaStorage;
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Médias du site (staging/{draft}/{uuid}) et médias reçus sur WhatsApp (whatsapp/{conversation}/{message}).
const PRIVATE_MEDIA_KEY_PREFIX = `^(?:staging\\/[a-zA-Z0-9_-]{3,64}|whatsapp\\/${UUID_PATTERN})\\/${UUID_PATTERN}`;
const PRIVATE_MEDIA_KEY = {
  video: new RegExp(`${PRIVATE_MEDIA_KEY_PREFIX}\\.(?:mp4|webm|mov)$`, "i"),
  photo: new RegExp(`${PRIVATE_MEDIA_KEY_PREFIX}\\.(?:jpe?g|png|webp)$`, "i"),
};

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const textResponse = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
const memoryUnavailable = () => textResponse(404, "Souvenir introuvable ou indisponible");
const serviceUnavailable = () => textResponse(503, "Service vidéo indisponible");

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

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
function privateMediaKey(
  stored: string,
  requestOrigin: string,
  kind: "video" | "photo",
): string | null {
  // L'admin a pu enregistrer « memora.tn/api/media?... » sans https://
  const withScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) || stored.startsWith("/")
      ? stored
      : `https://${stored}`;

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

const isMalformedSlug = (slug: string) => !slug || slug.length > 160 || /[\0\r\n]/.test(slug);

/** Média d'un souvenir actif. `video_url`/`photo_url` sont des pointeurs internes : un appelant ne fournit jamais de clé R2. */
async function activeMemoryKey(
  db: any,
  slug: string,
  kind: "video" | "photo",
  requestOrigin: string,
): Promise<string | null> {
  const { data: memory, error } = await db
    .from("memories")
    .select("video_url, photo_url")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  const stored = kind === "photo" ? memory?.photo_url : memory?.video_url;
  if (error || !stored) return null;
  return privateMediaKey(stored, requestOrigin, kind);
}

/** GET /api/media?key=… : seuls les médias clients (clé non devinable) peuvent être signés. */
export async function mediaKeyRedirect(
  request: Request,
  storage: () => MediaStorage,
): Promise<Response> {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.trim()) return jsonError(400, "Paramètre key requis");

  const cleanKey = key.trim().replace(/^\/+/, "");
  if (!PRIVATE_MEDIA_KEY.video.test(cleanKey) && !PRIVATE_MEDIA_KEY.photo.test(cleanKey)) {
    return jsonError(403, "Clé non autorisée");
  }

  let adapter: MediaStorage;
  try {
    adapter = storage();
  } catch {
    return jsonError(500, "Configuration stockage indisponible");
  }

  try {
    return signedMediaRedirect(await adapter.getSignedGetUrl(cleanKey));
  } catch (error) {
    console.error("[media] Erreur génération URL présignée:", error);
    return jsonError(404, "Fichier média introuvable");
  }
}

/**
 * GET /api/memory-media?slug=…&kind=video|photo : résout un souvenir actif puis redirige
 * vers un lien R2 signé. La clé de stockage n'apparaît jamais dans la page.
 */
export async function memoryMediaRedirect(
  request: Request,
  deps: MemoryMediaDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const kind = url.searchParams.get("kind") === "photo" ? "photo" : "video";
  if (isMalformedSlug(slug)) return memoryUnavailable();

  try {
    const key = await activeMemoryKey(deps.db(), slug, kind, url.origin);
    if (!key) return memoryUnavailable();
    return signedMediaRedirect(await deps.storage().getSignedGetUrl(key));
  } catch (error) {
    console.error("[memory-media] Lien signé impossible:", error);
    return serviceUnavailable();
  }
}

/**
 * GET|HEAD /api/nfc-video?slug=… : diffuse la vidéo privée d'un souvenir actif à l'URL
 * permanente MÉMORA (plages 206 pour la lecture et l'avance rapide). Aucune URL R2 exposée.
 */
export async function memoryVideoStream(
  request: Request,
  slug: string,
  deps: MemoryMediaDependencies,
): Promise<Response> {
  if (isMalformedSlug(slug)) return memoryUnavailable();

  try {
    const key = await activeMemoryKey(deps.db(), slug, "video", new URL(request.url).origin);
    const extension = key?.split(".").pop()?.toLowerCase() ?? "";
    const contentType = VIDEO_CONTENT_TYPES[extension];
    if (!key || !contentType) return memoryUnavailable();

    let storage: MediaStorage;
    try {
      storage = deps.storage();
    } catch {
      return serviceUnavailable();
    }

    const head = await storage.headObject(key);
    // Objet absent du bucket : 503 comme avant (l'ancien HeadObject aws-sdk levait une erreur).
    if (!head.exists) return serviceUnavailable();
    const totalSize = head.contentLength;
    if (!Number.isSafeInteger(totalSize) || totalSize <= 0) return memoryUnavailable();

    const lastModified = head.lastModified?.toUTCString();
    const etag = head.etag || `"memora-${totalSize}-${head.lastModified?.getTime() ?? 0}"`;
    const decision = resolveStreamingResponse({
      method: request.method as "GET" | "HEAD",
      rangeHeader: request.headers.get("range"),
      ifRangeHeader: request.headers.get("if-range"),
      ifNoneMatchHeader: request.headers.get("if-none-match"),
      ifModifiedSinceHeader: request.headers.get("if-modified-since"),
      totalSize,
      contentType,
      etag,
      ...(lastModified ? { lastModified } : {}),
    });

    const filename = `${slug.replace(/[^a-zA-Z0-9._-]/g, "_")}.${extension}`;
    const headers = new Headers(decision.headers);
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    if (decision.isHead || decision.status === 304 || decision.status === 416) {
      return new Response(null, { status: decision.status, headers });
    }

    const body = await storage.getObjectRange(key, decision.range ?? undefined);
    if (!body) return serviceUnavailable();

    return new Response(body, { status: decision.status, headers });
  } catch (error) {
    console.error("[nfc-memory] Unable to stream video:", error);
    return serviceUnavailable();
  }
}
