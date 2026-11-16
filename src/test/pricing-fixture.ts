import type { Format, Pricing } from "@/lib/pricing";

/** The grid seeded by 20261116120000_pricing_tables.sql, in the shape get_pricing() returns. */
const grid: Record<Format, { frame: number; tiers: [number, number][] }> = {
  "10x15": {
    frame: 50,
    tiers: [
      [1, 49],
      [5, 42],
      [10, 32],
      [50, 25],
      [100, 20],
    ],
  },
  "20x30": {
    frame: 120,
    tiers: [
      [1, 129],
      [5, 115],
      [10, 98],
      [50, 82],
    ],
  },
  "30x45": {
    frame: 150,
    tiers: [
      [1, 199],
      [5, 175],
      [10, 150],
      [50, 130],
    ],
  },
  box: {
    frame: 0,
    tiers: [
      [1, 89],
      [5, 79],
      [10, 69],
      [50, 59],
      [100, 49],
    ],
  },
  magnet: {
    frame: 0,
    tiers: [
      [1, 65],
      [5, 57],
      [10, 44],
      [50, 34],
      [100, 27],
    ],
  },
};

export const TODAY_PRICING: Pricing = {
  formats: Object.entries(grid).map(([code, g]) => ({
    code: code as Format,
    frame_price: g.frame,
    active: true,
  })),
  tiers: Object.entries(grid).flatMap(([format, g]) =>
    g.tiers.map(([min_qty, unit_price]) => ({ format: format as Format, min_qty, unit_price })),
  ),
  settings: {
    shipping_fee_aramex: 8,
    shipping_fee_mondial_relay: 6,
    free_shipping_threshold: 250,
    included_video_seconds: 480,
    surcharge_per_minute: 1.5,
    max_video_seconds: 1800,
  },
};

/** A copy of the grid with some changes, for tests that must not depend on today's numbers. */
export function withPricing(change: (p: Pricing) => void): Pricing {
  const copy = structuredClone(TODAY_PRICING);
  change(copy);
  return copy;
}
