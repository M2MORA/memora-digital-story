import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { parseSalesStats, periodRange, type Preset, type SalesStats } from "./stats";

const CACHE_MS = 60_000;
const cache = new Map<Preset, { at: number; data: SalesStats }>();

/**
 * Chiffres de l'onglet Statistiques. Rien n'est demandé tant que l'onglet n'est
 * pas ouvert ; une période déjà chargée est gardée 60 s.
 */
export function useStats(enabled: boolean) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [data, setData] = useState<SalesStats | null>(() => cache.get("30d")?.data ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Évite qu'une réponse lente écrase celle d'une période choisie depuis.
  const requestId = useRef(0);

  const load = useCallback(async (which: Preset, force: boolean) => {
    const hit = cache.get(which);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) {
      setData(hit.data);
      setError("");
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    const { from, to, bucket } = periodRange(which);
    const { data: raw, error: err } = await supabase.rpc("admin_sales_stats", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket: bucket,
    });
    if (id !== requestId.current) return;
    if (err) {
      setError(
        /admin_sales_stats/.test(err.message)
          ? "Les statistiques ne sont pas encore installées dans la base (migration manquante)."
          : `Statistiques non chargées : ${err.message}`,
      );
    } else {
      const parsed = parseSalesStats(raw);
      if (parsed) {
        cache.set(which, { at: Date.now(), data: parsed });
        setData(parsed);
      } else {
        setError("Réponse inattendue de la base.");
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void load(preset, false);
  }, [enabled, preset, load]);

  return { preset, setPreset, data, loading, error, reload: () => load(preset, true) };
}
