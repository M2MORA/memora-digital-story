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

export type PromoCode = { code: string; percent: number; active: boolean };

/** Code promo tel que la base le stocke : sans espaces, en majuscules. */
export const normalizePromoCode = (code: string) => code.trim().toUpperCase();

/** Pourcentage de réduction : de 0 à 100. */
export function validatePromoPercent(percent: number): string | null {
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? null
    : "Réduction invalide : un pourcentage entre 0 et 100.";
}

/**
 * Nouveau code promo (même format que la contrainte de la base) : 3 à 32 lettres, chiffres, - ou _,
 * pas déjà utilisé (actif ou non : un code désactivé garde son nom).
 */
export function validateNewPromoCode(code: string, percent: number, existing: string[]): string | null {
  const clean = normalizePromoCode(code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(clean))
    return "Code invalide : 3 à 32 caractères, lettres sans accent, chiffres, - ou _.";
  if (existing.includes(clean)) return `Le code ${clean} existe déjà.`;
  return validatePromoPercent(percent);
}

/** Texte d'un article dans les trois langues du site : `fr` toujours là, `en` et `ar` facultatifs. */
export type Localized<T> = { fr: T; en?: T; ar?: T };

/** Article tel que l'admin le lit et l'écrit (table products). */
export type Article = {
  id: string;
  slug: string;
  format: string;
  active: boolean;
  sort_order: number;
  badge: string | null;
  dimensions: string;
  occasions: string[];
  style: string;
  included_video_min: number;
  images: string[];
  name: Localized<string>;
  tagline: Localized<string>;
  description: Localized<string>;
  materials: Localized<string[]>;
};

/** Même format que la contrainte de la base : minuscules, chiffres, mots séparés par un tiret. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Texte prêt à enregistrer : espaces retirés, langue facultative vide → clé absente
 * (la boutique affiche alors le français).
 */
export function compactCopy<T extends string | string[]>(copy: Localized<T>): Localized<T> {
  const clean = (v: T | undefined) =>
    (Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : String(v ?? "").trim()) as T;
  const out: Localized<T> = { fr: clean(copy.fr) };
  for (const lang of ["en", "ar"] as const) {
    const v = clean(copy[lang]);
    if (v.length > 0) out[lang] = v;
  }
  return out;
}

type ArticleText = Pick<Article, "slug" | "badge" | "dimensions" | "name" | "tagline" | "description" | "materials">;

/** Article prêt à enregistrer : espaces retirés, badge vide → aucun, langues facultatives vides retirées. */
export function cleanArticle<T extends ArticleText>(a: T): T {
  return {
    ...a,
    slug: a.slug.trim(),
    badge: a.badge?.trim() || null,
    dimensions: a.dimensions.trim(),
    name: compactCopy(a.name),
    tagline: compactCopy(a.tagline),
    description: compactCopy(a.description),
    materials: compactCopy(a.materials),
  };
}

/**
 * Article vérifié avant l'envoi : slug valide et libre (parmi les autres articles, actifs ou non),
 * format existant, texte français complet, minutes de vidéo et ordre entiers.
 */
export function validateArticle(
  a: Pick<Article, "id" | "slug" | "format" | "sort_order" | "included_video_min" | "name" | "tagline" | "description" | "materials">,
  others: Pick<Article, "id" | "slug">[],
  formats: string[],
): string | null {
  if (!SLUG_PATTERN.test(a.slug))
    return "Slug invalide : minuscules sans accent et chiffres, mots séparés par un tiret (ex. photo-cadre).";
  if (others.some((o) => o.id !== a.id && o.slug === a.slug)) return `Le slug ${a.slug} est déjà utilisé.`;
  if (!formats.includes(a.format)) return `Format inconnu : ${a.format}.`;
  if (!a.name.fr.trim()) return "Le nom en français est obligatoire.";
  if (!a.tagline.fr.trim()) return "L'accroche en français est obligatoire.";
  if (!a.description.fr.trim()) return "La description en français est obligatoire.";
  if (!a.materials.fr.some((m) => m.trim())) return "Le contenu en français est obligatoire (au moins une ligne).";
  if (!Number.isInteger(a.included_video_min) || a.included_video_min < 0)
    return "Minutes de vidéo incluses invalides : un nombre entier positif ou nul.";
  if (!Number.isInteger(a.sort_order)) return "Ordre d'affichage invalide : un nombre entier.";
  return null;
}

/** Photos de la galerie : mêmes limites que le bucket catalogue (migration catalogue_bucket). */
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Photo acceptée avant l'envoi : JPEG, PNG ou WebP, 5 Mo au plus. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES[file.type]) return "Format de photo refusé : JPEG, PNG ou WebP seulement.";
  if (file.size > MAX_IMAGE_BYTES) return "Photo trop lourde : 5 Mo au maximum.";
  return null;
}

/** Copie de la liste où l'élément `i` a bougé de `by` places ; inchangée si on sort de la liste. */
export function moveItem<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}
