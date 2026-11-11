import { describe, expect, it, vi } from "vitest";
import { computeStats, deleteOrderViaApi, displayMediaUrl, mediaPath } from "./rules";

const key = "staging/dft_abc/11111111-2222-3333-4444-555555555555.jpg";
const encoded = encodeURIComponent(key);

describe("computeStats", () => {
  const orders = [
    { status: "pending", total: 57 },
    { status: "printing", total: 57 },
    { status: "shipped", total: 57 },
    { status: "delivered", total: 55 },
    { status: "paid", total: "57.00" },
    { status: "cancelled", total: 57 },
  ];

  it("compte comme « à faire » tout sauf payée et annulée, y compris livrée", () => {
    expect(computeStats(orders, []).todo).toBe(4);
  });

  it("sépare l'argent encaissé de l'argent à encaisser, sans compter les commandes en attente", () => {
    const s = computeStats(orders, []);
    expect(s.collected).toBe(57);
    expect(s.toCollect).toBe(112);
  });

  it("additionne les scans", () => {
    expect(computeStats([], [{ view_count: 3 }, { view_count: null }]).views).toBe(3);
  });
});

describe("displayMediaUrl", () => {
  const api = "https://www.memora.tn";

  it("remplace une origine localhost enregistrée par le serveur actuel", () => {
    expect(displayMediaUrl(`http://localhost:8080/api/media?key=${encoded}`, api)).toBe(
      `${api}/api/media?key=${encoded}`,
    );
  });

  it("accepte une adresse sans https:// et une adresse relative", () => {
    expect(displayMediaUrl(`memora.tn/api/media?key=${encoded}`, api)).toBe(`${api}/api/media?key=${encoded}`);
    expect(displayMediaUrl(mediaPath(key), `${api}/`)).toBe(`${api}/api/media?key=${encoded}`);
  });

  it("laisse les autres adresses intactes", () => {
    const supa = "https://x.supabase.co/storage/v1/object/public/photos/a.jpg";
    expect(displayMediaUrl(supa, api)).toBe(supa);
    expect(displayMediaUrl("data:image/png;base64,AAAA", api)).toBe("data:image/png;base64,AAAA");
    expect(displayMediaUrl(null, api)).toBeUndefined();
  });
});

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
