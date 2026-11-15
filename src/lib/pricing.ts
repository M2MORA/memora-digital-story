// MÉMORA Pricing Engine — pure, tested, shared logic based on plan.md specifications

export type Format = "10x15" | "box" | "magnet" | "20x30" | "30x45";

export interface Tier {
  minQty: number;
  unitPriceTND: number; // in Tunisian Dinars (TND)
  discountPercent: number;
}

// Volume pricing tiers according to section 1.2 of plan.md
export const TIERS_10X15: Tier[] = [
  { minQty: 1, unitPriceTND: 49, discountPercent: 0 },
  { minQty: 5, unitPriceTND: 42, discountPercent: 14 },
  { minQty: 10, unitPriceTND: 32, discountPercent: 35 },
  { minQty: 50, unitPriceTND: 25, discountPercent: 49 },
  { minQty: 100, unitPriceTND: 20, discountPercent: 59 },
];

export const TIERS_BOX: Tier[] = [
  { minQty: 1, unitPriceTND: 89, discountPercent: 0 },
  { minQty: 5, unitPriceTND: 79, discountPercent: 11 },
  { minQty: 10, unitPriceTND: 69, discountPercent: 22 },
  { minQty: 50, unitPriceTND: 59, discountPercent: 34 },
  { minQty: 100, unitPriceTND: 49, discountPercent: 45 },
];

export const TIERS_MAGNET: Tier[] = [
  { minQty: 1, unitPriceTND: 65, discountPercent: 0 },
  { minQty: 5, unitPriceTND: 57, discountPercent: 12 },
  { minQty: 10, unitPriceTND: 44, discountPercent: 32 },
  { minQty: 50, unitPriceTND: 34, discountPercent: 48 },
  { minQty: 100, unitPriceTND: 27, discountPercent: 58 },
];

export const TIERS_20X30: Tier[] = [
  { minQty: 1, unitPriceTND: 129, discountPercent: 0 },
  { minQty: 5, unitPriceTND: 115, discountPercent: 11 },
  { minQty: 10, unitPriceTND: 98, discountPercent: 24 },
  { minQty: 50, unitPriceTND: 82, discountPercent: 36 },
];

export const TIERS_30X45: Tier[] = [
  { minQty: 1, unitPriceTND: 199, discountPercent: 0 },
  { minQty: 5, unitPriceTND: 175, discountPercent: 12 },
  { minQty: 10, unitPriceTND: 150, discountPercent: 25 },
  { minQty: 50, unitPriceTND: 130, discountPercent: 35 },
];

export const TIERS: Record<Format, Tier[]> = {
  "10x15": TIERS_10X15,
  box: TIERS_BOX,
  magnet: TIERS_MAGNET,
  "20x30": TIERS_20X30,
  "30x45": TIERS_30X45,
};

// Video duration specifications
export const INCLUDED_VIDEO_SECONDS = 480; // 8 minutes included
export const SURCHARGE_TND_PER_MIN = 1.5; // 1,5 DT per minute
export const MAX_VIDEO_SECONDS = 1800; // 30 minutes max

// Free shipping threshold
export const FREE_SHIPPING_THRESHOLD_TND = 250;

// Frame options surcharge
export const FRAME_PRICES: Record<Format, number> = {
  "10x15": 50,
  box: 0,
  magnet: 0, // Magnet is unframed
  "20x30": 120,
  "30x45": 150,
};

/**
 * Returns the unit price for a given format and total quantity ordered.
 */
export function getUnitPrice(format: Format, totalQty: number): number {
  const formatTiers = TIERS[format] ?? TIERS_10X15;
  let matched = formatTiers[0]?.unitPriceTND ?? 49;
  for (const tier of formatTiers) {
    if (totalQty >= tier.minQty) {
      matched = tier.unitPriceTND;
    }
  }
  return matched;
}

/**
 * Returns the tier details for a format and quantity.
 */
export function getTierForQty(format: Format, qty: number): Tier {
  const formatTiers = TIERS[format] ?? TIERS_10X15;
  let matched: Tier = formatTiers[0] ?? TIERS_10X15[0]!;
  for (const tier of formatTiers) {
    if (qty >= tier.minQty) {
      matched = tier;
    }
  }
  return matched;
}

/**
 * Calculates the video surcharge in TND.
 * Formula: ceil((duration - 480)/60) * 1.50 TND * qty
 */
export function getVideoSurcharge(durationSec: number, qty: number = 1): number {
  if (durationSec <= INCLUDED_VIDEO_SECONDS) {
    return 0;
  }
  const extraSeconds = durationSec - INCLUDED_VIDEO_SECONDS;
  const extraMinutes = Math.ceil(extraSeconds / 60);
  return Number((extraMinutes * SURCHARGE_TND_PER_MIN * qty).toFixed(2));
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
 * Shipping options for a subtotal (after discount): free from FREE_SHIPPING_THRESHOLD_TND.
 */
export function getShippingOptions(subtotalTND: number): ShippingOption[] {
  const isFree = subtotalTND >= FREE_SHIPPING_THRESHOLD_TND;
  return [
    {
      id: "aramex",
      name: "Aramex Express Tunisie",
      description: "Livraison à domicile partout en Tunisie",
      priceTND: isFree ? 0 : 8,
      etaDays: "2 à 3 jours",
    },
    {
      id: "mondial_relay",
      name: "Rapid-Poste Tunisie",
      description: "Retrait en bureau de poste le plus proche",
      priceTND: isFree ? 0 : 6,
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
 * The storefront Quote: cart lines, an optional promo code and a shipping mode in; totals out.
 * Same inputs/outputs as the SQL calculate_order_quote(p_items, p_promo_code, p_shipping_carrier).
 */
export function calculateQuote(
  lines: QuoteLine[],
  promoCode?: string | null,
  shipping: ShippingMode = "aramex",
): QuoteResult {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  let itemsSubtotal = 0;
  let framesSubtotal = 0;
  let videoSurcharges = 0;

  for (const line of lines) {
    itemsSubtotal += getUnitPrice(line.format, totalQuantity) * line.quantity;

    if (line.withFrame) {
      framesSubtotal += (FRAME_PRICES[line.format] || 0) * line.quantity;
    }

    if (line.videoDurationSec && line.videoDurationSec > INCLUDED_VIDEO_SECONDS) {
      videoSurcharges += getVideoSurcharge(line.videoDurationSec, line.quantity);
    }
  }

  const subtotal = Number((itemsSubtotal + framesSubtotal + videoSurcharges).toFixed(2));
  const discount = Number(((subtotal * getPromoDiscountPercent(promoCode)) / 100).toFixed(2));
  const discountedSubtotal = subtotal - discount;

  const shippingFee =
    getShippingOptions(discountedSubtotal).find((opt) => opt.id === shipping)?.priceTND ?? 0;

  return {
    itemsSubtotal: Number(itemsSubtotal.toFixed(2)),
    framesSubtotal: Number(framesSubtotal.toFixed(2)),
    videoSurcharges: Number(videoSurcharges.toFixed(2)),
    subtotal,
    discount,
    shippingFee,
    total: Number((discountedSubtotal + shippingFee).toFixed(2)),
    totalQuantity,
    isFreeShipping: discountedSubtotal >= FREE_SHIPPING_THRESHOLD_TND,
  };
}

export function formatTND(amount: number): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
  return `${value} DT`;
}
