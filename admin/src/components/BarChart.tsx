import { useState } from "react";
import { bucketLabel, type Bucket, type SeriesPoint } from "../lib/stats";

type Metric = "revenue" | "orders";

/**
 * Graphique en barres simple (SVG, sans bibliothèque). Un appui ou un survol sur une barre
 * affiche sa valeur ; un tableau caché reprend les mêmes chiffres pour les lecteurs d'écran.
 */
export default function BarChart({
  series,
  bucket,
  metric,
  format,
}: {
  series: SeriesPoint[];
  bucket: Bucket;
  metric: Metric;
  format: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const W = 640;
  const H = 160;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 0;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const values = series.map((p) => p[metric]);
  const max = Math.max(...values, 0);
  const step = series.length ? W / series.length : W;
  const barW = Math.max(2, Math.min(40, step * 0.62));

  // Une étiquette sur ~6 seulement, pour rester lisible sur un téléphone.
  const every = Math.max(1, Math.ceil(series.length / 6));

  if (series.length === 0 || max === 0) {
    return <p className="chart-empty">Aucune commande sur cette période.</p>;
  }

  const shown = active !== null ? series[active] : undefined;

  return (
    <figure className="chart">
      <div className="chart-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{format(shown[metric])}</strong>
            <span className="muted"> · {bucketLabel(shown.bucket, bucket)}</span>
          </>
        ) : (
          <span className="muted">Touche une barre pour voir le détail</span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graphique des ventes" preserveAspectRatio="none" className="chart-svg">
        <line x1="0" x2={W} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} className="chart-axis" />
        {series.map((p, i) => {
          const h = max ? (p[metric] / max) * innerH : 0;
          const x = i * step + (step - barW) / 2;
          return (
            <g
              key={p.bucket}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
            >
              <rect x={i * step} y={0} width={step} height={H - PAD_BOTTOM} className="chart-hit" />
              <rect
                x={x}
                y={PAD_TOP + innerH - h}
                width={barW}
                height={Math.max(h, p[metric] > 0 ? 2 : 0)}
                rx={Math.min(4, barW / 2)}
                className={`chart-bar ${active === i ? "is-active" : ""}`}
              />
            </g>
          );
        })}
      </svg>

      {/* Étiquettes en HTML : le SVG est étiré en largeur, le texte y serait déformé. */}
      <div className="chart-labels" aria-hidden>
        {series.map((p, i) =>
          i % every === 0 ? (
            <span key={p.bucket} style={{ left: `${((i + 0.5) / series.length) * 100}%` }}>
              {bucketLabel(p.bucket, bucket)}
            </span>
          ) : null,
        )}
      </div>

      <table className="sr-only">
        <caption>Détail du graphique</caption>
        <thead>
          <tr><th>Période</th><th>Commandes</th><th>Chiffre</th></tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.bucket}>
              <td>{bucketLabel(p.bucket, bucket)}</td>
              <td>{p.orders}</td>
              <td>{p.revenue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
