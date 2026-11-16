import { describe, expect, it } from "vitest";
import { fr } from "@/i18n/fr";
import { en } from "@/i18n/en";
import { ar } from "@/i18n/ar";
import type { Pricing } from "@/lib/pricing";
import { TODAY_PRICING, withPricing } from "./pricing-fixture";

// Flat pricing: 10x15 has a single tier.
const FLAT = withPricing((p) => {
  p.tiers = p.tiers.filter((t) => t.format !== "10x15" || t.min_qty === 1);
});

/** Every price-quoting entry of a dictionary, rendered as one string. */
function priceCopy(d: typeof fr, p: Pricing): string {
  return JSON.stringify([
    d.faq.groups(p),
    d.home.finalLead(p),
    d.how.orderSteps(p),
    d.productPage.videoSpec(p),
    d.productPage.deliverySpec(p),
    d.cart.freeFrom(p),
    d.legal.shipping.sections(p),
  ]);
}

describe("price copy", () => {
  for (const [lang, d] of Object.entries({ fr, en, ar })) {
    it(`${lang}: flat pricing prints no undefined/NaN and drops the volume sentence`, () => {
      const copy = priceCopy(d, FLAT);
      expect(copy).not.toMatch(/undefined|NaN/);
      expect(copy).not.toMatch(/dès 5 exemplaires|from 5 copies|من 5 نسخ/);
    });
  }

  it("keeps the volume sentence when a second tier exists", () => {
    expect(priceCopy(fr, TODAY_PRICING)).toContain("Moins cher dès 5 exemplaires.");
    expect(priceCopy(en, TODAY_PRICING)).toContain("Cheaper from 5 copies.");
    expect(priceCopy(ar, TODAY_PRICING)).toContain("يرخص من 5 نسخ.");
  });
});
