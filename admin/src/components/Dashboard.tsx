import { useEffect, useState } from "react";
import { Menu, Nfc, Package, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings as SettingsIcon, X } from "lucide-react";
import { fmt } from "../lib/format";
import { useAdminData } from "../lib/useAdminData";
import OrderList from "./OrderList";
import OrderDetail from "./OrderDetail";
import MemoryList from "./MemoryList";
import Settings from "./Settings";

type Tab = "orders" | "memories" | "settings";

const TABS = [
  { value: "orders" as const, Icon: Package, label: "Commandes" },
  { value: "memories" as const, Icon: Nfc, label: "Souvenirs" },
  { value: "settings" as const, Icon: SettingsIcon, label: "Réglages" },
];

const COLLAPSE_KEY = "memora_admin_sidebar_collapsed";

export default function Dashboard({ email }: { email: string }) {
  const data = useAdminData();
  const [tab, setTab] = useState<Tab>("orders");
  const [openId, setOpenId] = useState<string | null>(null);
  // Téléphone : la barre s'ouvre par-dessus. Ordinateur : elle se réduit aux icônes.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Le bouton « retour » du téléphone ferme la fiche commande au lieu de quitter l'admin.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpenId((e.state as { order?: string } | null)?.order ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // préférence non mémorisée
      }
      return !c;
    });
  };

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
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  };

  const openOrderData = openId ? data.orders.find((o) => o.id === openId) : undefined;
  const current = TABS.find((t) => t.value === tab)!;

  return (
    <div className={`app ${collapsed ? "is-collapsed" : ""} ${drawerOpen ? "drawer-open" : ""}`}>
      <aside className="sidebar" aria-label="Menu principal">
        <div className="sidebar-head">
          <span className="wordmark">MÉMORA</span>
          <button type="button" className="icon-btn only-mobile" onClick={() => setDrawerOpen(false)} aria-label="Fermer le menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {TABS.map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              className={`nav-item ${tab === value ? "active" : ""}`}
              aria-current={tab === value ? "page" : undefined}
              title={collapsed ? label : undefined}
              onClick={() => switchTab(value)}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span className="nav-label">{label}</span>
              {value === "orders" && data.stats.todo > 0 && <span className="nav-count">{data.stats.todo}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-user" title={email}>{email}</span>
          <button
            type="button"
            className="icon-btn only-desktop"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn only-mobile" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <h1 className="page-title">{current.label}</h1>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void data.load()}
            aria-label="Actualiser"
            title="Actualiser"
            disabled={data.loading}
          >
            <RefreshCw size={18} className={data.loading ? "spin" : ""} />
          </button>
        </header>

        <main className="content">
          {data.error && (
            <div className="banner" role="alert">
              <span>{data.error}</span>
              <button type="button" className="link" onClick={() => data.setError("")}>Fermer</button>
            </div>
          )}

          {tab === "orders" && (
            <>
              {!openOrderData && (
                <dl className="summary">
                  <div><dt>À faire</dt><dd>{data.stats.todo}</dd></div>
                  <div><dt>Encaissé</dt><dd>{fmt(data.stats.collected)}</dd></div>
                  <div><dt>À encaisser</dt><dd>{fmt(data.stats.toCollect)}</dd></div>
                  <div><dt>Scans NFC</dt><dd>{data.stats.views}</dd></div>
                </dl>
              )}

              <div className={`orders-layout ${openOrderData ? "has-detail" : ""}`}>
                <OrderList orders={data.orders} loading={data.loading} selectedId={openId} onOpen={openOrder} />
                {openOrderData ? (
                  <OrderDetail key={openOrderData.id} order={openOrderData} data={data} onBack={closeOrder} />
                ) : (
                  <div className="detail-placeholder">
                    <Package size={28} strokeWidth={1.5} aria-hidden />
                    <p>Choisis une commande pour voir la photo et la puce NFC.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "memories" && <MemoryList data={data} />}
          {tab === "settings" && <Settings email={email} />}
        </main>
      </div>
    </div>
  );
}
