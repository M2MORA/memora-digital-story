import { describe, expect, it } from "vitest";
import { localize, orderableProduct, resolveProduct, type ProductRow } from "@/lib/products";

const row: ProductRow = {
  id: "p1",
  slug: "memora-simple-enveloppe",
  format: "10x15",
  sort_order: 0,
  badge: null,
  dimensions: "10 × 15 cm",
  occasions: [],
  style: "classic",
  included_video_min: 8,
  images: [],
  name: { fr: "MÉMORA, la photo", en: "MÉMORA, the photo" },
  tagline: { fr: "Une photo 10 × 15 qui ouvre votre vidéo.", en: "" },
  description: { fr: "Description" },
  materials: { fr: ["Enveloppe texturée"], ar: [] },
};

describe("catalogue copy", () => {
  it("uses the requested language when the copy exists", () => {
    expect(resolveProduct(row, "en").name).toBe("MÉMORA, the photo");
  });

  it("falls back to French for missing or empty EN/AR copy", () => {
    const ar = resolveProduct(row, "ar");
    expect(ar.name).toBe("MÉMORA, la photo");
    expect(ar.materials).toEqual(["Enveloppe texturée"]);
    expect(resolveProduct(row, "en").tagline).toBe("Une photo 10 × 15 qui ouvre votre vidéo.");
    expect(localize({ fr: "fr" }, "en")).toBe("fr");
  });

  it("keeps the product id the cart keys lines by", () => {
    expect(resolveProduct(row, "fr")).toMatchObject({ id: "p1", formatCode: "10x15" });
  });
});

describe("orderableProduct", () => {
  const shop = [{ slug: "memora-simple-enveloppe" }, { slug: "coffret" }];

  it("orders the article of the product page", () => {
    expect(orderableProduct(shop, "coffret")).toBe(shop[1]);
  });

  it("orders the first article of the shop when no article is given (today's flow)", () => {
    expect(orderableProduct(shop, undefined)).toBe(shop[0]);
  });

  it("orders nothing for an unknown or inactive article, nor when the shop is empty", () => {
    expect(orderableProduct(shop, "retire")).toBeUndefined();
    expect(orderableProduct(shop, "")).toBeUndefined();
    expect(orderableProduct([], undefined)).toBeUndefined();
  });
});
