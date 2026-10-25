import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { streamMemory } = vi.hoisted(() => ({
  streamMemory: vi.fn(),
}));

vi.mock("../../src/server", () => ({
  handleNfcMemoryRoute: streamMemory,
}));

import nfcVideoFunction from "../../api/nfc-video";

describe("Vercel NFC adapter", () => {
  beforeEach(() => {
    streamMemory.mockReset();
  });

  it("rewrites the existing public NFC path to the internal streaming function", () => {
    const configPath = resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));

    expect(config.rewrites).toContainEqual({
      source: "/m/:slug",
      destination: "/api/nfc-video",
    });
  });

  it("passes the internally rewritten slug to the server streaming handler", async () => {
    const expected = new Response(new Uint8Array([1, 2]), {
      status: 206,
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-1/2" },
    });
    streamMemory.mockResolvedValueOnce(expected);
    const request = new Request("https://memora.tn/api/nfc-video?slug=mem-578855", {
      headers: { Range: "bytes=0-1" },
    });

    const response = await nfcVideoFunction.fetch(request);

    expect(response).toBe(expected);
    expect(streamMemory).toHaveBeenCalledWith(request, process.env, "mem-578855");
  });

  it("allows only GET and HEAD before the streaming handler", async () => {
    const response = await nfcVideoFunction.fetch(
      new Request("https://memora.tn/api/nfc-video?slug=mem-578855", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(streamMemory).not.toHaveBeenCalled();
  });
});
