import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, STATUSES, type Order, type OrderStatus, type Memory } from "../lib/supabase";

type Tab = "workshop" | "orders" | "memories";

type UploadIntent = {
  id: string;
  order_id: string | null;
  draft_id: string;
  item_id: string;
  file_kind: "photo" | "video";
  storage_key: string;
  file_name: string;
  status?: string;
};

const fmt = (n: number, cur = "TND") =>
  `${Number(n).toFixed(2)} ${cur === "TND" ? "DT" : cur}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

const defaultEnvUrl = String(import.meta.env["VITE_SITE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");

// Adresse écrite sur les puces NFC : toujours le site public, jamais l'adresse
// du serveur local utilisée par l'admin pour ses appels API.
const publicSiteUrl = String(import.meta.env["VITE_PUBLIC_SITE_URL"] ?? "https://www.memora.tn").replace(/\/+$/, "");

function PhotoCard10x15({
  photoUrl,
  orderNumber,
  downloading,
  onDownload10x15,
  onDownloadOriginal,
}: {
  photoUrl: string;
  orderNumber: string;
  downloading: boolean;
  onDownload10x15: () => void;
  onDownloadOriginal: () => void;
}) {
  const [isLandscape, setIsLandscape] = useState(false);

  return (
    <>
      <div className={`photo-frame-10x15 ${isLandscape ? "landscape" : "portrait"}`}>
        <img
          src={photoUrl}
          alt={`Photo tirage #${orderNumber}`}
          className="craft-preview-img"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > img.naturalHeight) {
              setIsLandscape(true);
            }
          }}
        />
        <span className="photo-ratio-badge">
          {isLandscape ? "15 × 10 cm (3:2)" : "10 × 15 cm (2:3)"}
        </span>
      </div>

      <div className="media-btn-group">
        <button
          type="button"
          onClick={onDownload10x15}
          className="btn btn-block btn-download"
          disabled={downloading}
          title="Télécharger la photo calibrée au format standard 10×15 cm à 300 DPI pour tirage d'art"
        >
          {downloading ? "⏳ Préparation 10×15..." : "⬇ Télécharger Photo 10×15 HD"}
        </button>
        <div className="sub-links-row">
          <button
            type="button"
            onClick={onDownloadOriginal}
            className="link-sub"
            title="Télécharger l'image originale sans recadrage"
          >
            💾 Fichier brut
          </button>
          <span className="dot-sep">·</span>
          <a
            href={photoUrl}
            target="_blank"
            rel="noreferrer"
            className="link-sub"
            title="Ouvrir dans un nouvel onglet"
          >
            🔍 Plein écran
          </a>
        </div>
      </div>
    </>
  );
}

export default function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("workshop");
  const [orders, setOrders] = useState<Order[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploadIntents, setUploadIntents] = useState<UploadIntent[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  // URL de base configurable pour flasher les puces NFC
  const [siteUrl, setSiteUrl] = useState(() => {
    return localStorage.getItem("memora_admin_site_url") || defaultEnvUrl;
  });

  // « memora.tn » saisi sans https:// serait lu comme un chemin relatif à l'admin
  const apiBase = !siteUrl
    ? defaultEnvUrl
    : /^https?:\/\//i.test(siteUrl)
      ? siteUrl
      : `https://${siteUrl}`;

  const handleSiteUrlChange = (newUrl: string) => {
    const clean = newUrl.trim().replace(/\/+$/, "");
    setSiteUrl(clean);
    localStorage.setItem("memora_admin_site_url", clean);
  };

  const intentFor = (o: Order, it: Record<string, unknown>, kind: "photo" | "video") => {
    const itemId = (it["id"] || it["key"]) as string | undefined;
    return uploadIntents
      .filter(
        (ui) =>
          (ui.order_id === o.id || (o.draft_id && ui.draft_id === o.draft_id)) &&
          (!itemId || ui.item_id === itemId) &&
          ui.file_kind === kind
      )
      .sort((a, b) => {
        const scoreA = (a.order_id === o.id ? 10 : 0) + (a.status === "consumed" ? 5 : 0);
        const scoreB = (b.order_id === o.id ? 10 : 0) + (b.status === "consumed" ? 5 : 0);
        return scoreB - scoreA;
      })[0];
  };

  // Le lien NFC ne doit pas pouvoir être deviné : il reprend l'identifiant aléatoire de la
  // vidéo. Un souvenir déjà créé avec l'ancien format garde son lien.
  const slugFor = (o: Order, itemIndex: number) => {
    const legacySlug =
      o.items.length > 1 ? `${o.order_number.toLowerCase()}-${itemIndex + 1}` : o.order_number.toLowerCase();
    if (memories.some((m) => m.slug === legacySlug)) return legacySlug;

    const item = o.items[itemIndex] as Record<string, unknown> | undefined;
    const videoIntent = item ? intentFor(o, item, "video") : undefined;
    return videoIntent ? videoIntent.id.replace(/-/g, "") : legacySlug;
  };

  // Keep the NFC URL stable; the public server route resolves it to a fresh,
  // short-lived signed R2 video URL whenever it is opened or scanned.
  const nfcLinkFor = (slug: string) => `${publicSiteUrl}/m/${encodeURIComponent(slug)}`;

  const copyLink = async (slug: string) => {
    const fullUrl = nfcLinkFor(slug);
    await navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 3000);
  };

  const resolveMedia = (o: Order, it: Record<string, unknown>, kind: "photo" | "video", itemIndex?: number) => {
    const idx = itemIndex !== undefined ? itemIndex : o.items.indexOf(it);
    const slug = slugFor(o, idx >= 0 ? idx : 0);
    const existingMemory = memories.find((m) => m.slug === slug);
    if (kind === "photo" && existingMemory?.photo_url) return existingMemory.photo_url;
    if (kind === "video" && existingMemory?.video_url) return existingMemory.video_url;

    const direct = (kind === "photo"
      ? it["photoUrl"] || it["photo_url"] || it["photoPreviewUrl"] || it["photo"] || it["previewUrl"]
      : it["videoUrl"] || it["video_url"] || it["videoPreviewUrl"]) as string | undefined;
    if (direct) return direct;

    const intent = intentFor(o, it, kind);
    if (intent?.storage_key) {
      return `${apiBase}/api/media?key=${encodeURIComponent(intent.storage_key)}`;
    }
    return undefined;
  };

  const getFilename = (url: string, prefix: string, defaultExt: string) => {
    try {
      const cleanUrl = url.split("?")[0].split("#")[0];
      const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
      if (match && match[1]) {
        const ext = match[1].toLowerCase();
        if (["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"].includes(ext)) {
          return `${prefix}.${ext}`;
        }
      }
    } catch {
      // ignore
    }
    return `${prefix}.${defaultExt}`;
  };

  const downloadMedia = async (url: string, filename: string) => {
    if (!url) return;
    setDownloadingUrl(url);

    try {
      if (url.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Téléchargement par blob pour forcer le téléchargement local sans blocage Cross-Origin
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.warn("Échec du téléchargement direct blob, repli Supabase/navigateur:", err);
      // Pour Supabase Storage, ?download force l'en-tête Content-Disposition: attachment
      const downloadUrl = url.includes("supabase.co/storage/v1/object/public")
        ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`
        : url;

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const downloadPhoto10x15 = async (url: string, filename: string) => {
    if (!url) return;
    setDownloadingUrl(url);

    try {
      // Préparation du tirage photo au ratio standard 10x15 cm à 300 DPI
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = url;
      });

      const isLandscape = img.naturalWidth > img.naturalHeight;
      // Standard tirage laboratoire 10x15 cm à 300 DPI = 1200 x 1800 px (ou 1800 x 1200 px)
      const targetW = isLandscape ? 1800 : 1200;
      const targetH = isLandscape ? 1200 : 1800;

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Cadrage photo proportionnel centré sans déformation
        const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
        const scaledW = img.naturalWidth * scale;
        const scaledH = img.naturalHeight * scale;
        const offsetX = (targetW - scaledW) / 2;
        const offsetY = (targetH - scaledH) / 2;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.96)
        );

        if (blob) {
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          const cleanName = filename.replace(/\.[a-zA-Z0-9]+$/, "");
          a.download = `${cleanName}-10x15.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
          return;
        }
      }
      // Repli si échec canvas
      await downloadMedia(url, filename);
    } catch (err) {
      console.warn("Échec du calibrage canvas 10x15, téléchargement direct:", err);
      await downloadMedia(url, filename);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const load = useCallback(async () => {
    setError("");
    const [o, m, u] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("memories").select("*").order("created_at", { ascending: false }),
      supabase.from("upload_intents").select("*"),
    ]);
    if (o.error) setError(o.error.message);
    else setOrders(o.data as Order[]);
    if (m.error) setError(m.error.message);
    else setMemories(m.data as Memory[]);
    if (!u.error && u.data) setUploadIntents(u.data as UploadIntent[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const currentOrder = orders.find((o) => o.id === id);
    if (currentOrder?.status === "paid") {
      alert("Cette commande a été marquée comme 'Payée'. Elle est définitivement verrouillée et ne peut plus être modifiée ou supprimée.");
      return;
    }

    if (status === "paid") {
      const confirmPaid = window.confirm(
        `Êtes-vous sûr de marquer la commande #${currentOrder?.order_number || ""} comme 'Payée' ?\n\nATTENTION : Une fois marquée comme Payée, cette commande sera définitivement verrouillée : son statut ne pourra plus jamais être changé et elle ne pourra JAMAIS être supprimée.`
      );
      if (!confirmPaid) return;
    }

    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const deleteOrder = async (id: string, orderNumber: string) => {
    const target = orders.find((o) => o.id === id);
    if (target?.status === "paid") {
      alert("Action impossible : une commande payée ne peut JAMAIS être supprimée.");
      return;
    }
    if (target?.status !== "cancelled") {
      alert("Seules les commandes ayant le statut 'Annulée' peuvent être supprimées de la base de données.");
      return;
    }

    if (!window.confirm(`Voulez-vous vraiment supprimer définitivement la commande annulée #${orderNumber} de la base de données ?`)) {
      return;
    }
    setError("");
    try {
      // 1. Tenter via le point de terminaison sécurisé du serveur
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée, veuillez vous reconnecter.");

      const res = await fetch(`${apiBase}/api/admin/orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.error) {
        throw new Error(data.error);
      }
      // 2. Repli direct Supabase si l'API serveur n'est pas joignable
      const { error: delError } = await supabase.from("orders").delete().eq("id", id);
      if (delError) throw delError;
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err: any) {
      setError(`Échec de la suppression de la commande #${orderNumber}: ${err.message || err}`);
    }
  };

  const setMemoryStatus = async (id: string, status: Memory["status"]) => {
    const { error } = await supabase.from("memories").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setMemories((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  const createMemory = async (o: Order, itemIndex: number) => {
    const it = o.items[itemIndex];
    if (!it) return;
    const slug = slugFor(o, itemIndex);
    const videoUrl = resolveMedia(o, it, "video", itemIndex);
    const photoUrl = resolveMedia(o, it, "photo", itemIndex);

    if (!videoUrl) {
      alert("Attention : la vidéo de ce tirage n'a pas été reçue.");
      return;
    }

    const userRes = await supabase.auth.getUser();
    const currentUserId = userRes.data.user?.id ?? null;

    const { data, error } = await supabase
      .from("memories")
      .insert([
        {
          slug,
          title: `Souvenir de ${o.customer_name}`,
          description: (it["cardMessage"] as string | undefined) ?? null,
          video_url: videoUrl,
          photo_url: photoUrl ?? null,
          status: "active",
          order_id: o.id,
          user_id: currentUserId,
        },
      ])
      .select()
      .single();

    if (error) return setError(error.message);
    setMemories((prev) => [data as Memory, ...prev]);
    await copyLink(slug);
  };

  const stats = useMemo(() => {
    const valid = orders.filter((o) => o.status !== "cancelled");
    const revenue = valid.reduce((s, o) => s + Number(o.total), 0);
    return {
      count: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      revenue,
      views: memories.reduce((s, m) => s + (m.view_count ?? 0), 0),
    };
  }, [orders, memories]);

  const shown = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      `${o.order_number} ${o.customer_name} ${o.customer_email}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="shell">
      {/* Topbar */}
      <header className="topbar">
        <div>
          <h1 className="brand">MÉMORA <span>Admin & Fabrication</span></h1>
          <p className="topbar-sub">Atelier de préparation des tirages et programmation NFC</p>
        </div>

        <div className="topbar-right">
          <div className="domain-config">
            <label title={`Serveur utilisé pour les médias et la suppression des commandes. Les liens NFC utilisent toujours ${publicSiteUrl}.`}>
              Serveur API :
              <input
                type="text"
                value={siteUrl}
                onChange={(e) => handleSiteUrlChange(e.target.value)}
                placeholder="https://memora.tn"
                className="domain-input"
              />
            </label>
          </div>
          <button className="btn" onClick={load}>🔄 Actualiser</button>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </header>

      <main className="content">
        {error && <p className="error banner">{error}</p>}

        {/* Global Stats */}
        <section className="stats">
          <div className="card stat"><p>Commandes</p><strong>{stats.count}</strong></div>
          <div className="card stat"><p>À fabriquer / En attente</p><strong className="highlight">{stats.pending}</strong></div>
          <div className="card stat"><p>Chiffre d'affaires</p><strong>{fmt(stats.revenue)}</strong></div>
          <div className="card stat"><p>Scans NFC totaux</p><strong>{stats.views}</strong></div>
        </section>

        {/* Navigation Tabs */}
        <nav className="tabs">
          <button className={tab === "workshop" ? "active" : ""} onClick={() => setTab("workshop")}>
            ⚡ Atelier Fabrication NFC ({orders.length})
          </button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
            📋 Liste Commandes ({orders.length})
          </button>
          <button className={tab === "memories" ? "active" : ""} onClick={() => setTab("memories")}>
            ✨ Puces & Souvenirs actifs ({memories.length})
          </button>
        </nav>

        {/* ============================================================== */}
        {/* TAB 1 : ATELIER FABRICATION NFC & IMPRESSION                   */}
        {/* ============================================================== */}
        {tab === "workshop" && (
          <section className="workshop-view">
            <div className="workshop-header">
              <h2>Fiches de Fabrication & Programmation des Cartes NFC</h2>
              <p className="muted">
                Ici, la vidéo, la photo et le lien NFC de chaque commande sont immédiatement prêts. Téléchargez la photo pour l'imprimer, vérifiez la vidéo et flashez votre puce NFC en 1 clic !
              </p>
            </div>

            {shown.length === 0 ? (
              <div className="card empty-card">
                <p>Aucune commande à afficher.</p>
              </div>
            ) : (
              <div className="cards-grid">
                {shown.map((o) => (
                  <div key={o.id} className="card workshop-card">
                    {/* Header Commande */}
                    <div className="order-head">
                      <div>
                        <span className="order-badge">#{o.order_number}</span>
                        <h3 className="customer-title">{o.customer_name}</h3>
                        <p className="muted-small">
                          {fmtDate(o.created_at)} · {o.customer_phone ? `📞 ${o.customer_phone}` : o.customer_email}
                        </p>
                      </div>

                      <div className="order-actions">
                        <span className="order-total">{fmt(o.total, o.currency)}</span>
                        {o.status === "paid" ? (
                          <span
                            className="pill paid locked-badge"
                            title="Commande payée : statut verrouillé définitivement (non modifiable, non supprimable)"
                          >
                            🔒 Payée
                          </span>
                        ) : (
                          <select
                            className={`pill ${o.status}`}
                            value={o.status}
                            onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                          >
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        )}
                        {o.status === "cancelled" && (
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={() => deleteOrder(o.id, o.order_number)}
                            title="Supprimer définitivement cette commande annulée de la base de données"
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Adresse livraison */}
                    <div className="delivery-strip">
                      📍 <strong>Livraison :</strong> {o.shipping_address?.["address"]}, {o.shipping_address?.["postalCode"]} {o.shipping_address?.["city"]}
                    </div>

                    {/* Liste des articles / cartes à fabriquer */}
                    <div className="items-craft-list">
                      {o.items.map((it, i) => {
                        const slug = slugFor(o, i);
                        const existingMemory = memories.find((m) => m.slug === slug);
                        const nfcLink = nfcLinkFor(slug);
                        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(nfcLink)}`;
                        const videoUrl = resolveMedia(o, it, "video", i);
                        const photoUrl = resolveMedia(o, it, "photo", i);

                        return (
                          <div key={i} className="craft-item-card">
                            {/* Titre Item */}
                            <div className="craft-item-header">
                              <div>
                                <span className="format-tag">{String(it["format"] ?? "10x15")}</span>
                                {Boolean(it["withFrame"]) && <span className="frame-tag">+ Cadre bois</span>}
                                <span className="qty-tag">Qté : {String(it["qty"] ?? 1)}</span>
                              </div>
                              {Boolean(it["cardMessage"]) && (
                                <p className="back-message">
                                  <strong>Message au verso :</strong> « {String(it["cardMessage"])} »
                                </p>
                              )}
                            </div>

                            {/* 3 Colonnes : Photo | Vidéo | Flash NFC */}
                            <div className="craft-grid">
                              {/* Colonne 1 : Photo d'art */}
                              <div className="craft-col">
                                <p className="col-label">🖼️ Photo à imprimer (10×15 cm)</p>
                                <div className="photo-box">
                                  {photoUrl ? (
                                    <PhotoCard10x15
                                      photoUrl={photoUrl}
                                      orderNumber={o.order_number}
                                      downloading={downloadingUrl === photoUrl}
                                      onDownload10x15={() => downloadPhoto10x15(photoUrl, getFilename(photoUrl, `memora-photo-${o.order_number}`, "jpg"))}
                                      onDownloadOriginal={() => downloadMedia(photoUrl, getFilename(photoUrl, `memora-photo-${o.order_number}-original`, "jpg"))}
                                    />
                                  ) : (
                                    <div className="no-media-box">
                                      <p className="muted">Photo par défaut / Non chargée</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Colonne 2 : Vidéo */}
                              <div className="craft-col">
                                <p className="col-label">🎬 Vidéo du souvenir</p>
                                <div className="video-box">
                                  {videoUrl ? (
                                    <>
                                      <video
                                        src={videoUrl}
                                        controls
                                        preload="metadata"
                                        className="craft-video-player"
                                      />
                                      <div className="media-btn-group">
                                        <button
                                          type="button"
                                          onClick={() => downloadMedia(videoUrl, getFilename(videoUrl, `memora-video-${o.order_number}`, "mp4"))}
                                          className="btn btn-block"
                                          disabled={downloadingUrl === videoUrl}
                                          title="Télécharger la vidéo souvenir"
                                        >
                                          {downloadingUrl === videoUrl ? "⏳ Téléchargement..." : "⬇ Télécharger Vidéo"}
                                        </button>
                                        <a
                                          href={videoUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="link-sub"
                                          title="Ouvrir dans un nouvel onglet"
                                        >
                                          🔍 Plein écran
                                        </a>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="no-media-box">
                                      <p className="muted">Vidéo non reçue</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Colonne 3 : Programmation NFC & Flash */}
                              <div className="craft-col nfc-col">
                                <p className="col-label">📱 Programmation de la puce NFC</p>

                                <div className="nfc-program-box">
                                  {existingMemory ? (
                                    <>
                                      <div className="nfc-ready-badge">
                                        ✅ Puce NFC active & prête
                                      </div>

                                      <div className="nfc-link-wrapper">
                                        <code className="nfc-url-display">{nfcLink}</code>
                                      </div>

                                      <div className="nfc-buttons">
                                        <button
                                          className={`btn btn-copy ${copiedSlug === slug ? "copied" : "primary"}`}
                                          onClick={() => copyLink(slug)}
                                        >
                                          {copiedSlug === slug ? "✓ Lien copié !" : "📋 Copier pour NFC"}
                                        </button>

                                        <a
                                          href={nfcLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="btn btn-test"
                                        >
                                          ▶ Tester l’ouverture vidéo
                                        </a>
                                      </div>

                                      <p className="muted">
                                        Ce lien permanent ouvre la vidéo du souvenir en plein écran, sans autre contenu. Il ne peut pas être deviné : ne le partagez qu’avec le client.
                                      </p>

                                      {/* QR Code pour programmation rapide par téléphone */}
                                      <div className="qr-container">
                                        <img src={qrCodeUrl} alt="QR Code NFC" className="qr-img" />
                                        <p className="qr-help">
                                          💡 Flashez avec votre smartphone (ex: <strong>NFC Tools</strong>) pour programmer la puce sans rien taper.
                                        </p>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="nfc-activate-box">
                                      <p className="muted">Le lien NFC n'a pas encore été généré pour ce tirage.</p>
                                      <button
                                        className="btn primary btn-activate"
                                        disabled={!videoUrl}
                                        onClick={() => createMemory(o, i)}
                                      >
                                        ✨ Activer & Créer le lien NFC
                                      </button>
                                      {!videoUrl && (
                                        <span className="error-note">Vidéo requise pour activer</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB 2 : LISTE DES COMMANDES                                    */}
        {/* ============================================================== */}
        {tab === "orders" && (
          <section className="card">
            <div className="toolbar">
              <input
                id="order-search"
                placeholder="Rechercher par numéro, nom ou email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select id="order-filter" value={filter} onChange={(e) => setFilter(e.target.value as OrderStatus | "all")}>
                <option value="all">Tous les statuts</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>N°</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th>Détails</th></tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr><td colSpan={6} className="empty">Aucune commande.</td></tr>
                  )}
                  {shown.map((o) => (
                    <>
                      <tr key={o.id}>
                        <td><strong>#{o.order_number}</strong></td>
                        <td>{fmtDate(o.created_at)}</td>
                        <td>{o.customer_name}<br /><span className="muted">{o.customer_email}</span></td>
                        <td>{fmt(o.total, o.currency)}</td>
                        <td>
                          {o.status === "paid" ? (
                            <span
                              className="pill paid locked-badge"
                              title="Commande payée : statut verrouillé définitivement (non modifiable, non supprimable)"
                            >
                              🔒 Payée
                            </span>
                          ) : (
                            <select
                              className={`pill ${o.status}`}
                              value={o.status}
                              onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                            >
                              {STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <button className="link" onClick={() => setOpen(open === o.id ? null : o.id)}>
                              {open === o.id ? "Masquer" : "Voir"}
                            </button>
                            {o.status === "cancelled" && (
                              <button
                                type="button"
                                className="btn-delete-sm"
                                onClick={() => deleteOrder(o.id, o.order_number)}
                                title="Supprimer définitivement cette commande annulée"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open === o.id && (
                        <tr key={`${o.id}-d`} className="details">
                          <td colSpan={6}>
                            <div className="order-details-content">
                              <p>
                                <strong>Livraison :</strong> {o.shipping_address?.["address"]},{" "}
                                {o.shipping_address?.["postalCode"]} {o.shipping_address?.["city"]} ·{" "}
                                Tél {o.customer_phone ?? "—"}
                              </p>
                              <p className="muted-small">Règlement : Espèces à la livraison</p>

                              <div className="order-details-items">
                                <p className="col-label" style={{ marginBottom: "0.5rem" }}>📦 Fichiers & Articles de la commande :</p>
                                <div className="details-items-grid">
                                  {o.items.map((it, idx) => {
                                    const slug = slugFor(o, idx);
                                    const existingMemory = memories.find((m) => m.slug === slug);
                                    const itemPhoto = resolveMedia(o, it, "photo", idx);
                                    const itemVideo = resolveMedia(o, it, "video", idx);

                                    return (
                                      <div key={idx} className="details-item-card">
                                        {itemPhoto && (
                                          <img src={itemPhoto} alt="Tirage" className="thumb" />
                                        )}
                                        <div className="details-item-info">
                                          <span><strong>Format :</strong> {String(it["format"] ?? "10x15")} {Boolean(it["withFrame"]) && "· Avec cadre bois"} · Qté : {String(it["qty"] ?? 1)}</span>
                                          {Boolean(it["cardMessage"]) && (
                                            <span className="muted-small">« {String(it["cardMessage"])} »</span>
                                          )}
                                        </div>
                                        <div className="details-item-actions">
                                          {itemPhoto ? (
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-download"
                                              onClick={() => downloadPhoto10x15(itemPhoto, getFilename(itemPhoto, `memora-photo-${o.order_number}`, "jpg"))}
                                              disabled={downloadingUrl === itemPhoto}
                                              title="Télécharger Photo 10×15 HD (300 DPI)"
                                            >
                                              {downloadingUrl === itemPhoto ? "⏳..." : "⬇ Photo 10×15 HD"}
                                            </button>
                                          ) : (
                                            <span className="muted-small">Photo par défaut</span>
                                          )}
                                          {itemVideo && (
                                            <button
                                              type="button"
                                              className="btn btn-sm"
                                              onClick={() => downloadMedia(itemVideo, getFilename(itemVideo, `memora-video-${o.order_number}`, "mp4"))}
                                              disabled={downloadingUrl === itemVideo}
                                              title="Télécharger Vidéo"
                                            >
                                              {downloadingUrl === itemVideo ? "⏳..." : "⬇ Vidéo"}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB 3 : SOUVENIRS / PUCES EN LIGNE                             */}
        {/* ============================================================== */}
        {tab === "memories" && (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Photo</th><th>Titre / Lien NFC (vidéo directe)</th><th>Scans</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {memories.length === 0 && (
                    <tr><td colSpan={5} className="empty">Aucun souvenir actif.</td></tr>
                  )}
                  {memories.map((m) => {
                    const fullLink = nfcLinkFor(m.slug);
                    return (
                      <tr key={m.id}>
                        <td>{m.photo_url ? <img className="thumb" src={m.photo_url} alt={m.title} /> : "—"}</td>
                        <td>
                          <strong>{m.title}</strong><br />
                          <a href={fullLink} target="_blank" rel="noreferrer" className="link-slug" title="Ouvre directement la vidéo dans le navigateur">
                            {fullLink}
                          </a>
                        </td>
                        <td><strong>{m.view_count ?? 0}</strong> scans</td>
                        <td>
                          <select
                            className="pill"
                            value={m.status}
                            onChange={(e) => setMemoryStatus(m.id, e.target.value as Memory["status"])}
                          >
                            <option value="active">Actif</option>
                            <option value="draft">Brouillon</option>
                            <option value="archived">Archivé</option>
                          </select>
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn btn-sm" onClick={() => copyLink(m.slug)}>
                              {copiedSlug === m.slug ? "✓ Lien copié !" : "📋 Copier lien NFC vidéo"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => downloadMedia(m.video_url, getFilename(m.video_url, `memora-video-${m.slug}`, "mp4"))}
                              disabled={downloadingUrl === m.video_url}
                              title="Télécharger la vidéo"
                            >
                              {downloadingUrl === m.video_url ? "⏳..." : "⬇ Vidéo"}
                            </button>
                            {m.photo_url && (
                              <button
                                type="button"
                                className="btn btn-sm btn-download"
                                onClick={() => downloadPhoto10x15(m.photo_url!, getFilename(m.photo_url!, `memora-photo-${m.slug}`, "jpg"))}
                                disabled={downloadingUrl === m.photo_url}
                                title="Télécharger la photo calibrée 10×15 HD (300 DPI)"
                              >
                                {downloadingUrl === m.photo_url ? "⏳..." : "⬇ Photo 10×15 HD"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
