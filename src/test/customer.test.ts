import { describe, expect, it } from "vitest";
import { isGovernorate, normalizeTunisianPhone, validateCustomer } from "@/lib/customer";
import { TUNISIAN_GOVERNORATES } from "@/lib/governorates";

const VALID = { name: "Amel Ben Ali", phone: "98 765 432", governorate: "Sfax", address: "Rue 12" };

describe("Règles client partagées (site + WhatsApp)", () => {
  it("accepte 8 chiffres, +216 et 00216 de la même façon", () => {
    for (const raw of [
      "98765432",
      "98 765 432",
      "+216 98 765 432",
      "+21698765432",
      "00216 98765432",
    ]) {
      expect(normalizeTunisianPhone(raw)).toBe("+216 98765432");
    }
  });

  it("refuse les numéros invalides", () => {
    for (const raw of [
      "",
      "12345",
      "987654321",
      "+33 6 12 34 56 78",
      "216 1234567",
      "0021698765",
    ]) {
      expect(normalizeTunisianPhone(raw)).toBeNull();
    }
  });

  it("n'accepte que les gouvernorats de la liste officielle", () => {
    expect(TUNISIAN_GOVERNORATES).toHaveLength(24);
    for (const g of TUNISIAN_GOVERNORATES) expect(isGovernorate(g)).toBe(true);
    expect(isGovernorate("")).toBe(false);
    expect(isGovernorate("Paris")).toBe(false);
    expect(isGovernorate("sfax")).toBe(false);
  });

  it("valide et nettoie un client complet", () => {
    expect(validateCustomer({ ...VALID, name: "  Amel  ", phone: "0021698765432" })).toEqual({
      ok: true,
      customer: { name: "Amel", phone: "+216 98765432", governorate: "Sfax", address: "Rue 12" },
    });
  });

  it("signale le premier champ invalide (nom ≥ 2, adresse ≥ 4)", () => {
    expect(validateCustomer({ ...VALID, name: "A" })).toEqual({ ok: false, field: "name" });
    expect(validateCustomer({ ...VALID, name: "Al" }).ok).toBe(true);
    expect(validateCustomer({ ...VALID, phone: "123" })).toEqual({ ok: false, field: "phone" });
    expect(validateCustomer({ ...VALID, governorate: "Paris" })).toEqual({
      ok: false,
      field: "governorate",
    });
    expect(validateCustomer({ ...VALID, address: "  ab  " })).toEqual({
      ok: false,
      field: "address",
    });
    expect(validateCustomer({ ...VALID, address: "Rue1" }).ok).toBe(true);
  });
});
