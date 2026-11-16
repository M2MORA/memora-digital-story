import { useCallback, useState } from "react";
import { supabase, type Order, type OrderStatus } from "./supabase";
import { ORDERS_PAGE_SIZE, mergeById, olderThanCursor } from "./rules";
import { deleteOrderViaApi, publicSiteUrl } from "./api";
import { refusalMessage } from "./format";

/** Commandes : pages, changement de statut, suppression. Les questions à l'admin restent dans les écrans. */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  // Les commandes arrivent par pages ; les chiffres exacts viennent de la base (admin_stats).
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /** Première page ; renvoie les commandes chargées (vide en cas d'échec). */
  const load = useCallback(async (): Promise<Order[]> => {
    setError("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ORDERS_PAGE_SIZE);
    if (error) {
      setError(`Commandes non chargées : ${error.message}`);
      return [];
    }
    const firstPage = data as Order[];
    setOrders(firstPage);
    setHasMoreOrders(firstPage.length === ORDERS_PAGE_SIZE);
    return firstPage;
  }, []);

  /** Page suivante ; renvoie les nouvelles commandes (vide si rien de plus ou en cas d'échec). */
  const loadMoreOrders = async (): Promise<Order[]> => {
    const last = orders[orders.length - 1];
    if (!last || loadingMore) return [];
    setLoadingMore(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(olderThanCursor(last))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ORDERS_PAGE_SIZE);
    setLoadingMore(false);
    if (error) {
      setError(`Commandes non chargées : ${error.message}`);
      return [];
    }
    const page = (data ?? []) as Order[];
    setOrders((prev) => mergeById(prev, page));
    setHasMoreOrders(page.length === ORDERS_PAGE_SIZE);
    return page;
  };

  /**
   * La base décide (graphe, verrou « Payée ») et archive le Souvenir dans la même transaction.
   * Renvoie les souvenirs archivés, ou null si le changement a échoué.
   */
  const updateStatus = async (id: string, status: OrderStatus): Promise<string[] | null> => {
    const { data: res, error } = await supabase.rpc("set_order_status", { p_order_id: id, p_status: status });
    if (error) {
      setError(error.message);
      return null;
    }
    if (!res?.ok) {
      setError(refusalMessage(res?.reason ?? "unknown", res?.from, res?.to));
      return null;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    return (res.archived_memory_ids ?? []) as string[];
  };

  const deleteOrder = async (id: string, orderNumber: string): Promise<boolean> => {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée, veuillez vous reconnecter.");

      await deleteOrderViaApi({ apiBase: publicSiteUrl, accessToken: session.access_token, orderId: id });
      setOrders((prev) => prev.filter((o) => o.id !== id));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Échec de la suppression de la commande #${orderNumber} : ${message}`);
      return false;
    }
  };

  return { orders, error, setError, hasMoreOrders, loadingMore, load, loadMoreOrders, updateStatus, deleteOrder };
}

export type OrdersData = ReturnType<typeof useOrders>;
