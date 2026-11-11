import { useState } from "react";
import { STATUSES, type Order, type OrderStatus } from "../lib/supabase";
import {
  NEXT_STATUS,
  addressOf,
  fmt,
  fmtDate,
  getFilename,
  mapsLink,
  statusLabel,
  whatsappLink,
} from "../lib/format";
import { nfcLinkFor, qrCodeFor, type AdminData } from "../lib/useAdminData";

function PhotoPreview({ photoUrl, orderNumber }: { photoUrl: string; orderNumber: string }) {
  const [isLandscape, setIsLandscape] = useState(false);
  return (
    <div className={`photo-frame ${isLandscape ? "landscape" : "portrait"}`}>
      <img
        src={photoUrl}
        alt={`Photo tirage #${orderNumber}`}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > img.naturalHeight) setIsLandscape(true);
        }}
      />
      <span className="photo-ratio-badge">{isLandscape ? "15 × 10 cm" : "10 × 15 cm"}</span>
    </div>
  );
}

export default function OrderDetail({
  order: o,
  data,
  onBack,
}: {
  order: Order;
  data: AdminData;
  onBack: () => void;
}) {
  const { memories, copiedSlug, downloadingUrl, slugFor, resolveMedia } = data;
  const next = NEXT_STATUS[o.status];
  const address = addressOf(o.shipping_address);

  const remove = async () => {
    if (await data.deleteOrder(o.id, o.order_number)) onBack();
  };

  return (
    <article className="detail">
      <header className="detail-head">
        <button type="button" className="back" onClick={onBack}>
          ‹ Retour
        </button>
        <span className={`pill ${o.status}`}>
          {o.status === "paid" && "🔒 "}
          {statusLabel(o.status)}
        </span>
      </header>

      <div className="detail-title">
        <div>
          <p className="muted">#{o.order_number} · {fmtDate(o.created_at)}</p>
          <h2>{o.customer_name}</h2>
        </div>
        <strong className="detail-total">{fmt(o.total, o.currency)}</strong>
      </div>

      {/* Client */}
      <section className="block client">
        {o.customer_phone && (
          <div className="contact-row">
            <a className="btn" href={`tel:${o.customer_phone}`}>📞 Appeler</a>
            <a className="btn" href={whatsappLink(o.customer_phone)} target="_blank" rel="noreferrer">
              💬 WhatsApp
            </a>
          </div>
        )}
        {address && (
          <a className="address" href={mapsLink(address)} target="_blank" rel="noreferrer">
            📍 {address}
          </a>
        )}
        <p className="muted">
          {o.customer_phone ?? "—"} · {o.customer_email} · Espèces à la livraison
        </p>
      </section>

      {/* Articles */}
      {o.items.map((it, i) => {
        const slug = slugFor(o, i);
        const memory = memories.find((m) => m.slug === slug);
        const nfcLink = nfcLinkFor(slug);
        const videoUrl = resolveMedia(o, it, "video", i);
        const photoUrl = resolveMedia(o, it, "photo", i);
        const photoName = photoUrl ? getFilename(photoUrl, `memora-photo-${o.order_number}`, "jpg") : "";

        return (
          <section key={i} className="block item">
            <div className="item-head">
              <span className="tag dark">{String(it["format"] ?? "10x15")}</span>
              {Boolean(it["withFrame"]) && <span className="tag">+ Cadre bois</span>}
              <span className="tag light">Qté {String(it["qty"] ?? 1)}</span>
              {o.items.length > 1 && <span className="muted item-num">Article {i + 1}/{o.items.length}</span>}
            </div>
            {Boolean(it["cardMessage"]) && (
              <p className="back-message">Verso : « {String(it["cardMessage"])} »</p>
            )}

            {/* 1. Photo */}
            <div className="step">
              <h3><span className="step-num">1</span> Photo à imprimer</h3>
              {photoUrl ? (
                <>
                  <PhotoPreview photoUrl={photoUrl} orderNumber={o.order_number} />
                  <button
                    type="button"
                    className="btn primary big"
                    disabled={downloadingUrl === photoUrl}
                    onClick={() => data.downloadPhoto10x15(photoUrl, photoName)}
                  >
                    {downloadingUrl === photoUrl ? "⏳ Préparation…" : "⬇ Télécharger photo 10×15"}
                  </button>
                  <div className="sub-links">
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        data.downloadMedia(photoUrl, getFilename(photoUrl, `memora-photo-${o.order_number}-original`, "jpg"))
                      }
                    >
                      Fichier original
                    </button>
                    <a className="link" href={photoUrl} target="_blank" rel="noreferrer">Plein écran</a>
                  </div>
                </>
              ) : (
                <p className="no-media">Pas de photo reçue (photo par défaut).</p>
              )}
            </div>

            {/* 2. NFC (la vidéo du client est jouée par le lien NFC) */}
            <div className="step">
              <h3><span className="step-num">2</span> Puce NFC</h3>
              {memory ? (
                <>
                  <p className="ok-badge">✅ Lien prêt</p>
                  <code className="nfc-url">{nfcLink}</code>
                  <button
                    type="button"
                    className={`btn big ${copiedSlug === slug ? "copied" : "primary"}`}
                    onClick={() => data.copyLink(slug)}
                  >
                    {copiedSlug === slug ? "✓ Lien copié" : "📋 Copier le lien NFC"}
                  </button>
                  <a className="btn big" href={nfcLink} target="_blank" rel="noreferrer">▶ Tester le lien</a>
                  <div className="qr">
                    <img src={qrCodeFor(nfcLink)} alt="QR code du lien NFC" />
                    <p className="muted">
                      Scanne ce QR avec l'app <strong>NFC Tools</strong> pour écrire la puce sans rien taper.
                      Lien secret : ne le donne qu'au client.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary big"
                    disabled={!videoUrl}
                    onClick={() => data.createMemory(o, i)}
                  >
                    ✨ Créer le lien NFC
                  </button>
                  {!videoUrl && <p className="error-note">Vidéo du client pas encore reçue.</p>}
                </>
              )}
            </div>
          </section>
        );
      })}

      {/* Statut */}
      <section className="block status-block">
        <h3>Statut de la commande</h3>
        {o.status === "paid" ? (
          <p className="muted">🔒 Payée : commande terminée et verrouillée.</p>
        ) : (
          <label className="field">
            <span>Changer le statut</span>
            <select
              className={`pill ${o.status}`}
              value={o.status}
              onChange={(e) => data.updateStatus(o.id, e.target.value as OrderStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        {o.status === "cancelled" && (
          <button type="button" className="btn danger big" onClick={remove}>
            🗑 Supprimer la commande
          </button>
        )}
      </section>

      {next && (
        <div className="action-bar">
          <button
            type="button"
            className="btn primary big"
            onClick={() => data.updateStatus(o.id, next)}
          >
            Passer à : {statusLabel(next)} →
          </button>
        </div>
      )}
    </article>
  );
}
