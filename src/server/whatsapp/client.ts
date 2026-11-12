/** Client minimal de l'API WhatsApp Cloud (Graph API de Meta). */
import type { WhatsAppConfig } from "./env";

export type FetchLike = typeof fetch;

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<{ id: string | null }>;
  /** URL temporaire d'un média reçu (expire vite : à télécharger tout de suite). */
  getMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string; fileSize: number | null }>;
  downloadMedia(url: string): Promise<Uint8Array>;
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export function createWhatsAppClient(
  config: WhatsAppConfig,
  fetchImpl: FetchLike = fetch,
): WhatsAppClient {
  const base = `https://graph.facebook.com/${config.graphVersion}`;
  const auth = { Authorization: `Bearer ${config.accessToken}` };

  const fail = async (res: Response, what: string) => {
    const detail = await res.text().catch(() => "");
    return new WhatsAppApiError(`${what} : HTTP ${res.status} ${detail.slice(0, 300)}`, res.status);
  };

  return {
    async sendText(to, body) {
      const res = await fetchImpl(`${base}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: body.slice(0, 4096) },
        }),
      });
      if (!res.ok) throw await fail(res, "Envoi WhatsApp refusé");
      const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
      return { id: data.messages?.[0]?.id ?? null };
    },

    async getMediaUrl(mediaId) {
      const res = await fetchImpl(`${base}/${encodeURIComponent(mediaId)}`, { headers: auth });
      if (!res.ok) throw await fail(res, "Média WhatsApp introuvable");
      const data = (await res.json()) as { url?: string; mime_type?: string; file_size?: number };
      if (!data.url) throw new WhatsAppApiError("Réponse média sans URL", 502);
      return {
        url: data.url,
        mimeType: data.mime_type ?? "application/octet-stream",
        fileSize: data.file_size ?? null,
      };
    },

    async downloadMedia(url) {
      // Le téléchargement exige aussi le jeton d'accès.
      const res = await fetchImpl(url, { headers: auth });
      if (!res.ok) throw await fail(res, "Téléchargement du média refusé");
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
