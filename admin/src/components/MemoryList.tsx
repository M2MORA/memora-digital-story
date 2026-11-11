import { useState } from "react";
import type { Memory } from "../lib/supabase";
import { getFilename } from "../lib/format";
import { nfcLinkFor, type AdminData } from "../lib/useAdminData";

export default function MemoryList({ data }: { data: AdminData }) {
  const { memories, copiedSlug, downloadingUrl } = data;
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = memories.filter((m) => !q || `${m.title} ${m.slug}`.toLowerCase().includes(q));

  return (
    <section className="list-pane">
      <input
        className="search"
        type="search"
        placeholder="Chercher un souvenir…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {shown.length === 0 ? (
        <p className="empty">Aucun souvenir.</p>
      ) : (
        <ul className="memory-list">
          {shown.map((m) => {
            const link = nfcLinkFor(m.slug);
            const photoUrl = data.memoryMediaUrl(m.photo_url);
            const videoUrl = data.memoryMediaUrl(m.video_url) ?? m.video_url;
            return (
              <li key={m.id} className="block memory">
                <div className="memory-top">
                  {photoUrl ? (
                    <img className="thumb" src={photoUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="thumb placeholder" aria-hidden>✨</span>
                  )}
                  <div className="memory-info">
                    <strong>{m.title}</strong>
                    <span className="muted">👁 {m.view_count ?? 0} scan{(m.view_count ?? 0) > 1 ? "s" : ""}</span>
                    <a className="link small" href={link} target="_blank" rel="noreferrer">Ouvrir le lien</a>
                  </div>
                  <select
                    className={`pill mem-${m.status}`}
                    value={m.status}
                    aria-label="Statut du souvenir"
                    onChange={(e) => data.setMemoryStatus(m.id, e.target.value as Memory["status"])}
                  >
                    <option value="active">Actif</option>
                    <option value="draft">Brouillon</option>
                    <option value="archived">Archivé</option>
                  </select>
                </div>

                <div className="memory-actions">
                  <button
                    type="button"
                    className={`btn ${copiedSlug === m.slug ? "copied" : "primary"}`}
                    onClick={() => data.copyLink(m.slug)}
                  >
                    {copiedSlug === m.slug ? "✓ Copié" : "📋 Copier"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={downloadingUrl === videoUrl}
                    onClick={() => data.downloadMedia(videoUrl, getFilename(videoUrl, `memora-video-${m.slug}`, "mp4"))}
                  >
                    {downloadingUrl === videoUrl ? "⏳" : "⬇ Vidéo"}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      className="btn"
                      disabled={downloadingUrl === photoUrl}
                      onClick={() =>
                        data.downloadPhoto10x15(photoUrl, getFilename(photoUrl, `memora-photo-${m.slug}`, "jpg"))
                      }
                    >
                      {downloadingUrl === photoUrl ? "⏳" : "⬇ Photo"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
