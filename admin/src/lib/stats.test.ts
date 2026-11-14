import { describe, expect, it } from "vitest";
import { bucketLabel, delta, formatDelta, parseSalesStats, periodRange } from "./stats";

describe("periodRange", () => {
  // 13/11/2026 23:30 UTC = 14/11 00:30 à Tunis : la journée en cours est le 14.
  const now = new Date("2026-11-13T23:30:00Z");

  it("inclut toute la journée tunisienne en cours", () => {
    const { to } = periodRange("7d", now);
    expect(to.toISOString()).toBe("2026-11-14T23:00:00.000Z");
  });

  it("30 jours = 30 × 24 h avant la fin", () => {
    const { from, to, bucket } = periodRange("30d", now);
    expect(to.getTime() - from.getTime()).toBe(30 * 24 * 3600 * 1000);
    expect(bucket).toBe("day");
  });

  it("90 jours est regroupé par semaine", () => {
    expect(periodRange("90d", now).bucket).toBe("week");
  });

  it("12 mois commence au 1er du mois, il y a 11 mois, à minuit de Tunis", () => {
    const { from, bucket } = periodRange("12m", now);
    expect(bucket).toBe("month");
    expect(from.toISOString()).toBe("2025-11-30T23:00:00.000Z"); // 01/12/2025 00:00 Tunis
  });
});

describe("delta / formatDelta", () => {
  it("calcule la variation en pourcentage", () => {
    expect(delta(150, 100)).toBe(50);
    expect(delta(50, 100)).toBe(-50);
  });

  it("renvoie null quand la période précédente est à zéro", () => {
    expect(delta(10, 0)).toBeNull();
    expect(formatDelta(null)).toBe("—");
  });

  it("met un signe + devant une hausse", () => {
    expect(formatDelta(12.4)).toBe("+12 %");
    expect(formatDelta(-8)).toBe("-8 %");
    expect(formatDelta(0)).toBe("0 %");
  });
});

describe("bucketLabel", () => {
  it("jour et semaine : jj/mm", () => {
    expect(bucketLabel("2026-11-09", "day")).toBe("09/11");
    expect(bucketLabel("2026-11-09", "week")).toBe("09/11");
  });

  it("mois : nom court et année sur 2 chiffres", () => {
    expect(bucketLabel("2026-11-01", "month")).toMatch(/nov.* 26/);
  });
});

describe("parseSalesStats", () => {
  const kpis = { orders: 4, revenue: "200.00", cancelled: 1, all_orders: 5, collected: 90, to_collect: 40 };

  it("lit la réponse de la base et calcule panier moyen et taux d'annulation", () => {
    const stats = parseSalesStats({
      bucket: "day",
      current: kpis,
      previous: { ...kpis, orders: 0, revenue: 0, all_orders: 0, cancelled: 0 },
      series: [{ bucket: "2026-11-13", orders: 2, revenue: "98.5" }],
      by_status: { pending: 2, paid: 1 },
      by_source: { web: { orders: 3, revenue: 150 }, whatsapp: { orders: 1, revenue: 50 } },
    });
    expect(stats?.current.revenue).toBe(200);
    expect(stats?.current.avgBasket).toBe(50);
    expect(stats?.current.cancelRate).toBeCloseTo(0.2);
    expect(stats?.previous.avgBasket).toBeNull();
    expect(stats?.previous.cancelRate).toBeNull();
    expect(stats?.series[0]).toEqual({ bucket: "2026-11-13", orders: 2, revenue: 98.5 });
    expect(stats?.bySource["whatsapp"]).toEqual({ orders: 1, revenue: 50 });
  });

  it("refuse une réponse inutilisable", () => {
    expect(parseSalesStats(null)).toBeNull();
    expect(parseSalesStats({ bucket: "year", current: kpis, previous: kpis })).toBeNull();
    expect(parseSalesStats({ bucket: "day", current: kpis })).toBeNull();
  });

  it("ignore les points de courbe mal formés", () => {
    const stats = parseSalesStats({
      bucket: "day",
      current: kpis,
      previous: kpis,
      series: [{ orders: 1 }, null, { bucket: "2026-11-13", orders: 1, revenue: 10 }],
    });
    expect(stats?.series).toHaveLength(1);
  });
});
