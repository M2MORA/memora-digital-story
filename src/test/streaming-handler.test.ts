import { describe, expect, it } from "vitest";
import {
  resolveStreamingResponse,
  matchesIfRangeEtag,
  matchesIfNoneMatch,
} from "@/lib/streaming-handler";

describe("Streaming Handler, Cache & Range Requests (Phase 1.1)", () => {
  const TOTAL_SIZE = 1000000; // 1 Mo
  const ETAG = '"abc123strong"';
  const CONTENT_TYPE = "video/mp4";
  const LAST_MODIFIED = "Wed, 14 Oct 2026 12:00:00 GMT";

  it("returns 200 OK when no Range header is specified", () => {
    const res = resolveStreamingResponse({
      rangeHeader: null,
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(200);
    expect(res.headers["Content-Length"]).toBe(TOTAL_SIZE.toString());
    expect(res.headers["Accept-Ranges"]).toBe("bytes");
    expect(res.range).toBeNull();
    expect(res.isHead).toBe(false);
  });

  it("handles HEAD requests properly (same headers as GET, isHead = true)", () => {
    const res = resolveStreamingResponse({
      method: "HEAD",
      rangeHeader: null,
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(200);
    expect(res.isHead).toBe(true);
    expect(res.headers["Content-Length"]).toBe(TOTAL_SIZE.toString());
    expect(res.headers["Accept-Ranges"]).toBe("bytes");
  });

  it("returns 304 Not Modified when If-None-Match matches exact strong ETag", () => {
    const res = resolveStreamingResponse({
      rangeHeader: null,
      ifNoneMatchHeader: '"abc123strong"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(304);
    expect(res.headers["ETag"]).toBe(ETAG);
    expect(res.range).toBeNull();
  });

  it("returns 304 Not Modified when If-None-Match uses weak comparison (RFC 9110 §13.1.2)", () => {
    expect(matchesIfNoneMatch('W/"abc123strong"', ETAG)).toBe(true);

    const res = resolveStreamingResponse({
      rangeHeader: null,
      ifNoneMatchHeader: 'W/"abc123strong"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(304);
  });

  it("returns 304 Not Modified when If-None-Match contains wildcard or comma list", () => {
    expect(matchesIfNoneMatch('*', ETAG)).toBe(true);
    expect(matchesIfNoneMatch('"other1", "abc123strong", "other2"', ETAG)).toBe(true);
    expect(matchesIfNoneMatch('"other1", "other2"', ETAG)).toBe(false);

    const res = resolveStreamingResponse({
      rangeHeader: null,
      ifNoneMatchHeader: '"tagA", "abc123strong"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(304);
  });

  it("returns 304 Not Modified when If-Modified-Since is equal or after Last-Modified", () => {
    const res = resolveStreamingResponse({
      rangeHeader: null,
      ifModifiedSinceHeader: "Thu, 15 Oct 2026 12:00:00 GMT",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
      lastModified: LAST_MODIFIED,
    });

    expect(res.status).toBe(304);
  });

  it("returns 206 Partial Content for a valid explicit range", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=0-499",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(206);
    expect(res.range).toEqual({ start: 0, end: 499 });
    expect(res.headers["Content-Range"]).toBe(`bytes 0-499/${TOTAL_SIZE}`);
    expect(res.headers["Content-Length"]).toBe("500");
  });

  it("returns 206 Partial Content for open range (e.g. bytes=900000-)", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=900000-",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(206);
    expect(res.range).toEqual({ start: 900000, end: 999999 });
    expect(res.headers["Content-Range"]).toBe(`bytes 900000-999999/${TOTAL_SIZE}`);
    expect(res.headers["Content-Length"]).toBe("100000");
  });

  it("returns 206 Partial Content for suffix range (e.g. bytes=-500)", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=-500",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(206);
    expect(res.range).toEqual({ start: 999500, end: 999999 });
    expect(res.headers["Content-Range"]).toBe(`bytes 999500-999999/${TOTAL_SIZE}`);
    expect(res.headers["Content-Length"]).toBe("500");
  });

  it("returns 416 Range Not Satisfiable for range exceeding totalSize", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=2000000-",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(416);
    expect(res.headers["Content-Range"]).toBe(`bytes */${TOTAL_SIZE}`);
    expect(res.range).toBeNull();
  });

  it("returns 416 Range Not Satisfiable for reversed/malformed range (e.g. bytes=500-200)", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=500-200",
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(416);
    expect(res.headers["Content-Range"]).toBe(`bytes */${TOTAL_SIZE}`);
  });

  it("evaluates If-Range matching strong ETag -> returns 206 Partial Content", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=0-100",
      ifRangeHeader: '"abc123strong"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(206);
    expect(res.range).toEqual({ start: 0, end: 100 });
  });

  it("evaluates If-Range mismatch -> returns 200 OK full content", () => {
    const res = resolveStreamingResponse({
      rangeHeader: "bytes=0-100",
      ifRangeHeader: '"differentEtag"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(200);
    expect(res.headers["Content-Length"]).toBe(TOTAL_SIZE.toString());
    expect(res.range).toBeNull();
  });

  it("rejects weak ETags in If-Range (RFC 9110 requires strong match) -> returns 200 OK full content", () => {
    expect(matchesIfRangeEtag('W/"abc123strong"', ETAG)).toBe(false);

    const res = resolveStreamingResponse({
      rangeHeader: "bytes=0-100",
      ifRangeHeader: 'W/"abc123strong"',
      totalSize: TOTAL_SIZE,
      contentType: CONTENT_TYPE,
      etag: ETAG,
    });

    expect(res.status).toBe(200);
    expect(res.range).toBeNull();
  });
});
