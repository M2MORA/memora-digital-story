import { describe, expect, it, vi } from "vitest";
import { deleteOrderViaApi } from "./api";

describe("deleteOrderViaApi", () => {
  const base = { apiBase: "https://www.memora.tn", accessToken: "tok", orderId: "o-1" };

  it("appelle le serveur avec le jeton admin", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await deleteOrderViaApi({ ...base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://www.memora.tn/api/admin/orders?id=o-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("échoue clairement si le serveur refuse, sans repli", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 404 }));
    await expect(deleteOrderViaApi({ ...base, fetchImpl })).rejects.toThrow(/Rien n'a été supprimé/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("relaie le message d'erreur du serveur", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Accès administrateur requis" }), { status: 403 }));
    await expect(deleteOrderViaApi({ ...base, fetchImpl })).rejects.toThrow("Accès administrateur requis");
  });

  it("échoue clairement si le serveur est injoignable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(deleteOrderViaApi({ ...base, fetchImpl })).rejects.toThrow(/injoignable/);
  });
});
