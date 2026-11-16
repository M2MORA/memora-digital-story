import { useCallback, useMemo, useState } from "react";
import { supabase, type Order, type Memory } from "./supabase";
import { computeStats, parseServerStats } from "./rules";

/**
 * Chiffres du résumé et des compteurs (À faire, Encaissé…), toujours affichés.
 * Distinct de useStats (onglet Statistiques, admin_sales_stats, chargé à l'ouverture).
 */
export function useSummaryStats(orders: Order[], memories: Memory[]) {
  const [serverStats, setServerStats] = useState<ReturnType<typeof parseServerStats>>(null);

  /** Chiffres exacts de la base ; sans la fonction admin_stats, repli sur les commandes chargées. */
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_stats");
    setServerStats(error ? null : parseServerStats(data));
  }, []);

  const stats = useMemo(() => serverStats ?? computeStats(orders, memories), [serverStats, orders, memories]);
  const statusCounts = serverStats?.byStatus ?? null;

  return { stats, statusCounts, refresh };
}
