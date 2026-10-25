import { describe, expect, it, vi, beforeEach } from "vitest";

const { streamMemory } = vi.hoisted(() => ({
  streamMemory: vi.fn(),
}));

vi.mock("../../src/server", () => ({
  handleNfcMemoryRoute: streamMemory,
}));

import nfcVideoHandler from "../../api/nfc-video";

describe("Vercel NFC adapter", () => {
  beforeEach(() => {
    streamMemory.mockReset();
  });

  it("passes the query slug to the server streaming handler via Web Fetch interface", async () => {
    const expected = new Response(new Uint8Array([1, 2]), {
      status: 206,
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-1/2" },
    });
    streamMemory.mockResolvedValueOnce(expected);
    const request = new Request("https://memora.tn/api/nfc-video?slug=mem-578855", {
      headers: { Range: "bytes=0-1" },
    });

    const response = await nfcVideoHandler.fetch(request);

    expect(response).toBe(expected);
    expect(streamMemory).toHaveBeenCalledWith(request, process.env, "mem-578855");
  });

  it("handles Vercel Node.js serverless (req, res) invocations cleanly", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([65, 66]));
        controller.close();
      },
    });
    const expected = new Response(stream, {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
    streamMemory.mockResolvedValueOnce(expected);

    const writtenChunks: Buffer[] = [];
    let ended = false;
    const req = {
      method: "GET",
      url: "/api/nfc-video?slug=mem-999",
      headers: { host: "memora.tn" },
    };
    const res = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      write(chunk: Buffer) {
        writtenChunks.push(chunk);
      },
      end() {
        ended = true;
      },
    };

    await nfcVideoHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(Buffer.concat(writtenChunks).toString()).toBe("AB");
    expect(ended).toBe(true);
  });

  it("allows only GET and HEAD before the streaming handler", async () => {
    const response = await nfcVideoHandler.fetch(
      new Request("https://memora.tn/api/nfc-video?slug=mem-578855", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(streamMemory).not.toHaveBeenCalled();
  });
});
