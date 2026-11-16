import { describe, expect, it, vi } from "vitest";
import { mediaKeyRedirect, memoryMediaRedirect, type MediaStorage } from "@/server/memory-media";

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
  return { db: { from: () => builder }, filters };
}

function fakeStorage(signedUrl = "https://r2.example.com/signed") {
  const storage = {
    headObject: vi.fn(),
    getObjectRange: vi.fn(),
    getSignedGetUrl: vi.fn(async (_key: string) => signedUrl),
  };
  return storage as typeof storage & MediaStorage;
}

const stored = (key: string, origin = "http://localhost:8080") =>
  `${origin}/api/media?key=${encodeURIComponent(key)}`;

const request = (query: string) => new Request(`https://www.memora.tn/api/memory-media?${query}`);

function deps(row: Record<string, unknown> | null, storage = fakeStorage()) {
  const memory = memoryRow(row);
  return {
    deps: { db: () => memory.db, storage: () => storage },
    storage,
    filters: memory.filters,
  };
}

describe("Médias d'un souvenir par slug", () => {
  it("redirige vers R2 sans exposer la clé, même avec une origine localhost enregistrée", async () => {
    const { deps: d, storage, filters } = deps({ video_url: stored(videoKey), photo_url: null });

    const res = await memoryMediaRedirect(request("slug=abc"), d);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/signed");
    expect(storage.getSignedGetUrl).toHaveBeenCalledWith(videoKey);
    expect(filters).toEqual([
      ["slug", "abc"],
      ["status", "active"],
    ]);
  });

  it("accepte une adresse enregistrée sans https://", async () => {
    const { deps: d, storage } = deps({
      video_url: `memora.tn/api/media?key=${encodeURIComponent(videoKey)}`,
      photo_url: null,
    });

    const res = await memoryMediaRedirect(request("slug=abc"), d);

    expect(res.status).toBe(302);
    expect(storage.getSignedGetUrl).toHaveBeenCalledWith(videoKey);
  });

  it("accepte l'adresse relative enregistrée par l'admin (/api/media?key=…)", async () => {
    const { deps: d, storage } = deps({
      video_url: `/api/media?key=${encodeURIComponent(videoKey)}`,
      photo_url: null,
    });

    const res = await memoryMediaRedirect(request("slug=abc"), d);

    expect(res.status).toBe(302);
    expect(storage.getSignedGetUrl).toHaveBeenCalledWith(videoKey);
  });

  it("sert la photo sur demande", async () => {
    const { deps: d, storage } = deps(
      { video_url: stored(videoKey), photo_url: stored(photoKey) },
      fakeStorage("https://r2.example.com/photo"),
    );

    const res = await memoryMediaRedirect(request("slug=abc&kind=photo"), d);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/photo");
    expect(storage.getSignedGetUrl).toHaveBeenCalledWith(photoKey);
  });

  it("répond 404 pour un souvenir absent ou un média hors du stockage privé", async () => {
    const missing = deps(null);
    const external = deps({ video_url: "https://evil.example.com/x.mp4" });

    expect((await memoryMediaRedirect(request("slug=absent"), missing.deps)).status).toBe(404);
    expect((await memoryMediaRedirect(request("slug=abc"), external.deps)).status).toBe(404);
    expect(missing.storage.getSignedGetUrl).not.toHaveBeenCalled();
    expect(external.storage.getSignedGetUrl).not.toHaveBeenCalled();
  });

  it("répond 503 quand le stockage n'est pas configuré", async () => {
    const { deps: d } = deps({ video_url: stored(videoKey) });
    const res = await memoryMediaRedirect(request("slug=abc"), {
      ...d,
      storage: () => {
        throw new Error("Configuration Cloudflare R2 manquante");
      },
    });

    expect(res.status).toBe(503);
  });
});

describe("/api/media", () => {
  const mediaRequest = (key: string) =>
    new Request(`https://www.memora.tn/api/media?key=${encodeURIComponent(key)}`);

  it("refuse de signer autre chose qu'un média client", async () => {
    const storage = fakeStorage();
    for (const key of [
      "secrets/config.json",
      "staging/../other.mp4",
      "staging/dft_1/not-a-uuid.mp4",
    ]) {
      const res = await mediaKeyRedirect(mediaRequest(key), () => storage);
      expect(res.status).toBe(403);
    }
    expect(storage.getSignedGetUrl).not.toHaveBeenCalled();
  });

  it("redirige vers le lien signé d'un média client", async () => {
    const storage = fakeStorage();
    const res = await mediaKeyRedirect(mediaRequest(`/${videoKey}`), () => storage);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/signed");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(storage.getSignedGetUrl).toHaveBeenCalledWith(videoKey);
  });

  it("répond 500 sans configuration et 404 si la signature échoue", async () => {
    const unconfigured = await mediaKeyRedirect(mediaRequest(videoKey), () => {
      throw new Error("Configuration Cloudflare R2 manquante");
    });
    const failing = fakeStorage();
    failing.getSignedGetUrl.mockRejectedValueOnce(new Error("boom"));
    const failed = await mediaKeyRedirect(mediaRequest(videoKey), () => failing);

    expect(unconfigured.status).toBe(500);
    expect(failed.status).toBe(404);
  });
});
