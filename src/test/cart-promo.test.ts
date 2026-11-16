import { describe, expect, it, vi } from "vitest";
import { cart } from "@/lib/cart";
import { TODAY_PRICING as P } from "./pricing-fixture";

// The cart only keeps a code the database (check_promo_code) gives a discount for.
describe("cart.applyPromoCode", () => {
  it("keeps an active code with its percent, upper-cased, and the quote shows the discount", async () => {
    cart.clear();
    cart.add("p1", { key: "k1", qty: 2, withFrame: false, videoDurationSec: 0 });
    const check = vi.fn().mockResolvedValue(10);
    expect(await cart.applyPromoCode(" memora10 ", check)).toEqual({ ok: true, percent: 10 });
    expect(check).toHaveBeenCalledWith("MEMORA10");
    expect(cart.getQuote(P).discount).toBe(9.8);
  });

  it("refuses an unknown or inactive code and keeps the cart as it was", async () => {
    expect(await cart.applyPromoCode("NOPE", vi.fn().mockResolvedValue(0))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(cart.getQuote(P).discount).toBe(9.8);
  });

  it("reports a failed check instead of silently giving no discount", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("network"));
    expect(await cart.applyPromoCode("VIP20", failing)).toEqual({ ok: false, reason: "error" });
    expect(cart.getQuote(P).discount).toBe(9.8);
  });

  it("forgets the code when the cart is cleared", () => {
    cart.clear();
    cart.add("p1", { key: "k2", qty: 2, withFrame: false, videoDurationSec: 0 });
    expect(cart.getQuote(P).discount).toBe(0);
  });
});
