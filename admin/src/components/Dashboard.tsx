import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, STATUSES, type Order, type OrderStatus, type Memory } from "../lib/supabase";

type Tab = "workshop" | "orders" | "memories";

const fmt = (n: number, cur = "TND") =>
  `${Number(n).toFixed(2)} ${cur === "TND" ? "DT" : cur}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

const defaultEnvUrl = String(import.meta.env["VITE_SITE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");

export default function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("workshop");
  const [orders, setOrders] = useState<Order[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  
  // URL de base configurable pour flasher les puces NFC
  const [siteUrl, setSiteUrl] = useState(() => {
    return localStorage.getItem("memora_admin_site_url") || defaultEnvUrl;
  });

  const handleSiteUrlChange = (newUrl: string) => {
    const clean = newUrl.trim().replace(/\/+$/, "");
    setSiteUrl(clean);
    localStorage.setItem("memora_admin_site_url", clean);
  };

  const slugFor = (o: Order, itemIndex: number) =>
    o.items.length > 1 ? `${o.order_number.toLowerCase()}-${itemIndex + 1}` : o.order_number.toLowerCase();

  const copyLink = async (slug: string) => {
    const fullUrl = `${siteUrl}/m/${slug}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 3000);
  };

  const load = useCallback(async () => {
    setError("");
    const [o, m] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("memories").select("*").order("created_at", { ascending: false }),
    ]);
    if (o.error) setError(o.error.message);
    else setOrders(o.data as Order[]);
    if (m.error) setError(m.error.message);
    else setMemories(m.data as Memory[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
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
    const videoUrl = it["videoUrl"] as string | undefined;
    const photoUrl = it["photoUrl"] as string | undefined;

    if (!videoUrl) {
      alert("Attention : la vidéo de ce tirage n'a pas été reçue.");
      return;
    }

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
            <label title="L'URL de votre site utilisée pour générer les liens NFC">
              Domaine NFC :
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
                        <select
                          className={`pill ${o.status}`}
                          value={o.status}
                          onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
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
                        const nfcLink = `${siteUrl}/m/${slug}`;
                        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(nfcLink)}`;
                        const videoUrl = it["videoUrl"] as string | undefined;
                        const photoUrl = it["photoUrl"] as string | undefined;

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
                                <p className="col-label">🖼️ Photo à imprimer</p>
                                <div className="photo-box">
                                  {photoUrl ? (
                                    <>
                                      <img src={photoUrl} alt="Photo tirage" className="craft-preview-img" />
                                      <a
                                        href={photoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={`memora-photo-${o.order_number}.jpg`}
                                        className="btn btn-block"
                                      >
                                        ⬇ Télécharger Photo HD
                                      </a>
                                    </>
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
                                      <a
                                        href={videoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={`memora-video-${o.order_number}.mp4`}
                                        className="btn btn-block"
                                      >
                                        ⬇ Télécharger Vidéo
                                      </a>
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
                                          🔗 Tester (/m/...)
                                        </a>
                                      </div>

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
                          <select
                            className={`pill ${o.status}`}
                            value={o.status}
                            onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                          >
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button className="link" onClick={() => setOpen(open === o.id ? null : o.id)}>
                            {open === o.id ? "Masquer" : "Voir"}
                          </button>
                        </td>
                      </tr>
                      {open === o.id && (
                        <tr key={`${o.id}-d`} className="details">
                          <td colSpan={6}>
                            <p>
                              <strong>Livraison :</strong> {o.shipping_address?.["address"]},{" "}
                              {o.shipping_address?.["postalCode"]} {o.shipping_address?.["city"]} ·{" "}
                              Tél {o.customer_phone ?? "—"}
                            </p>
                            <p className="muted-small">Règlement : Espèces à la livraison</p>
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
                  <tr><th>Photo</th><th>Titre / Lien NFC</th><th>Scans</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {memories.length === 0 && (
                    <tr><td colSpan={5} className="empty">Aucun souvenir actif.</td></tr>
                  )}
                  {memories.map((m) => {
                    const fullLink = `${siteUrl}/m/${m.slug}`;
                    return (
                      <tr key={m.id}>
                        <td>{m.photo_url ? <img className="thumb" src={m.photo_url} alt={m.title} /> : "—"}</td>
                        <td>
                          <strong>{m.title}</strong><br />
                          <a href={fullLink} target="_blank" rel="noreferrer" className="link-slug">
                            /m/{m.slug}
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
                              📋 Copier lien
                            </button>
                            <a className="link" href={m.video_url} target="_blank" rel="noreferrer" download>
                              Vidéo
                            </a>
                            {m.photo_url && (
                              <a className="link" href={m.photo_url} target="_blank" rel="noreferrer" download>
                                Photo
                              </a>
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
