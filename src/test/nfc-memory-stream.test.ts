import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { handleNfcMemoryRoute } from "../server";

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

function r2Client(bytes = new Uint8Array([10, 20, 30, 40])) {
  const send = vi.fn(async (command: HeadObjectCommand | GetObjectCommand) => {
    if (command instanceof HeadObjectCommand) {
      return {
        ContentLength: bytes.byteLength,
        ETag: '"r2-etag"',
        LastModified: new Date("2026-10-25T10:00:00.000Z"),
      };
    }

    const requestedRange = command.input.Range;
    const match = requestedRange?.match(/^bytes=(\d+)-(\d+)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match ? Number(match[2]) : bytes.byteLength - 1;
    const chunk = bytes.slice(start, end + 1);
    return {
      Body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    };
  });
  return { send };
}

describe("permanent NFC memory video route", () => {
  it("streams the private object at the permanent MÉMORA URL without redirecting", async () => {
    const client = r2Client();
    const response = await handleNfcMemoryRoute(
      new Request("https://memora.tn/m/mem-123"),
      {},
      "mem-123",
      { supabaseAdmin: activeMemory(), r2Client: client },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([10, 20, 30, 40]));
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
  });

  it("serves byte ranges for seeking as 206 responses", async () => {
    const client = r2Client();
    const response = await handleNfcMemoryRoute(
      new Request("https://memora.tn/m/mem-123", { headers: { Range: "bytes=1-2" } }),
      {},
      "mem-123",
      { supabaseAdmin: activeMemory(), r2Client: client },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect((client.send.mock.calls[1]?.[0] as GetObjectCommand).input.Range).toBe("bytes=1-2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([20, 30]));
  });

  it("answers HEAD with video headers and does not fetch the object body", async () => {
    const client = r2Client();
    const response = await handleNfcMemoryRoute(
      new Request("https://memora.tn/m/mem-123", { method: "HEAD" }),
      {},
      "mem-123",
      { supabaseAdmin: activeMemory(), r2Client: client },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.body).toBeNull();
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("returns 416 for an unsatisfiable range without fetching the object", async () => {
    const client = r2Client();
    const response = await handleNfcMemoryRoute(
      new Request("https://memora.tn/m/mem-123", { headers: { Range: "bytes=99-" } }),
      {},
      "mem-123",
      { supabaseAdmin: activeMemory(), r2Client: client },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */4");
    expect(response.body).toBeNull();
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("does not contact R2 for unknown or inactive memories", async () => {
    const client = r2Client();
    const response = await handleNfcMemoryRoute(
      new Request("https://memora.tn/m/missing"),
      {},
      "missing",
      { supabaseAdmin: activeMemory(null), r2Client: client },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(client.send).not.toHaveBeenCalled();
  });
});
