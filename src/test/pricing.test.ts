import { describe, expect, it } from "vitest";
import {
  getUnitPrice,
  getVideoSurcharge,
  calculateQuote,
  getPromoDiscountPercent,
  PROMO_CODES,
  FREE_SHIPPING_THRESHOLD_TND,
  INCLUDED_VIDEO_SECONDS,
} from "@/lib/pricing";

describe("Pricing Engine (plan.md section 10 specification)", () => {
  describe("Volume Pricing Tiers boundaries for 10x15", () => {
    it("applies tier 1 (1-4 items) at 49 TND", () => {
      expect(getUnitPrice("10x15", 1)).toBe(49);
      expect(getUnitPrice("10x15", 4)).toBe(49);
    });

    it("applies tier 2 (5-9 items) at 42 TND (-14%)", () => {
      expect(getUnitPrice("10x15", 5)).toBe(42);
      expect(getUnitPrice("10x15", 9)).toBe(42);
    });

    it("applies tier 3 (10-49 items) at 32 TND (-35%)", () => {
      expect(getUnitPrice("10x15", 10)).toBe(32);
      expect(getUnitPrice("10x15", 49)).toBe(32);
    });

    it("applies tier 4 (50-99 items) at 25 TND (-49%)", () => {
      expect(getUnitPrice("10x15", 50)).toBe(25);
      expect(getUnitPrice("10x15", 99)).toBe(25);
    });

    it("applies tier 5 (100+ items) at 20 TND (-59%)", () => {
      expect(getUnitPrice("10x15", 100)).toBe(20);
      expect(getUnitPrice("10x15", 250)).toBe(20);
    });
  });

  describe("Volume Pricing Tiers boundaries for Magnet", () => {
    it("applies tier 1 (1-4) at 65 TND", () => {
      expect(getUnitPrice("magnet", 1)).toBe(65);
      expect(getUnitPrice("magnet", 4)).toBe(65);
    });

    it("applies tier 2 (5-9) at 57 TND", () => {
      expect(getUnitPrice("magnet", 5)).toBe(57);
    });

    it("applies tier 3 (10-49) at 44 TND", () => {
      expect(getUnitPrice("magnet", 10)).toBe(44);
    });

    it("applies tier 4 (50-99) at 34 TND", () => {
      expect(getUnitPrice("magnet", 50)).toBe(34);
    });

    it("applies tier 5 (100+) at 27 TND", () => {
      expect(getUnitPrice("magnet", 100)).toBe(27);
    });
  });

  describe("Volume Pricing Tiers boundaries for Box (Coffret)", () => {
    it("applies tier 1 (1-4) at 89 TND", () => {
      expect(getUnitPrice("box", 1)).toBe(89);
      expect(getUnitPrice("box", 4)).toBe(89);
    });

    it("applies tier 2 (5-9) at 79 TND", () => {
      expect(getUnitPrice("box", 5)).toBe(79);
    });

    it("applies tier 3 (10-49) at 69 TND", () => {
      expect(getUnitPrice("box", 10)).toBe(69);
    });

    it("applies tier 4 (50-99) at 59 TND", () => {
      expect(getUnitPrice("box", 50)).toBe(59);
    });

    it("applies tier 5 (100+) at 49 TND", () => {
      expect(getUnitPrice("box", 100)).toBe(49);
    });
  });

  describe("Video Surcharge boundaries (8 min included = 480 s, 1.50 TND/min)", () => {
    it("is 0 for videos <= 480 seconds (8 min)", () => {
      expect(getVideoSurcharge(0)).toBe(0);
      expect(getVideoSurcharge(120)).toBe(0);
      expect(getVideoSurcharge(480)).toBe(0);
    });

    it("charges 1.50 TND for 481 seconds (1 extra minute rounded up)", () => {
      expect(getVideoSurcharge(481, 1)).toBe(1.5);
    });

    it("charges 1.50 TND for 540 seconds (up to 9 min)", () => {
      expect(getVideoSurcharge(540, 1)).toBe(1.5);
    });

    it("charges 3.00 TND for 541 seconds (2 extra minutes)", () => {
      expect(getVideoSurcharge(541, 1)).toBe(3);
    });

    it("multiplies surcharge by quantity", () => {
      expect(getVideoSurcharge(540, 3)).toBe(4.5);
    });
  });

  describe("Quote & Free shipping threshold", () => {
    it("charges shipping when subtotal < 250 TND", () => {
      const quote = calculateQuote([{ format: "10x15", quantity: 2 }]);
      expect(quote.isFreeShipping).toBe(false);
      expect(quote.shippingFee).toBeGreaterThan(0);
    });

    it("offers free shipping when subtotal (>= 250 TND)", () => {
      // 7 * 42 = 294 TND >= 250 TND
      const quote = calculateQuote([{ format: "10x15", quantity: 7 }]);
      expect(quote.isFreeShipping).toBe(true);
      expect(quote.shippingFee).toBe(0);
    });
  });

  describe("Volume Pricing Tiers for 20x30 and 30x45", () => {
    it.each([
      [1, 129, 199],
      [4, 129, 199],
      [5, 115, 175],
      [10, 98, 150],
      [50, 82, 130],
      [500, 82, 130],
    ])("qty %i → 20x30 %i TND, 30x45 %i TND", (qty, p2030, p3045) => {
      expect(getUnitPrice("20x30", qty)).toBe(p2030);
      expect(getUnitPrice("30x45", qty)).toBe(p3045);
    });
  });

  // Pinned totals: these are the amounts the storefront displays today; they must not move.
  describe("Quote totals (subtotal, discount, shipping fee, total)", () => {
    const totals = (q: ReturnType<typeof calculateQuote>) => [q.subtotal, q.discount, q.shippingFee, q.total];

    it("one line per format, unframed, aramex", () => {
      expect(totals(calculateQuote([{ format: "10x15", quantity: 2 }]))).toEqual([98, 0, 8, 106]);
      expect(totals(calculateQuote([{ format: "box", quantity: 1 }]))).toEqual([89, 0, 8, 97]);
      expect(totals(calculateQuote([{ format: "magnet", quantity: 1 }]))).toEqual([65, 0, 8, 73]);
      expect(totals(calculateQuote([{ format: "20x30", quantity: 1 }]))).toEqual([129, 0, 8, 137]);
      expect(totals(calculateQuote([{ format: "30x45", quantity: 1 }]))).toEqual([199, 0, 8, 207]);
    });

    it("adds the frame price per copy (box and magnet have no frame price)", () => {
      const framed = (format: "10x15" | "box" | "magnet" | "20x30" | "30x45", quantity = 1) =>
        calculateQuote([{ format, quantity, withFrame: true }]);
      expect(framed("10x15", 2).framesSubtotal).toBe(100);
      expect(totals(framed("10x15", 2))).toEqual([198, 0, 8, 206]);
      expect(framed("box").framesSubtotal).toBe(0);
      expect(framed("magnet").framesSubtotal).toBe(0);
      expect(totals(framed("20x30"))).toEqual([249, 0, 8, 257]);
      expect(totals(framed("30x45"))).toEqual([349, 0, 0, 349]);
    });

    it("prices every line at the tier of the total quantity", () => {
      const q = calculateQuote([
        { format: "10x15", quantity: 3 },
        { format: "magnet", quantity: 2 },
      ]);
      expect(q.totalQuantity).toBe(5);
      expect(totals(q)).toEqual([240, 0, 8, 248]);
    });

    it("adds the video surcharge per copy", () => {
      const q = calculateQuote([{ format: "10x15", quantity: 2, videoDurationSec: 600 }]);
      expect(q.videoSurcharges).toBe(6);
      expect(totals(q)).toEqual([104, 0, 8, 112]);
      expect(calculateQuote([{ format: "10x15", quantity: 1, videoDurationSec: INCLUDED_VIDEO_SECONDS }]).videoSurcharges).toBe(0);
    });

    it("charges the selected shipping mode", () => {
      expect(totals(calculateQuote([{ format: "10x15", quantity: 2 }], null, "aramex"))).toEqual([98, 0, 8, 106]);
      expect(totals(calculateQuote([{ format: "10x15", quantity: 2 }], null, "mondial_relay"))).toEqual([98, 0, 6, 104]);
    });

    it("applies each promo code, case- and space-insensitive", () => {
      const two = [{ format: "10x15" as const, quantity: 2 }];
      expect(totals(calculateQuote(two, "MEMORA10"))).toEqual([98, 9.8, 8, 96.2]);
      expect(totals(calculateQuote(two, " bienvenue "))).toEqual([98, 9.8, 8, 96.2]);
      expect(totals(calculateQuote(two, "VIP20"))).toEqual([98, 19.6, 8, 86.4]);
      expect(totals(calculateQuote(two, "NOPE"))).toEqual([98, 0, 8, 106]);
      expect(totals(calculateQuote(two, ""))).toEqual([98, 0, 8, 106]);
    });

    it("lists exactly the known promo codes", () => {
      expect(PROMO_CODES).toEqual({ MEMORA10: 10, BIENVENUE: 10, VIP20: 20 });
      expect(getPromoDiscountPercent("vip20")).toBe(20);
      expect(getPromoDiscountPercent(undefined)).toBe(0);
    });

    it("decides free shipping on the subtotal after discount", () => {
      const six = [{ format: "10x15" as const, quantity: 6 }];
      expect(FREE_SHIPPING_THRESHOLD_TND).toBe(250);
      expect(totals(calculateQuote(six))).toEqual([252, 0, 0, 252]);
      expect(totals(calculateQuote(six, null, "mondial_relay"))).toEqual([252, 0, 0, 252]);
      // 252 - 50,40 = 201,60 < 250 → shipping is charged again
      const q = calculateQuote(six, "VIP20");
      expect(totals(q)).toEqual([252, 50.4, 8, 209.6]);
      expect(q.isFreeShipping).toBe(false);
    });
  });
});
