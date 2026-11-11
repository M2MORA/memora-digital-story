import { useState } from "react";
import { STATUSES, type Order, type OrderStatus } from "../lib/supabase";
import { fmt, fmtDate, statusLabel } from "../lib/format";

type Filter = OrderStatus | "all";

export default function OrderList({
  orders,
  selectedId,
  onOpen,
}: {
  orders: Order[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const shown = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (!q ||
        `${o.order_number} ${o.customer_name} ${o.customer_email} ${o.customer_phone ?? ""}`
          .toLowerCase()
          .includes(q)),
  );

  const countOf = (f: Filter) => (f === "all" ? orders.length : orders.filter((o) => o.status === f).length);
  const chips: { value: Filter; label: string }[] = [{ value: "all", label: "Toutes" }, ...STATUSES];

  return (
    <section className="list-pane">
      <input
        className="search"
        type="search"
        placeholder="Chercher : n°, nom, téléphone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="chips" role="tablist" aria-label="Filtrer par statut">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={filter === c.value}
            className={`chip ${filter === c.value ? "active" : ""}`}
            onClick={() => setFilter(c.value)}
          >
            {c.label} <span className="chip-count">{countOf(c.value)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty">Aucune commande.</p>
      ) : (
        <ul className="order-list">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`order-row ${selectedId === o.id ? "selected" : ""}`}
                onClick={() => onOpen(o.id)}
              >
                <span className="order-row-main">
                  <span className="order-row-top">
                    <strong>{o.customer_name}</strong>
                    <span className="order-row-total">{fmt(o.total, o.currency)}</span>
                  </span>
                  <span className="order-row-sub">
                    #{o.order_number} · {fmtDate(o.created_at)} · {o.items.length} article{o.items.length > 1 ? "s" : ""}
                  </span>
                  <span className={`pill ${o.status}`}>
                    {o.status === "paid" && "🔒 "}
                    {statusLabel(o.status)}
                  </span>
                </span>
                <span className="chevron" aria-hidden>›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
