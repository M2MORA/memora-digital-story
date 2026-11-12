import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  Nfc,
  Phone,
  Printer,
  Trash2,
} from "lucide-react";
import { STATUSES, type Order, type OrderStatus } from "../lib/supabase";
import { NEXT_STATUS, addressOf, fmt, fmtDate, mapsLink, statusLabel, whatsappLink } from "../lib/format";
import { nfcLinkFor, qrCodeFor, type AdminData } from "../lib/useAdminData";
import { printQr } from "../lib/print";
import StatusBadge from "./StatusBadge";

function PhotoPreview({ photoUrl, orderNumber }: { photoUrl: string; orderNumber: string }) {
  const [isLandscape, setIsLandscape] = useState(false);
  return (
    <figure className={`photo ${isLandscape ? "landscape" : "portrait"}`}>
      <img
        src={photoUrl}
        alt={`Photo à imprimer, commande ${orderNumber}`}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > img.naturalHeight) setIsLandscape(true);
        }}
      />
      <figcaption>{isLandscape ? "15 × 10 cm" : "10 × 15 cm"}</figcaption>
    </figure>
  );
}

export default function OrderDetail({
  order: o,
  data,
  onBack,
  onOpenConversation,
}: {
  order: Order;
  data: AdminData;
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const { memories, copiedSlug, downloadingUrl, slugFor, resolveMedia } = data;
  const next = NEXT_STATUS[o.status];
  const address = addressOf(o.shipping_address);
  const mediaMissingText = data.mediaUnavailable
    ? "Fichiers des clients non chargés. Actualise pour réessayer."
    : null;

  const remove = async () => {
    if (await data.deleteOrder(o.id, o.order_number)) onBack();
  };

  const tryPrintQr = (link: string) => {
    try {
      printQr(qrCodeFor(link));
    } catch (err) {
      data.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <article className="detail">
      <button type="button" className="back only-narrow" onClick={onBack}>
        <ChevronLeft size={18} aria-hidden /> Commandes
      </button>

      <header className="detail-head">
        <div>
          <h2>{o.customer_name}</h2>
          <p className="muted">
            {o.order_number} · {fmtDate(o.created_at)}
            {o.source === "whatsapp" && <> · <span className="tag">WhatsApp</span></>}
          </p>
        </div>
        <div className="detail-head-side">
          <strong className="amount">{fmt(o.total, o.currency)}</strong>
          <StatusBadge status={o.status} />
        </div>
      </header>

      <section className="panel">
        <h3 className="panel-title">Client</h3>
        {o.wa_conversation_id && (
          <button type="button" className="btn primary" onClick={() => onOpenConversation(o.wa_conversation_id!)}>
            <MessageCircle size={16} aria-hidden /> Conversation avec Ballech
          </button>
        )}
        {o.customer_phone && (
          <div className="actions-row">
            <a className="btn" href={`tel:${o.customer_phone}`}>
              <Phone size={16} aria-hidden /> Appeler
            </a>
            <a className="btn" href={whatsappLink(o.customer_phone)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} aria-hidden /> WhatsApp
            </a>
          </div>
        )}
        <dl className="facts">
          <div><dt>Téléphone</dt><dd>{o.customer_phone ?? "Non renseigné"}</dd></div>
          {address && (
            <div>
              <dt>Adresse</dt>
              <dd>
                <a className="link" href={mapsLink(address)} target="_blank" rel="noreferrer">
                  <MapPin size={14} aria-hidden /> {address}
                </a>
              </dd>
            </div>
          )}
          <div><dt>Paiement</dt><dd>Espèces à la livraison</dd></div>
        </dl>
      </section>

      {o.items.map((it, i) => {
        const slug = slugFor(o, i);
        const memory = memories.find((m) => m.slug === slug);
        const linkOff = memory && memory.status !== "active";
        const nfcLink = nfcLinkFor(slug);
        const videoUrl = resolveMedia(o, it, "video", i);
        const photoUrl = resolveMedia(o, it, "photo", i);
        const busy = photoUrl !== undefined && downloadingUrl === photoUrl;

        return (
          <section key={i} className="panel">
            <div className="panel-title-row">
              <h3 className="panel-title">
                Article {o.items.length > 1 ? `${i + 1}/${o.items.length}` : ""}
              </h3>
              <span className="tags">
                <span className="tag">{String(it["format"] ?? "10x15")}</span>
                {Boolean(it["withFrame"]) && <span className="tag">Cadre bois</span>}
                <span className="tag">Qté {String(it["qty"] ?? 1)}</span>
              </span>
            </div>
            {Boolean(it["cardMessage"]) && (
              <p className="quote">Verso : « {String(it["cardMessage"])} »</p>
            )}

            <div className="split">
              <div className="split-col">
                <h4 className="sub-title">Photo à imprimer</h4>
                {photoUrl ? (
                  <>
                    <PhotoPreview photoUrl={photoUrl} orderNumber={o.order_number} />
                    <button
                      type="button"
                      className="btn primary block"
                      disabled={busy}
                      onClick={() => data.downloadPhotoPdf(photoUrl, `memora-${o.order_number}-10x15.pdf`)}
                    >
                      <Download size={16} aria-hidden />
                      {busy ? "Préparation du PDF…" : "Télécharger le PDF 10×15"}
                    </button>
                    <a className="link center" href={photoUrl} target="_blank" rel="noreferrer">
                      <Maximize2 size={14} aria-hidden /> Voir en plein écran
                    </a>
                  </>
                ) : (
                  <p className={`placeholder ${mediaMissingText ? "is-error" : ""}`}>
                    <ImageOff size={20} aria-hidden />
                    {mediaMissingText ?? "Pas de photo reçue."}
                  </p>
                )}
              </div>

              <div className="split-col">
                <h4 className="sub-title">Puce NFC</h4>
                {memory ? (
                  <>
                    {linkOff ? (
                      <p className="note is-error">
                        Lien désactivé ({memory.status === "archived" ? "archivé" : "brouillon"}) : la vidéo ne
                        s'ouvre pas. Réactive-le dans Souvenirs.
                      </p>
                    ) : (
                      <p className="note is-ok">
                        <Check size={16} aria-hidden /> Lien prêt
                      </p>
                    )}
                    <div className="qr-box">
                      <img src={qrCodeFor(nfcLink)} alt="QR code du lien NFC" />
                      <code className="url">{nfcLink}</code>
                    </div>
                    <button
                      type="button"
                      className={`btn block ${copiedSlug === slug ? "success" : "primary"}`}
                      onClick={() => data.copyLink(slug)}
                    >
                      {copiedSlug === slug ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                      {copiedSlug === slug ? "Lien copié" : "Copier le lien NFC"}
                    </button>
                    <div className="actions-row">
                      <button type="button" className="btn" onClick={() => tryPrintQr(nfcLink)}>
                        <Printer size={16} aria-hidden /> Imprimer le QR
                      </button>
                      <a className="btn" href={nfcLink} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} aria-hidden /> Tester
                      </a>
                    </div>
                    <p className="hint">QR imprimé en 3 × 3 cm. Lien secret : ne le donne qu'au client.</p>
                  </>
                ) : (
                  <>
                    <p className="hint">Crée le lien, puis écris-le sur la puce avec l'app NFC Tools.</p>
                    <button
                      type="button"
                      className="btn primary block"
                      disabled={!videoUrl}
                      onClick={() => data.createMemory(o, i)}
                    >
                      <Nfc size={16} aria-hidden /> Créer le lien NFC
                    </button>
                    {!videoUrl && (
                      <p className="note is-error">{mediaMissingText ?? "Vidéo du client pas encore reçue."}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <section className="panel">
        <h3 className="panel-title">Statut</h3>
        {o.status === "paid" ? (
          <p className="note">
            <Lock size={16} aria-hidden /> Payée : commande terminée et verrouillée.
          </p>
        ) : (
          <label className="field">
            <span>Changer le statut</span>
            <select value={o.status} onChange={(e) => data.updateStatus(o.id, e.target.value as OrderStatus)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        {o.status === "cancelled" && (
          <button type="button" className="btn danger" onClick={remove}>
            <Trash2 size={16} aria-hidden /> Supprimer la commande
          </button>
        )}
      </section>

      {next && (
        <div className="action-bar">
          <button type="button" className="btn primary block" onClick={() => data.updateStatus(o.id, next)}>
            Passer à : {statusLabel(next)} <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </article>
  );
}
