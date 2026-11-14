/**
 * Calculs de la page Statistiques, sans dépendance au navigateur ni à Supabase
 * pour pouvoir les tester (voir stats.test.ts). Les chiffres eux-mêmes viennent
 * de la fonction SQL admin_sales_stats.
 */

export type Bucket = "day" | "week" | "month";
export type Preset = "7d" | "30d" | "90d" | "12m";

export const PRESETS: { value: Preset; label: string; bucket: Bucket }[] = [
  { value: "7d", label: "7 jours", bucket: "day" },
  { value: "30d", label: "30 jours", bucket: "day" },
  { value: "90d", label: "90 jours", bucket: "week" },
  { value: "12m", label: "12 mois", bucket: "month" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
// La Tunisie est en UTC+1 toute l'année (pas d'heure d'été).
const TUNIS_OFFSET_MS = 60 * 60 * 1000;

/** Début (en UTC) du jour tunisien qui suit « now » : la période inclut donc toute la journée en cours. */
function startOfTomorrowTunis(now: Date): Date {
  const local = now.getTime() + TUNIS_OFFSET_MS;
  const startOfLocalDay = Math.floor(local / DAY_MS) * DAY_MS;
  return new Date(startOfLocalDay + DAY_MS - TUNIS_OFFSET_MS);
}

/** Début (en UTC) du mois tunisien situé `monthsBack` mois avant le mois de `now`. */
function startOfMonthTunis(now: Date, monthsBack: number): Date {
  const local = new Date(now.getTime() + TUNIS_OFFSET_MS);
  const firstOfMonthLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - monthsBack, 1);
  return new Date(firstOfMonthLocal - TUNIS_OFFSET_MS);
}

export function periodRange(preset: Preset, now: Date = new Date()): { from: Date; to: Date; bucket: Bucket } {
  const to = startOfTomorrowTunis(now);
  const bucket = PRESETS.find((p) => p.value === preset)?.bucket ?? "day";
  switch (preset) {
    case "7d":
      return { from: new Date(to.getTime() - 7 * DAY_MS), to, bucket };
    case "30d":
      return { from: new Date(to.getTime() - 30 * DAY_MS), to, bucket };
    case "90d":
      return { from: new Date(to.getTime() - 90 * DAY_MS), to, bucket };
    case "12m":
      return { from: startOfMonthTunis(now, 11), to, bucket };
  }
}

export type Kpis = {
  orders: number;
  revenue: number;
  cancelled: number;
  allOrders: number;
  collected: number;
  toCollect: number;
  /** Chiffre d'affaires / commandes ; null s'il n'y a aucune commande. */
  avgBasket: number | null;
  /** Part des commandes annulées (0 à 1) ; null s'il n'y a aucune commande. */
  cancelRate: number | null;
};

export type SeriesPoint = { bucket: string; orders: number; revenue: number };

export type SalesStats = {
  bucket: Bucket;
  current: Kpis;
  previous: Kpis;
  series: SeriesPoint[];
  byStatus: Record<string, number>;
  bySource: Record<string, { orders: number; revenue: number }>;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseKpis(raw: unknown): Kpis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const orders = num(r["orders"]);
  const revenue = num(r["revenue"]);
  const cancelled = num(r["cancelled"]);
  const allOrders = num(r["all_orders"]);
  return {
    orders,
    revenue,
    cancelled,
    allOrders,
    collected: num(r["collected"]),
    toCollect: num(r["to_collect"]),
    avgBasket: orders > 0 ? revenue / orders : null,
    cancelRate: allOrders > 0 ? cancelled / allOrders : null,
  };
}

/** Réponse de admin_sales_stats → objet typé ; null si elle est inutilisable. */
export function parseSalesStats(raw: unknown): SalesStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const current = parseKpis(r["current"]);
  const previous = parseKpis(r["previous"]);
  const bucket = r["bucket"];
  if (!current || !previous || (bucket !== "day" && bucket !== "week" && bucket !== "month")) return null;

  const series = Array.isArray(r["series"])
    ? (r["series"] as unknown[]).flatMap((p) => {
        if (!p || typeof p !== "object") return [];
        const o = p as Record<string, unknown>;
        return typeof o["bucket"] === "string"
          ? [{ bucket: o["bucket"], orders: num(o["orders"]), revenue: num(o["revenue"]) }]
          : [];
      })
    : [];

  const byStatus: Record<string, number> = {};
  for (const [k, v] of Object.entries((r["by_status"] ?? {}) as Record<string, unknown>)) byStatus[k] = num(v);

  const bySource: Record<string, { orders: number; revenue: number }> = {};
  for (const [k, v] of Object.entries((r["by_source"] ?? {}) as Record<string, unknown>)) {
    const o = (v ?? {}) as Record<string, unknown>;
    bySource[k] = { orders: num(o["orders"]), revenue: num(o["revenue"]) };
  }

  return { bucket, current, previous, series, byStatus, bySource };
}

/** Variation en % par rapport à la période précédente ; null si la période précédente est à zéro. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function formatDelta(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

/** « 12/11 » pour un jour ou une semaine (lundi), « nov. 26 » pour un mois. */
export function bucketLabel(bucketIso: string, bucket: Bucket): string {
  const [y, m, d] = bucketIso.split("-").map(Number);
  if (!y || !m || !d) return bucketIso;
  if (bucket === "month") {
    const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
    return `${name} ${String(y).slice(2)}`;
  }
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
