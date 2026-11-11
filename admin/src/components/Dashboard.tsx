import { useEffect, useState } from "react";
import { fmt } from "../lib/format";
import { useAdminData } from "../lib/useAdminData";
import OrderList from "./OrderList";
import OrderDetail from "./OrderDetail";
import MemoryList from "./MemoryList";
import Settings from "./Settings";

type Tab = "orders" | "memories" | "settings";

const TABS: { value: Tab; icon: string; label: string }[] = [
  { value: "orders", icon: "📦", label: "Commandes" },
  { value: "memories", icon: "✨", label: "Souvenirs" },
  { value: "settings", icon: "⚙️", label: "Réglages" },
];

export default function Dashboard({ email }: { email: string }) {
  const data = useAdminData();
  const [tab, setTab] = useState<Tab>("orders");
  const [openId, setOpenId] = useState<string | null>(null);

  // Le bouton « retour » du téléphone ferme la fiche commande au lieu de quitter l'admin.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpenId((e.state as { order?: string } | null)?.order ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openOrder = (id: string) => {
    if (openId) history.replaceState({ order: id }, "");
    else history.pushState({ order: id }, "");
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };

  const closeOrder = () => {
    if ((history.state as { order?: string } | null)?.order) history.back();
    else setOpenId(null);
  };

  const switchTab = (t: Tab) => {
    if (openId) closeOrder();
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const openOrderData = openId ? data.orders.find((o) => o.id === openId) : undefined;

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">MÉMORA</h1>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void data.load()}
          aria-label="Actualiser"
          disabled={data.loading}
        >
          <span className={data.loading ? "spin" : ""}>⟳</span>
        </button>
      </header>

      <main className="content">
        {data.error && (
          <p className="banner" role="alert">
            {data.error}
            <button type="button" className="link" onClick={() => data.setError("")}>OK</button>
          </p>
        )}

        {tab === "orders" && (
          <>
            {!openOrderData && (
              <div className="stats">
                <div className="stat"><span>À faire</span><strong className="highlight">{data.stats.todo}</strong></div>
                <div className="stat"><span>Encaissé</span><strong>{fmt(data.stats.collected)}</strong></div>
                <div className="stat"><span>À encaisser</span><strong>{fmt(data.stats.toCollect)}</strong></div>
                <div className="stat"><span>Scans NFC</span><strong>{data.stats.views}</strong></div>
              </div>
            )}

            <div className={`orders-layout ${openOrderData ? "has-detail" : ""}`}>
              <OrderList orders={data.orders} selectedId={openId} onOpen={openOrder} />
              {openOrderData ? (
                <OrderDetail key={openOrderData.id} order={openOrderData} data={data} onBack={closeOrder} />
              ) : (
                <div className="detail-placeholder">
                  <p className="muted">Choisis une commande pour voir la photo, la vidéo et la puce NFC.</p>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "memories" && <MemoryList data={data} />}
        {tab === "settings" && <Settings data={data} email={email} />}
      </main>

      <nav className="bottom-nav" aria-label="Navigation">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={tab === t.value ? "active" : ""}
            aria-current={tab === t.value ? "page" : undefined}
            onClick={() => switchTab(t.value)}
          >
            <span className="nav-icon" aria-hidden>{t.icon}</span>
            <span>
              {t.label}
              {t.value === "orders" && data.stats.todo > 0 && <span className="badge">{data.stats.todo}</span>}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
