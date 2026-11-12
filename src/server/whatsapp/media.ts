/**
 * Médias reçus sur WhatsApp : téléchargés tout de suite (les URLs Meta expirent),
 * puis rangés dans R2 sous whatsapp/{conversation}/{message}.{ext}.
 */
import { sha256Hex, type R2StorageAdapter } from "../../lib/r2-backend";
import type { WhatsAppClient } from "./client";
import type { MediaInfo, MessageType } from "./store";

/** 100 Mo : limite WhatsApp pour un document, largement au-dessus d'une vidéo souvenir. */
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

/** Préfixes MIME acceptés par type de message (un « document » n'est accepté qu'en PDF/image/vidéo). */
const ALLOWED_PREFIXES: Record<Exclude<MessageType, "text" | "other">, string[]> = {
  image: ["image/"],
  video: ["video/"],
  audio: ["audio/"],
  document: ["application/pdf", "image/", "video/"],
};

export function mediaKey(conversationId: string, messageId: string, mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  const ext = EXTENSIONS[base] ?? "bin";
  return `whatsapp/${conversationId}/${messageId}.${ext}`;
}

export function isAllowedMime(type: MessageType, mime: string): boolean {
  if (type === "text" || type === "other") return false;
  const base = mime.split(";")[0]!.trim().toLowerCase();
  return ALLOWED_PREFIXES[type].some((prefix) => base.startsWith(prefix));
}

export async function storeWhatsAppMedia(params: {
  client: WhatsAppClient;
  storage: R2StorageAdapter;
  mediaId: string;
  type: MessageType;
  conversationId: string;
  messageId: string;
  caption?: string | undefined;
}): Promise<MediaInfo> {
  const { url, mimeType, fileSize } = await params.client.getMediaUrl(params.mediaId);
  if (!isAllowedMime(params.type, mimeType))
    throw new Error(`Type de fichier refusé : ${mimeType}`);
  if (fileSize !== null && fileSize > MAX_MEDIA_BYTES)
    throw new Error(`Fichier trop lourd : ${fileSize} octets`);

  const bytes = await params.client.downloadMedia(url);
  if (bytes.byteLength > MAX_MEDIA_BYTES)
    throw new Error(`Fichier trop lourd : ${bytes.byteLength} octets`);

  const key = mediaKey(params.conversationId, params.messageId, mimeType);
  const put = await params.storage.putObject(key, bytes, {
    contentType: mimeType,
    customMetadata: { source: "whatsapp" },
  });
  if (!put.success) throw new Error(`Stockage R2 impossible : ${put.error ?? "erreur inconnue"}`);

  return {
    storage_key: key,
    mime: mimeType,
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    ...(params.caption ? { caption: params.caption } : {}),
  };
}
