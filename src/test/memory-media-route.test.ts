import { describe, expect, it, vi } from "vitest";
import { handleMediaRoute, handleMemoryMediaRoute } from "@/server";

const videoKey = "staging/dft_1/11111111-2222-3333-4444-555555555555.mp4";
const photoKey = "staging/dft_1/66666666-7777-8888-9999-000000000000.jpg";

function memoryRow(row: Record<string, unknown> | null) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { supabaseAdmin: { from: () => builder }, filters };
}

const stored = (key: string, origin = "http://localhost:8080") =>
  `${origin}/api/media?key=${encodeURIComponent(key)}`;

const request = (query: string) => new Request(`https://www.memora.tn/api/memory-media?${query}`);

describe("Médias d'un souvenir par slug", () => {
  it("redirige vers R2 sans exposer la clé, même avec une origine localhost enregistrée", async () => {
    const { supabaseAdmin, filters } = memoryRow({ video_url: stored(videoKey), photo_url: null });
    const signUrl = vi.fn(async () => "https://r2.example.com/signed");

    const res = await handleMemoryMediaRoute(request("slug=abc"), {}, { supabaseAdmin, signUrl });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/signed");
    expect(signUrl).toHaveBeenCalledWith(videoKey);
    expect(filters).toEqual([
      ["slug", "abc"],
      ["status", "active"],
    ]);
  });

  it("accepte une adresse enregistrée sans https://", async () => {
    const { supabaseAdmin } = memoryRow({
      video_url: `memora.tn/api/media?key=${encodeURIComponent(videoKey)}`,
      photo_url: null,
    });
    const signUrl = vi.fn(async () => "https://r2.example.com/signed");

    const res = await handleMemoryMediaRoute(request("slug=abc"), {}, { supabaseAdmin, signUrl });

    expect(res.status).toBe(302);
    expect(signUrl).toHaveBeenCalledWith(videoKey);
  });

  it("accepte l'adresse relative enregistrée par l'admin (/api/media?key=…)", async () => {
    const { supabaseAdmin } = memoryRow({
      video_url: `/api/media?key=${encodeURIComponent(videoKey)}`,
      photo_url: null,
    });
    const signUrl = vi.fn(async () => "https://r2.example.com/signed");

    const res = await handleMemoryMediaRoute(request("slug=abc"), {}, { supabaseAdmin, signUrl });

    expect(res.status).toBe(302);
    expect(signUrl).toHaveBeenCalledWith(videoKey);
  });

  it("sert la photo sur demande", async () => {
    const { supabaseAdmin } = memoryRow({ video_url: stored(videoKey), photo_url: stored(photoKey) });
    const signUrl = vi.fn(async () => "https://r2.example.com/photo");

    const res = await handleMemoryMediaRoute(request("slug=abc&kind=photo"), {}, { supabaseAdmin, signUrl });

    expect(res.status).toBe(302);
    expect(signUrl).toHaveBeenCalledWith(photoKey);
  });

  it("répond 404 pour un souvenir absent ou un média hors du stockage privé", async () => {
    const signUrl = vi.fn(async () => "https://r2.example.com/x");

    const missing = await handleMemoryMediaRoute(
      request("slug=absent"),
      {},
      { supabaseAdmin: memoryRow(null).supabaseAdmin, signUrl },
    );
    const external = await handleMemoryMediaRoute(
      request("slug=abc"),
      {},
      { supabaseAdmin: memoryRow({ video_url: "https://evil.example.com/x.mp4" }).supabaseAdmin, signUrl },
    );

    expect(missing.status).toBe(404);
    expect(external.status).toBe(404);
    expect(signUrl).not.toHaveBeenCalled();
  });
});

describe("/api/media", () => {
  it("refuse de signer autre chose qu'un média client", async () => {
    for (const key of ["secrets/config.json", "staging/../other.mp4", "staging/dft_1/not-a-uuid.mp4"]) {
      const res = await handleMediaRoute(
        new Request(`https://www.memora.tn/api/media?key=${encodeURIComponent(key)}`),
        {},
      );
      expect(res.status).toBe(403);
    }
  });
});
