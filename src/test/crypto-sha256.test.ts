import { describe, expect, it } from "vitest";
import {
  ProgressiveSha256,
  computeStreamingSha256,
  Sha256SizeMismatchError,
  Sha256AbortedError,
} from "@/lib/crypto-sha256";

describe("Streaming SHA-256 (Phase 1.1)", () => {
  it("computes correct hash for standard test vectors (empty string)", () => {
    const hasher = new ProgressiveSha256();
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hasher.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("computes correct hash for NIST test vector 'The quick brown fox jumps over the lazy dog'", () => {
    const textWithoutDot = "The quick brown fox jumps over the lazy dog";
    const dataWithoutDot = new TextEncoder().encode(textWithoutDot);
    const hasherWithoutDot = new ProgressiveSha256();
    hasherWithoutDot.update(dataWithoutDot);
    expect(hasherWithoutDot.digestHex()).toBe("d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592");

    const textWithDot = "The quick brown fox jumps over the lazy dog.";
    const dataWithDot = new TextEncoder().encode(textWithDot);
    const hasherWithDot = new ProgressiveSha256();
    hasherWithDot.update(dataWithDot);
    expect(hasherWithDot.digestHex()).toBe("ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c");
  });

  it("produces identical hash regardless of chunking boundaries", () => {
    const text = "MÉMORA - Souvenirs digitaux & capsules temporelles connectées NFC/QR 2026";
    const data = new TextEncoder().encode(text);

    const single = new ProgressiveSha256().update(data).digestHex();

    const chunked = new ProgressiveSha256();
    for (let i = 0; i < data.length; i += 3) {
      chunked.update(data.subarray(i, Math.min(i + 3, data.length)));
    }
    expect(chunked.digestHex()).toBe(single);
  });

  it("computes streaming hash on Blob with progress notifications and verified size", async () => {
    const content = new Uint8Array(65536); // 64 Ko
    for (let i = 0; i < content.length; i++) {
      content[i] = (i * 31) & 0xff;
    }
    const blob = new Blob([content]);

    let lastProgress = 0;
    let progressCalls = 0;

    const hash = await computeStreamingSha256(blob, {
      chunkSize: 8192,
      expectedSizeBytes: 65536,
      onProgress: (p) => {
        progressCalls++;
        expect(p).toBeGreaterThanOrEqual(lastProgress);
        lastProgress = p;
      },
    });

    expect(hash).toHaveLength(64);
    expect(lastProgress).toBe(1);
    expect(progressCalls).toBeGreaterThan(1);
  });

  it("throws Sha256SizeMismatchError if actual file size does not match expectedSizeBytes", async () => {
    const blob = new Blob([new Uint8Array(100)]);

    await expect(
      computeStreamingSha256(blob, {
        expectedSizeBytes: 200, // attend 200 mais en fait 100
      })
    ).rejects.toThrow(Sha256SizeMismatchError);
  });

  it("throws Sha256AbortedError when AbortSignal is triggered", async () => {
    const blob = new Blob([new Uint8Array(50000)]);
    const controller = new AbortController();

    const promise = computeStreamingSha256(blob, {
      chunkSize: 1024,
      signal: controller.signal,
      onProgress: (p) => {
        if (p > 0.1) {
          controller.abort();
        }
      },
    });

    await expect(promise).rejects.toThrow(Sha256AbortedError);
  });
});
