import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { STATUSES, type Order, type OrderStatus } from "../lib/supabase";
import { fmt, fmtDate } from "../lib/format";
import StatusBadge from "./StatusBadge";

type Filter = OrderStatus | "all";

export default function OrderList({
  orders,
  loading,
  selectedId,
  onOpen,
}: {
  orders: Order[];
  loading: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const shown = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (!q || `${o.order_number} ${o.customer_name} ${o.customer_phone ?? ""}`.toLowerCase().includes(q)),
  );

  const countOf = (f: Filter) => (f === "all" ? orders.length : orders.filter((o) => o.status === f).length);
  const chips: { value: Filter; label: string }[] = [{ value: "all", label: "Toutes" }, ...STATUSES];

  return (
    <section className="list-pane" aria-label="Liste des commandes">
      <label className="search">
        <Search size={18} aria-hidden />
        <span className="sr-only">Chercher une commande</span>
        <input
          type="search"
          placeholder="N°, nom ou téléphone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      <div className="segments" aria-label="Filtrer par statut">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={filter === c.value}
            className={`segment ${filter === c.value ? "active" : ""}`}
            onClick={() => setFilter(c.value)}
          >
            {c.label}
            <span className="segment-count">{countOf(c.value)}</span>
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <ul className="rows" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="row skeleton" />
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className="empty">
          {orders.length === 0
            ? "Aucune commande pour l'instant. Les nouvelles commandes du site apparaissent ici."
            : "Aucune commande ne correspond. Change le filtre ou la recherche."}
        </p>
      ) : (
        <ul className="rows">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`row ${selectedId === o.id ? "selected" : ""}`}
                onClick={() => onOpen(o.id)}
              >
                <span className="row-main">
                  <span className="row-title">{o.customer_name}</span>
                  <span className="row-sub">
                    {o.order_number} · {fmtDate(o.created_at)}
                    {o.source === "whatsapp" && " · WhatsApp"}
                  </span>
                </span>
                <span className="row-side">
                  <span className="row-amount">{fmt(o.total, o.currency)}</span>
                  <StatusBadge status={o.status} />
                </span>
                <ChevronRight size={18} className="row-chevron" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
