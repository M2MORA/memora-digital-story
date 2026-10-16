import { describe, expect, it } from "vitest";
import {
  getUnitPrice,
  getVideoSurcharge,
  calculateQuote,
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
      expect(quote.shippingCost).toBeGreaterThan(0);
    });

    it("offers free shipping when subtotal (>= 250 TND)", () => {
      // 7 * 42 = 294 TND >= 250 TND
      const quote = calculateQuote([{ format: "10x15", quantity: 7 }]);
      expect(quote.isFreeShipping).toBe(true);
      expect(quote.shippingCost).toBe(0);
    });
  });
});
