import { useEffect, useState } from "react";
import { FileText, ImageOff } from "lucide-react";
import type { WaMedia } from "../lib/supabase";
import { whatsappMediaUrl } from "../lib/useWhatsApp";

/** Photo, vidéo, audio ou document reçu sur WhatsApp (lien signé demandé au serveur). */
export default function WaMediaView({ media, label }: { media: WaMedia; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    whatsappMediaUrl(media.storage_key)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [media.storage_key]);

  if (failed) {
    return (
      <span className="wa-media-missing">
        <ImageOff size={16} aria-hidden /> Fichier indisponible
      </span>
    );
  }
  if (!url) return <span className="wa-media-loading" aria-busy="true">Chargement…</span>;

  const mime = media.mime.toLowerCase();
  if (mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="wa-media">
        <img src={url} alt={label} loading="lazy" />
      </a>
    );
  }
  if (mime.startsWith("video/")) return <video className="wa-media" src={url} controls preload="metadata" />;
  if (mime.startsWith("audio/")) return <audio className="wa-audio" src={url} controls preload="none" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="link">
      <FileText size={16} aria-hidden /> Ouvrir le document
    </a>
  );
}
