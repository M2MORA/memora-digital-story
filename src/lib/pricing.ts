// MÉMORA Pricing Engine — pure, tested, shared logic based on plan.md specifications
import type { SupabaseClient } from "@supabase/supabase-js";

export type Format = "10x15" | "box" | "magnet" | "20x30" | "30x45";

/** A volume tier: from min_qty copies (cart total), each copy costs unit_price. */
export interface Tier {
  format: Format;
  min_qty: number;
  unit_price: number;
}

/**
 * The price grid, exactly as returned by the SQL get_pricing() (amounts in TND).
 * Every price lives in the database; nothing here is hardcoded.
 */
export interface Pricing {
  formats: { code: Format; frame_price: number; active: boolean }[];
  tiers: Tier[];
  settings: {
    shipping_fee_aramex: number;
    shipping_fee_mondial_relay: number;
    free_shipping_threshold: number;
    included_video_seconds: number;
    surcharge_per_minute: number;
    max_video_seconds: number;
  };
}

/** Reads the grid with get_pricing(). Throws on failure: a page must never show a price of 0. */
export async function fetchPricing(client: Pick<SupabaseClient, "rpc">): Promise<Pricing> {
  const { data, error } = await client.rpc("get_pricing");
  if (error || !data) throw new Error(`Tarifs indisponibles : ${error?.message ?? "réponse vide"}`);
  return data as Pricing;
}

/** The tiers of a format, smallest min_qty first. */
export function getTiers(pricing: Pricing, format: Format): Tier[] {
  return pricing.tiers.filter((t) => t.format === format).sort((a, b) => a.min_qty - b.min_qty);
}

/** Discount of a tier against the format's first tier, in whole percent (display only). */
export function getTierDiscountPercent(tiers: Tier[], tier: Tier): number {
  const base = tiers[0]?.unit_price ?? 0;
  return base > 0 ? Math.round(((base - tier.unit_price) / base) * 100) : 0;
}

/**
 * Unit price for a format at a total quantity: the highest tier whose min_qty is reached.
 * Same rule as the SQL Quote.
 */
export function getUnitPrice(pricing: Pricing, format: Format, totalQty: number): number {
  let matched: number | undefined;
  for (const tier of getTiers(pricing, format)) {
    if (totalQty >= tier.min_qty) matched = tier.unit_price;
  }
  if (matched === undefined) throw new Error(`Aucun tarif pour le format ${format}`);
  return matched;
}

/** Frame price per copy for a format (0 when the format has none). */
export function getFramePrice(pricing: Pricing, format: Format): number {
  return pricing.formats.find((f) => f.code === format)?.frame_price ?? 0;
}

/**
 * Video surcharge in TND: ceil((duration - included) / 60) * surcharge per minute * qty.
 */
export function getVideoSurcharge(pricing: Pricing, durationSec: number, qty: number = 1): number {
  const { included_video_seconds, surcharge_per_minute } = pricing.settings;
  if (durationSec <= included_video_seconds) {
    return 0;
  }
  const extraMinutes = Math.ceil((durationSec - included_video_seconds) / 60);
  return Number((extraMinutes * surcharge_per_minute * qty).toFixed(2));
}

// Mémora delivers within Tunisia only.
export const SHIPPING_MODES = ["aramex", "mondial_relay"] as const;
export type ShippingMode = (typeof SHIPPING_MODES)[number];

export interface ShippingOption {
  id: ShippingMode;
  name: string;
  description: string;
  priceTND: number;
  etaDays: string;
}

/**
 * Shipping options for a subtotal (after discount): free from the free-shipping threshold.
 */
export function getShippingOptions(pricing: Pricing, subtotalTND: number): ShippingOption[] {
  const { free_shipping_threshold, shipping_fee_aramex, shipping_fee_mondial_relay } =
    pricing.settings;
  const isFree = subtotalTND >= free_shipping_threshold;
  return [
    {
      id: "aramex",
      name: "Aramex Express Tunisie",
      description: "Livraison à domicile partout en Tunisie",
      priceTND: isFree ? 0 : shipping_fee_aramex,
      etaDays: "2 à 3 jours",
    },
    {
      id: "mondial_relay",
      name: "Rapid-Poste Tunisie",
      description: "Retrait en bureau de poste le plus proche",
      priceTND: isFree ? 0 : shipping_fee_mondial_relay,
      etaDays: "3 à 4 jours",
    },
  ];
}

// Promo codes: percent off the subtotal (items + frames + video). Codes are matched trimmed and upper-cased.
export const PROMO_CODES: Record<string, number> = {
  MEMORA10: 10,
  BIENVENUE: 10,
  VIP20: 20,
};

/** Discount percent for a promo code, or 0 when the code is empty or unknown. */
export function getPromoDiscountPercent(code: string | null | undefined): number {
  return PROMO_CODES[(code ?? "").trim().toUpperCase()] ?? 0;
}

export interface QuoteLine {
  format: Format;
  quantity: number;
  withFrame?: boolean | undefined;
  videoDurationSec?: number | undefined;
}

export interface QuoteResult {
  itemsSubtotal: number;
  framesSubtotal: number;
  videoSurcharges: number;
  subtotal: number; // items + frames + video, before discount
  discount: number;
  shippingFee: number;
  total: number; // subtotal - discount + shippingFee
  totalQuantity: number;
  isFreeShipping: boolean;
}

/**
 * The storefront Quote: cart lines, the pricing (get_pricing()), an optional promo code and a
 * shipping mode in; totals out. Same inputs/outputs as the SQL calculate_order_quote(p_items, p_promo_code, p_shipping_carrier).
 */
export function calculateQuote(
  lines: QuoteLine[],
  pricing: Pricing,
  promoCode?: string | null,
  shipping: ShippingMode = "aramex",
): QuoteResult {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  let itemsSubtotal = 0;
  let framesSubtotal = 0;
  let videoSurcharges = 0;

  for (const line of lines) {
    itemsSubtotal += getUnitPrice(pricing, line.format, totalQuantity) * line.quantity;

    if (line.withFrame) {
      framesSubtotal += getFramePrice(pricing, line.format) * line.quantity;
    }

    if (line.videoDurationSec) {
      videoSurcharges += getVideoSurcharge(pricing, line.videoDurationSec, line.quantity);
    }
  }

  const subtotal = Number((itemsSubtotal + framesSubtotal + videoSurcharges).toFixed(2));
  const discount = Number(((subtotal * getPromoDiscountPercent(promoCode)) / 100).toFixed(2));
  const discountedSubtotal = subtotal - discount;

  const shippingFee =
    getShippingOptions(pricing, discountedSubtotal).find((opt) => opt.id === shipping)?.priceTND ??
    0;

  return {
    itemsSubtotal: Number(itemsSubtotal.toFixed(2)),
    framesSubtotal: Number(framesSubtotal.toFixed(2)),
    videoSurcharges: Number(videoSurcharges.toFixed(2)),
    subtotal,
    discount,
    shippingFee,
    total: Number((discountedSubtotal + shippingFee).toFixed(2)),
    totalQuantity,
    isFreeShipping: discountedSubtotal >= pricing.settings.free_shipping_threshold,
  };
}

export function formatTND(amount: number): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
  return `${value} DT`;
}
