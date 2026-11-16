/**
 * Règles métier de l'admin, sans dépendance au navigateur ni à Supabase,
 * pour pouvoir les tester (voir rules.test.ts).
 */

import { CUSTOMER_SERVICE_WINDOW_MS } from "../../../src/server/whatsapp/window";

type StatOrder = { status: string; total: number | string };
type StatMemory = { view_count: number | null };

/**
 * « À faire » = toute commande qui n'est ni encaissée (Payée) ni annulée :
 * une commande livrée attend encore l'argent.
 * « Encaissé » = argent reçu (Payée). « À encaisser » = expédié ou livré, pas encore payé.
 * Les commandes en attente ne comptent pas comme chiffre : elles ne sont pas confirmées.
 */
export function computeStats(orders: StatOrder[], memories: StatMemory[]) {
  const sum = (list: StatOrder[]) => list.reduce((s, o) => s + Number(o.total || 0), 0);
  return {
    count: orders.length,
    todo: orders.filter((o) => o.status !== "paid" && o.status !== "cancelled").length,
    collected: sum(orders.filter((o) => o.status === "paid")),
    toCollect: sum(orders.filter((o) => o.status === "shipped" || o.status === "delivered")),
    views: memories.reduce((s, m) => s + (m.view_count ?? 0), 0),
  };
}

/** Adresse relative d'un média client : valable quel que soit l'appareil ou le serveur. */
export const mediaPath = (storageKey: string) => `/api/media?key=${encodeURIComponent(storageKey)}`;

/**
 * Média reçu sur WhatsApp et rattaché à un article (items[i].media, écrit par Ballech) :
 * clé R2 de la dernière photo ou vidéo reçue.
 */
export function whatsappMediaKey(item: Record<string, unknown>, kind: "photo" | "video"): string | undefined {
  const media = item["media"];
  if (!Array.isArray(media)) return undefined;
  const matches = media.filter(
    (m): m is { kind: string; storage_key: string } =>
      !!m && typeof m === "object" && (m as { kind?: unknown }).kind === kind &&
      typeof (m as { storage_key?: unknown }).storage_key === "string",
  );
  return matches[matches.length - 1]?.storage_key;
}

/** Plus de 24 h depuis le dernier message du client : WhatsApp refuse une réponse libre. */
export function whatsappWindowClosed(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return true;
  return now - new Date(lastInboundAt).getTime() > CUSTOMER_SERVICE_WINDOW_MS;
}

/**
 * Un souvenir peut contenir une adresse complète enregistrée depuis un autre poste
 * (ex. une ancienne adresse de test, ou memora.tn/api/media?… sans https).
 * Pour l'affichage, on garde seulement la clé et on la sert depuis le serveur actuel.
 * Toute autre adresse (data:, stockage public Supabase…) est rendue telle quelle.
 */
export function displayMediaUrl(stored: string | null | undefined, apiBase: string): string | undefined {
  if (!stored) return undefined;
  if (stored.startsWith("data:") || stored.startsWith("blob:")) return stored;

  const withScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) || stored.startsWith("/") ? stored : `https://${stored}`;
  let url: URL;
  try {
    url = new URL(withScheme, "https://placeholder.invalid");
  } catch {
    return stored;
  }
  const key = url.searchParams.get("key");
  if (url.pathname !== "/api/media" || !key) return stored;
  return `${apiBase.replace(/\/+$/, "")}${mediaPath(key)}`;
}

/** Taille d'une page de commandes : l'admin n'a jamais besoin de tout télécharger d'un coup. */
export const ORDERS_PAGE_SIZE = 150;
/** Lot de lignes par requête : PostgREST coupe en silence au-delà de 1 000 lignes. */
export const FETCH_BATCH = 1000;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Ajoute les lignes nouvelles à la liste, sans doublon (la ligne la plus récente gagne). */
export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()];
}

/** Filtre PostgREST « plus ancien que ce curseur » pour un tri (created_at, id) décroissant. */
export function olderThanCursor(cursor: { created_at: string; id: string }): string {
  const at = `"${cursor.created_at}"`;
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`;
}

type StatsRpc = {
  count?: number;
  by_status?: Record<string, number>;
  todo?: number;
  collected?: number | string;
  to_collect?: number | string;
  views?: number | string;
};

/** Chiffres exacts calculés par la base (fonction admin_stats) ; null si la réponse est inutilisable. */
export function parseServerStats(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as StatsRpc;
  if (typeof r.count !== "number" || typeof r.todo !== "number") return null;
  return {
    count: r.count,
    todo: r.todo,
    collected: Number(r.collected ?? 0),
    toCollect: Number(r.to_collect ?? 0),
    views: Number(r.views ?? 0),
    byStatus: r.by_status ?? {},
  };
}

export type PriceTier = { min_qty: number; unit_price: number };

const isPrice = (n: number) => Number.isFinite(n) && n >= 0;

/**
 * Grille de prix d'un format, vérifiée avant l'envoi. La base reste le vrai garde-fou
 * (palier à 1 obligatoire, unicité, valeurs positives) ; ici on donne un message clair.
 * Un seul palier (prix fixe) est accepté.
 */
export function validateTierGrid(tiers: PriceTier[]): string | null {
  if (tiers.length === 0) return "Il faut au moins un palier.";
  for (const t of tiers) {
    if (!Number.isInteger(t.min_qty) || t.min_qty < 1) return "Quantité minimale invalide : un nombre entier à partir de 1.";
    if (!isPrice(t.unit_price)) return `Prix unitaire invalide (palier ${t.min_qty}) : un nombre positif ou nul.`;
  }
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.min_qty === prev.min_qty) return `Deux paliers commencent à ${cur.min_qty} exemplaires.`;
    if (cur.unit_price > prev.unit_price)
      return `Le prix unitaire ne peut pas augmenter avec la quantité (palier ${cur.min_qty} : ${cur.unit_price} > ${prev.unit_price}).`;
  }
  if (sorted[0]!.min_qty !== 1) return "Le premier palier doit commencer à 1 exemplaire.";
  return null;
}

/** Prix d'un cadre : positif ou nul. */
export function validateFramePrice(price: number): string | null {
  return isPrice(price) ? null : "Prix du cadre invalide : un nombre positif ou nul.";
}

export type ShippingVideoSettings = {
  shipping_fee_aramex: number;
  shipping_fee_mondial_relay: number;
  free_shipping_threshold: number;
  included_video_minutes: number;
  surcharge_per_minute: number;
};

/** Livraison et vidéo. Les minutes incluses ne peuvent pas dépasser la durée maximale d'une vidéo. */
export function validateShippingVideo(s: ShippingVideoSettings, maxVideoSeconds: number): string | null {
  const labels: [keyof ShippingVideoSettings, string][] = [
    ["shipping_fee_aramex", "Frais Aramex"],
    ["shipping_fee_mondial_relay", "Frais Mondial Relay"],
    ["free_shipping_threshold", "Seuil de livraison gratuite"],
    ["included_video_minutes", "Minutes de vidéo incluses"],
    ["surcharge_per_minute", "Supplément par minute"],
  ];
  for (const [key, label] of labels) {
    if (!isPrice(s[key])) return `${label} invalide : un nombre positif ou nul.`;
  }
  if (Math.round(s.included_video_minutes * 60) > maxVideoSeconds)
    return `Minutes de vidéo incluses : ${maxVideoSeconds / 60} min au maximum (durée maximale d'une vidéo).`;
  return null;
}
