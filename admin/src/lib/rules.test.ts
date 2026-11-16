import { describe, expect, it, vi } from "vitest";
import {
  chunk,
  computeStats,
  displayMediaUrl,
  mediaPath,
  mergeById,
  olderThanCursor,
  parseServerStats,
  validateFramePrice,
  validateShippingVideo,
  validateTierGrid,
} from "./rules";

const key = "staging/dft_abc/11111111-2222-3333-4444-555555555555.jpg";
const encoded = encodeURIComponent(key);

describe("computeStats", () => {
  const orders = [
    { status: "pending", total: 57 },
    { status: "printing", total: 57 },
    { status: "shipped", total: 57 },
    { status: "delivered", total: 55 },
    { status: "paid", total: "57.00" },
    { status: "cancelled", total: 57 },
  ];

  it("compte comme « à faire » tout sauf payée et annulée, y compris livrée", () => {
    expect(computeStats(orders, []).todo).toBe(4);
  });

  it("sépare l'argent encaissé de l'argent à encaisser, sans compter les commandes en attente", () => {
    const s = computeStats(orders, []);
    expect(s.collected).toBe(57);
    expect(s.toCollect).toBe(112);
  });

  it("additionne les scans", () => {
    expect(computeStats([], [{ view_count: 3 }, { view_count: null }]).views).toBe(3);
  });
});

describe("displayMediaUrl", () => {
  const api = "https://www.memora.tn";

  it("remplace une origine localhost enregistrée par le serveur actuel", () => {
    expect(displayMediaUrl(`http://localhost:8080/api/media?key=${encoded}`, api)).toBe(
      `${api}/api/media?key=${encoded}`,
    );
  });

  it("accepte une adresse sans https:// et une adresse relative", () => {
    expect(displayMediaUrl(`memora.tn/api/media?key=${encoded}`, api)).toBe(`${api}/api/media?key=${encoded}`);
    expect(displayMediaUrl(mediaPath(key), `${api}/`)).toBe(`${api}/api/media?key=${encoded}`);
  });

  it("laisse les autres adresses intactes", () => {
    const supa = "https://x.supabase.co/storage/v1/object/public/photos/a.jpg";
    expect(displayMediaUrl(supa, api)).toBe(supa);
    expect(displayMediaUrl("data:image/png;base64,AAAA", api)).toBe("data:image/png;base64,AAAA");
    expect(displayMediaUrl(null, api)).toBeUndefined();
  });
});

describe("pagination helpers", () => {
  it("chunk découpe sans rien perdre", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("mergeById remplace par la ligne la plus récente et n'ajoute pas de doublon", () => {
    const merged = mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "b", v: 2 }, { id: "c", v: 1 }]);
    expect(merged).toEqual([{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 1 }]);
  });

  it("olderThanCursor départage les commandes de la même seconde par id", () => {
    expect(olderThanCursor({ created_at: "2026-11-13T10:00:00+00:00", id: "x1" })).toBe(
      'created_at.lt."2026-11-13T10:00:00+00:00",and(created_at.eq."2026-11-13T10:00:00+00:00",id.lt.x1)',
    );
  });

  it("parseServerStats accepte la réponse de admin_stats et refuse le reste", () => {
    expect(
      parseServerStats({ count: 3, todo: 2, collected: "90.50", to_collect: 10, views: 7, by_status: { pending: 2 } }),
    ).toEqual({ count: 3, todo: 2, collected: 90.5, toCollect: 10, views: 7, byStatus: { pending: 2 } });
    expect(parseServerStats(null)).toBeNull();
    expect(parseServerStats({ todo: 1 })).toBeNull();
  });
});

describe("validateTierGrid", () => {
  const grid = [
    { min_qty: 1, unit_price: 49 },
    { min_qty: 5, unit_price: 42 },
    { min_qty: 10, unit_price: 42 },
  ];

  it("accepte une grille dégressive (prix égaux permis) et un prix fixe à un seul palier", () => {
    expect(validateTierGrid(grid)).toBeNull();
    expect(validateTierGrid([{ min_qty: 1, unit_price: 89 }])).toBeNull();
  });

  it("accepte les paliers dans le désordre", () => {
    expect(validateTierGrid([...grid].reverse())).toBeNull();
  });

  it("refuse une grille vide ou sans palier à 1", () => {
    expect(validateTierGrid([])).toMatch(/au moins un palier/);
    expect(validateTierGrid([{ min_qty: 2, unit_price: 10 }])).toMatch(/commencer à 1/);
  });

  it("refuse deux paliers à la même quantité", () => {
    expect(validateTierGrid([...grid, { min_qty: 5, unit_price: 40 }])).toMatch(/Deux paliers commencent à 5/);
  });

  it("refuse un prix unitaire qui augmente avec la quantité", () => {
    expect(validateTierGrid([{ min_qty: 1, unit_price: 40 }, { min_qty: 5, unit_price: 42 }])).toMatch(
      /ne peut pas augmenter.*palier 5/,
    );
  });

  it("refuse les valeurs négatives, non numériques ou les quantités non entières", () => {
    expect(validateTierGrid([{ min_qty: 1, unit_price: -1 }])).toMatch(/Prix unitaire invalide/);
    expect(validateTierGrid([{ min_qty: 1, unit_price: NaN }])).toMatch(/Prix unitaire invalide/);
    expect(validateTierGrid([{ min_qty: 1, unit_price: 5 }, { min_qty: 2.5, unit_price: 4 }])).toMatch(/Quantité minimale/);
    expect(validateTierGrid([{ min_qty: 0, unit_price: 5 }])).toMatch(/Quantité minimale/);
  });
});

describe("validateFramePrice", () => {
  it("accepte zéro et un prix positif, refuse le reste", () => {
    expect(validateFramePrice(0)).toBeNull();
    expect(validateFramePrice(50)).toBeNull();
    expect(validateFramePrice(-5)).toMatch(/cadre invalide/);
    expect(validateFramePrice(NaN)).toMatch(/cadre invalide/);
  });
});

describe("validateShippingVideo", () => {
  const ok = {
    shipping_fee_aramex: 8,
    shipping_fee_mondial_relay: 6,
    free_shipping_threshold: 250,
    included_video_minutes: 8,
    surcharge_per_minute: 1.5,
  };

  it("accepte des valeurs positives ou nulles", () => {
    expect(validateShippingVideo(ok, 1800)).toBeNull();
    expect(validateShippingVideo({ ...ok, shipping_fee_aramex: 0, included_video_minutes: 0 }, 1800)).toBeNull();
  });

  it("refuse une valeur négative ou vide en nommant le champ", () => {
    expect(validateShippingVideo({ ...ok, shipping_fee_mondial_relay: -1 }, 1800)).toMatch(/Mondial Relay invalide/);
    expect(validateShippingVideo({ ...ok, surcharge_per_minute: NaN }, 1800)).toMatch(/Supplément par minute invalide/);
  });

  it("refuse plus de minutes incluses que la durée maximale d'une vidéo", () => {
    expect(validateShippingVideo({ ...ok, included_video_minutes: 31 }, 1800)).toMatch(/30 min au maximum/);
    expect(validateShippingVideo({ ...ok, included_video_minutes: 30 }, 1800)).toBeNull();
  });
});
