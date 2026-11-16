import { describe, expect, it, vi } from "vitest";
import type { R2ByteRange } from "../lib/r2-backend";
import { memoryVideoStream, type MediaStorage } from "../server/memory-media";

const objectKey = "staging/draft_123/11111111-1111-1111-1111-111111111111.mp4";
const videoUrl = `https://memora.tn/api/media?key=${encodeURIComponent(objectKey)}`;

function activeMemory(video_url: string | null = videoUrl) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: video_url ? { video_url } : null,
    error: null,
  });
  const statusFilter = { maybeSingle };
  const slugFilter = { eq: vi.fn().mockReturnValue(statusFilter) };
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(slugFilter),
      }),
    }),
  };
}

function fakeStorage(bytes = new Uint8Array([10, 20, 30, 40])) {
  const storage = {
    headObject: vi.fn(async (_key: string) => ({
      exists: true,
      contentLength: bytes.byteLength,
      etag: '"r2-etag"',
      lastModified: new Date("2026-10-25T10:00:00.000Z"),
    })),
    getObjectRange: vi.fn(async (_key: string, range?: R2ByteRange) => {
      const chunk = range ? bytes.slice(range.start, range.end + 1) : bytes;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      });
    }),
    getSignedGetUrl: vi.fn(),
  };
  return storage as typeof storage & MediaStorage;
}

function stream(request: Request, slug: string, storage = fakeStorage(), memory = activeMemory()) {
  return memoryVideoStream(request, slug, { db: () => memory, storage: () => storage });
}

describe("permanent NFC memory video route", () => {
  it("streams the private object at the permanent MÉMORA URL without redirecting", async () => {
    const storage = fakeStorage();
    const response = await stream(new Request("https://memora.tn/m/mem-123"), "mem-123", storage);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([10, 20, 30, 40]));
    expect(storage.headObject).toHaveBeenCalledWith(objectKey);
    expect(storage.getObjectRange).toHaveBeenCalledWith(objectKey, undefined);
  });

  it("serves byte ranges for seeking as 206 responses", async () => {
    const storage = fakeStorage();
    const response = await stream(
      new Request("https://memora.tn/m/mem-123", { headers: { Range: "bytes=1-2" } }),
      "mem-123",
      storage,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect(storage.getObjectRange).toHaveBeenCalledWith(objectKey, { start: 1, end: 2 });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([20, 30]));
  });

  it("answers HEAD with video headers and does not fetch the object body", async () => {
    const storage = fakeStorage();
    const response = await stream(
      new Request("https://memora.tn/m/mem-123", { method: "HEAD" }),
      "mem-123",
      storage,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.body).toBeNull();
    expect(storage.headObject).toHaveBeenCalledTimes(1);
    expect(storage.getObjectRange).not.toHaveBeenCalled();
  });

  it("returns 416 for an unsatisfiable range without fetching the object", async () => {
    const storage = fakeStorage();
    const response = await stream(
      new Request("https://memora.tn/m/mem-123", { headers: { Range: "bytes=99-" } }),
      "mem-123",
      storage,
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */4");
    expect(response.body).toBeNull();
    expect(storage.getObjectRange).not.toHaveBeenCalled();
  });

  it("does not contact R2 for unknown or inactive memories", async () => {
    const storage = fakeStorage();
    const response = await stream(
      new Request("https://memora.tn/m/missing"),
      "missing",
      storage,
      activeMemory(null),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(storage.headObject).not.toHaveBeenCalled();
  });

  it("answers 503 without contacting R2 when the bucket is not configured", async () => {
    const response = await memoryVideoStream(
      new Request("https://memora.tn/m/mem-123"),
      "mem-123",
      {
        db: () => activeMemory(),
        storage: () => {
          throw new Error(
            "Configuration Cloudflare R2 manquante (variables requises : R2_BUCKET_NAME)",
          );
        },
      },
    );

    expect(response.status).toBe(503);
  });

  it("answers 503 when the object is missing from the bucket", async () => {
    const storage = fakeStorage();
    storage.headObject.mockResolvedValueOnce({ exists: false, contentLength: 0 } as never);
    const response = await stream(new Request("https://memora.tn/m/mem-123"), "mem-123", storage);

    expect(response.status).toBe(503);
    expect(storage.getObjectRange).not.toHaveBeenCalled();
  });
});
