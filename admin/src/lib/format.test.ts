import { describe, expect, it } from "vitest";
import { TRANSITIONS, nextStatus, refusalMessage } from "./format";

describe("graphe des statuts (copie de set_order_status en SQL)", () => {
  it("correspond exactement au graphe décidé", () => {
    expect(TRANSITIONS).toEqual({
      pending: ["printing", "cancelled"],
      printing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: ["paid"],
      paid: [],
      cancelled: [],
    });
  });

  it("propose l'étape suivante du parcours normal, jamais l'annulation", () => {
    expect(nextStatus("pending")).toBe("printing");
    expect(nextStatus("printing")).toBe("shipped");
    expect(nextStatus("shipped")).toBe("delivered");
    expect(nextStatus("delivered")).toBe("paid");
    expect(nextStatus("paid")).toBeNull();
    expect(nextStatus("cancelled")).toBeNull();
  });

  it("explique un refus en français", () => {
    expect(refusalMessage("transition_not_allowed", "shipped", "cancelled")).toContain("« Expédiée » ne peut pas passer à « Annulée »");
    expect(refusalMessage("paid_locked")).toContain("verrouillée");
  });
});
