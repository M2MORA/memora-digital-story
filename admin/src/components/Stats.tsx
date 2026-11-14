import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { STATUSES } from "../lib/supabase";
import { fmt } from "../lib/format";
import { PRESETS, delta, formatDelta, type Kpis } from "../lib/stats";
import { useStats } from "../lib/useStats";
import BarChart from "./BarChart";

const SOURCE_LABEL: Record<string, string> = { web: "Site web", whatsapp: "WhatsApp" };

/** Variation par rapport à la période précédente, avec sens (hausse = bien, sauf annulations). */
function Trend({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value === null) return <span className="trend muted">pas de comparaison</span>;
  const up = value > 0;
  const good = value === 0 ? null : up === goodWhenUp;
  return (
    <span className={`trend ${good === null ? "" : good ? "good" : "bad"}`}>
      {formatDelta(value)} <span className="muted">vs période précédente</span>
    </span>
  );
}

export default function Stats({ enabled }: { enabled: boolean }) {
  const { preset, setPreset, data, loading, error, reload } = useStats(enabled);
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const cur: Kpis | undefined = data?.current;
  const prev: Kpis | undefined = data?.previous;

  const statusRows = STATUSES.map((s) => ({ ...s, n: data?.byStatus[s.value] ?? 0 }));
  const statusMax = Math.max(1, ...statusRows.map((s) => s.n));
  const totalStatus = statusRows.reduce((sum, s) => sum + s.n, 0);

  const sources = Object.entries(data?.bySource ?? {});
  const sourceRevenue = sources.reduce((sum, [, v]) => sum + v.revenue, 0);

  return (
    <section className="stats" aria-label="Statistiques">
      <div className="stats-bar">
        <div className="segments" role="group" aria-label="Période">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              className={`segment ${preset === p.value ? "active" : ""}`}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden /> Actualiser
        </button>
      </div>

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!data && loading && (
        <div className="kpi-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="kpi skeleton" />
          ))}
        </div>
      )}

      {cur && prev && data && (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <span className="kpi-label">Chiffre d'affaires</span>
              <strong className="kpi-value">{fmt(cur.revenue)}</strong>
              <Trend value={delta(cur.revenue, prev.revenue)} />
            </div>
            <div className="kpi">
              <span className="kpi-label">Commandes</span>
              <strong className="kpi-value">{cur.orders}</strong>
              <Trend value={delta(cur.orders, prev.orders)} />
            </div>
            <div className="kpi">
              <span className="kpi-label">Panier moyen</span>
              <strong className="kpi-value">{cur.avgBasket === null ? "—" : fmt(cur.avgBasket)}</strong>
              <Trend
                value={cur.avgBasket !== null && prev.avgBasket !== null ? delta(cur.avgBasket, prev.avgBasket) : null}
              />
            </div>
            <div className="kpi">
              <span className="kpi-label">Encaissé</span>
              <strong className="kpi-value">{fmt(cur.collected)}</strong>
              <span className="trend muted">À encaisser : {fmt(cur.toCollect)}</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-row">
              <h3 className="panel-title">Ventes par {data.bucket === "day" ? "jour" : data.bucket === "week" ? "semaine" : "mois"}</h3>
              <div className="segments tight" role="group" aria-label="Afficher">
                <button
                  type="button"
                  aria-pressed={metric === "revenue"}
                  className={`segment ${metric === "revenue" ? "active" : ""}`}
                  onClick={() => setMetric("revenue")}
                >
                  Chiffre
                </button>
                <button
                  type="button"
                  aria-pressed={metric === "orders"}
                  className={`segment ${metric === "orders" ? "active" : ""}`}
                  onClick={() => setMetric("orders")}
                >
                  Commandes
                </button>
              </div>
            </div>
            <BarChart
              series={data.series}
              bucket={data.bucket}
              metric={metric}
              format={metric === "revenue" ? (v) => fmt(v) : (v) => `${v} commande${v > 1 ? "s" : ""}`}
            />
            <p className="muted">
              Les commandes annulées ne comptent pas. « Encaissé » = commandes passées en Payée pendant la période
              (avant le 14/11/2026, la date de paiement est estimée à la date de commande).
            </p>
          </div>

          <div className="stats-split">
            <div className="panel">
              <h3 className="panel-title">Commandes par statut</h3>
              {totalStatus === 0 ? (
                <p className="muted">Aucune commande sur cette période.</p>
              ) : (
                <ul className="hbars">
                  {statusRows.map((s) => (
                    <li key={s.value}>
                      <span className="hbar-label">{s.label}</span>
                      <span className="hbar-track" aria-hidden>
                        <span className={`hbar-fill s-${s.value}`} style={{ width: `${(s.n / statusMax) * 100}%` }} />
                      </span>
                      <span className="hbar-n">{s.n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {cur.cancelRate !== null && (
                <p className="muted">
                  Taux d'annulation : {Math.round(cur.cancelRate * 100)} % ({cur.cancelled} sur {cur.allOrders}) ·{" "}
                  <Trend
                    value={
                      cur.cancelRate !== null && prev.cancelRate !== null
                        ? delta(cur.cancelRate, prev.cancelRate)
                        : null
                    }
                    goodWhenUp={false}
                  />
                </p>
              )}
            </div>

            <div className="panel">
              <h3 className="panel-title">D'où viennent les commandes</h3>
              {sources.length === 0 ? (
                <p className="muted">Aucune commande sur cette période.</p>
              ) : (
                <ul className="hbars">
                  {sources.map(([key, v]) => (
                    <li key={key}>
                      <span className="hbar-label">{SOURCE_LABEL[key] ?? key}</span>
                      <span className="hbar-track" aria-hidden>
                        <span
                          className="hbar-fill s-source"
                          style={{ width: `${sourceRevenue ? (v.revenue / sourceRevenue) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="hbar-n">{v.orders}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sources.length > 0 && (
                <p className="muted">
                  {sources.map(([key, v]) => `${SOURCE_LABEL[key] ?? key} : ${fmt(v.revenue)}`).join(" · ")}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
