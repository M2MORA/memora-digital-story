import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Eye, Nfc, Search } from "lucide-react";
import type { Memory } from "../lib/supabase";
import { nfcLinkFor, type AdminData } from "../lib/useAdminData";

export default function MemoryList({ data }: { data: AdminData }) {
  const { memories, copiedSlug, downloadingUrl } = data;
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = memories.filter((m) => !q || `${m.title} ${m.slug}`.toLowerCase().includes(q));

  return (
    <section className="list-pane wide" aria-label="Souvenirs">
      <label className="search">
        <Search size={18} aria-hidden />
        <span className="sr-only">Chercher un souvenir</span>
        <input type="search" placeholder="Titre ou lien" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {shown.length === 0 ? (
        <p className="empty">
          {memories.length === 0
            ? "Aucun souvenir. Un souvenir est créé depuis une commande, avec « Créer le lien NFC »."
            : "Aucun souvenir ne correspond à la recherche."}
        </p>
      ) : (
        <ul className="cards">
          {shown.map((m) => {
            const link = nfcLinkFor(m.slug);
            const photoUrl = data.memoryMediaUrl(m.photo_url);
            const views = m.view_count ?? 0;
            return (
              <li key={m.id} className="card">
                <div className="card-top">
                  {photoUrl ? (
                    <img className="thumb" src={photoUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="thumb empty-thumb" aria-hidden>
                      <Nfc size={20} />
                    </span>
                  )}
                  <div className="card-info">
                    <strong>{m.title}</strong>
                    <span className="muted">
                      <Eye size={14} aria-hidden /> {views} scan{views > 1 ? "s" : ""}
                    </span>
                  </div>
                  <select
                    className={`status-select m-${m.status}`}
                    value={m.status}
                    aria-label="Statut du souvenir"
                    onChange={(e) => data.setMemoryStatus(m.id, e.target.value as Memory["status"])}
                  >
                    <option value="active">Actif</option>
                    <option value="draft">Brouillon</option>
                    <option value="archived">Archivé</option>
                  </select>
                </div>

                <div className="actions-row">
                  <button
                    type="button"
                    className={`btn ${copiedSlug === m.slug ? "success" : ""}`}
                    onClick={() => data.copyLink(m.slug)}
                  >
                    {copiedSlug === m.slug ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                    {copiedSlug === m.slug ? "Copié" : "Copier le lien"}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      className="btn"
                      disabled={downloadingUrl === photoUrl}
                      onClick={() => data.downloadPhotoPdf(photoUrl, `memora-${m.slug}-10x15.pdf`)}
                    >
                      <Download size={16} aria-hidden />
                      {downloadingUrl === photoUrl ? "PDF…" : "PDF 10×15"}
                    </button>
                  )}
                  <a className="btn icon-only" href={link} target="_blank" rel="noreferrer" aria-label="Ouvrir le lien" title="Ouvrir le lien">
                    <ExternalLink size={16} aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
