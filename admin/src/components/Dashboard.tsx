import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Menu, MessageCircle, Nfc, Package, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings as SettingsIcon, X } from "lucide-react";
import { fmt } from "../lib/format";
import type { OrderStatus } from "../lib/supabase";
import { useOrders } from "../lib/useOrders";
import { useMemories } from "../lib/useMemories";
import { useSummaryStats } from "../lib/useSummaryStats";
import { useWhatsApp } from "../lib/useWhatsApp";
import OrderList from "./OrderList";
import OrderDetail from "./OrderDetail";
import MemoryList from "./MemoryList";
import Settings from "./Settings";
import WhatsAppInbox from "./WhatsAppInbox";
import Stats from "./Stats";

type Tab = "orders" | "stats" | "whatsapp" | "memories" | "settings";

const TABS = [
  { value: "orders" as const, Icon: Package, label: "Commandes" },
  { value: "stats" as const, Icon: BarChart3, label: "Statistiques" },
  { value: "whatsapp" as const, Icon: MessageCircle, label: "WhatsApp" },
  { value: "memories" as const, Icon: Nfc, label: "Souvenirs" },
  { value: "settings" as const, Icon: SettingsIcon, label: "Réglages" },
];

const COLLAPSE_KEY = "memora_admin_sidebar_collapsed";

export default function Dashboard({ email }: { email: string }) {
  const orders = useOrders();
  const memories = useMemories();
  const summary = useSummaryStats(orders.orders, memories.memories);
  const [loading, setLoading] = useState(true);
  const error = [orders.error, memories.error].filter(Boolean).join(" · ");
  const [tab, setTab] = useState<Tab>("orders");
  const wa = useWhatsApp({ inboxOpen: tab === "whatsapp" });
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

  const { load: loadOrders } = orders;
  const { load: loadMemories, loadIntentsFor } = memories;
  const { refresh: refreshStats } = summary;
  const load = useCallback(async () => {
    setLoading(true);
    const [firstPage] = await Promise.all([loadOrders(), loadMemories(), refreshStats()]);
    await loadIntentsFor(firstPage, "replace");
    setLoading(false);
  }, [loadOrders, loadMemories, loadIntentsFor, refreshStats]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMoreOrders = async () => {
    const page = await orders.loadMoreOrders();
    if (page.length) await memories.loadIntentsFor(page, "append");
  };

  /** Statut validé par la base : on rafraîchit les chiffres et les souvenirs archivés. */
  const updateStatus = async (id: string, status: OrderStatus) => {
    const archived = await orders.updateStatus(id, status);
    if (!archived) return;
    void refreshStats();
    memories.markArchived(archived);
  };

  const deleteOrder = async (id: string, orderNumber: string) => {
    const ok = await orders.deleteOrder(id, orderNumber);
    if (ok) void refreshStats();
    return ok;
  };

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

  /** Depuis l'inbox WhatsApp ou une bulle : ouvre la fiche de la commande. */
  const showOrder = (id: string) => {
    setTab("orders");
    // Commande créée par Ballech depuis le dernier chargement : on recharge la liste.
    if (!orders.orders.some((o) => o.id === id)) void load();
    openOrder(id);
  };

  /** Depuis une commande WhatsApp : ouvre la conversation du client. */
  const showConversation = (conversationId: string) => {
    if (openId) closeOrder();
    setTab("whatsapp");
    void wa.select(conversationId);
    window.scrollTo({ top: 0 });
  };

  // Clic sur une notification : ouvre la commande ou la conversation WhatsApp
  // (admin fermé : ?order=… / ?conversation=…, déjà ouvert : message du service worker).
  const showOrderRef = useRef(showOrder);
  showOrderRef.current = showOrder;
  const showConversationRef = useRef(showConversation);
  showConversationRef.current = showConversation;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    const conversationId = params.get("conversation");
    if (orderId || conversationId) history.replaceState(null, "", window.location.pathname);
    if (orderId) showOrderRef.current(orderId);
    else if (conversationId) showConversationRef.current(conversationId);

    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; orderId?: string; conversationId?: string } | null;
      if (msg?.type === "open-order" && typeof msg.orderId === "string") showOrderRef.current(msg.orderId);
      if (msg?.type === "open-conversation" && typeof msg.conversationId === "string")
        showConversationRef.current(msg.conversationId);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  const openOrderData = openId ? orders.orders.find((o) => o.id === openId) : undefined;
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
              {value === "orders" && summary.stats.todo > 0 && <span className="nav-count">{summary.stats.todo}</span>}
              {value === "whatsapp" && wa.waitingCount > 0 && <span className="nav-count">{wa.waitingCount}</span>}
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
            onClick={() => void (tab === "whatsapp" ? wa.reload() : load())}
            aria-label="Actualiser"
            title="Actualiser"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </header>

        <main className="content">
          {error && (
            <div className="banner" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  orders.setError("");
                  memories.setError("");
                }}
              >
                Fermer
              </button>
            </div>
          )}

          {tab === "orders" && (
            <>
              {!openOrderData && (
                <dl className="summary">
                  <div><dt>À faire</dt><dd>{summary.stats.todo}</dd></div>
                  <div><dt>Encaissé</dt><dd>{fmt(summary.stats.collected)}</dd></div>
                  <div><dt>À encaisser</dt><dd>{fmt(summary.stats.toCollect)}</dd></div>
                  <div><dt>Scans NFC</dt><dd>{summary.stats.views}</dd></div>
                </dl>
              )}

              <div className={`orders-layout ${openOrderData ? "has-detail" : ""}`}>
                <OrderList
                  orders={orders.orders}
                  loading={loading}
                  selectedId={openId}
                  onOpen={openOrder}
                  counts={summary.statusCounts}
                  hasMore={orders.hasMoreOrders}
                  loadingMore={orders.loadingMore}
                  onLoadMore={() => void loadMoreOrders()}
                />
                {openOrderData ? (
                  <OrderDetail
                    key={openOrderData.id}
                    order={openOrderData}
                    memories={memories}
                    onUpdateStatus={updateStatus}
                    onDelete={deleteOrder}
                    onBack={closeOrder}
                    onOpenConversation={showConversation}
                  />
                ) : (
                  <div className="detail-placeholder">
                    <Package size={28} strokeWidth={1.5} aria-hidden />
                    <p>Choisis une commande pour voir la photo et la puce NFC.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "stats" && <Stats enabled />}
          {tab === "whatsapp" && <WhatsAppInbox wa={wa} orders={orders.orders} onOpenOrder={showOrder} />}
          {tab === "memories" && <MemoryList data={memories} />}
          {tab === "settings" && <Settings email={email} />}
        </main>
      </div>
    </div>
  );
}
