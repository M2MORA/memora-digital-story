import { describe, expect, it } from "vitest";
import { validateIntentMappings } from "@/lib/upload-intent-validator";
import type { UploadIntentRecord } from "@/types/database";

function createMockIntent(overrides: Partial<UploadIntentRecord> = {}): UploadIntentRecord {
  return {
    id: "intent-1",
    draft_id: "draft-xyz",
    draft_token_hash: "hash123",
    item_id: null,
    file_kind: "video",
    storage_key: "staging/draft-xyz/intent-1.mp4",
    file_name: "souvenir.mp4",
    file_extension: "mp4",
    mime_type: "video/mp4",
    file_size_bytes: 10485760,
    client_sha256: "d7a8fbb307d7809469ca9ab400f20708ecf68ab0b82832980d808da4329e4cb7",
    status: "ready",
    last_heartbeat_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    order_id: null,
    consumed_at: null,
    purge_token: null,
    purge_lease_expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Upload Intent Validator (V3.8.4)", () => {
  it("validates valid video and photo mappings for an item", () => {
    const videoIntent = createMockIntent({
      id: "v-1",
      file_kind: "video",
      file_extension: "mp4",
      mime_type: "video/mp4",
    });
    const photoIntent = createMockIntent({
      id: "p-1",
      file_kind: "photo",
      file_extension: "jpg",
      mime_type: "image/jpeg",
    });

    const map = new Map<string, UploadIntentRecord>([
      ["v-1", videoIntent],
      ["p-1", photoIntent],
    ]);

    const result = validateIntentMappings(
      [
        { item_id: "item-1", intent_id: "v-1", file_kind: "video" },
        { item_id: "item-1", intent_id: "p-1", file_kind: "photo" },
      ],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects duplicate uploadIntentId across multiple items", () => {
    const intent = createMockIntent({ id: "v-shared" });
    const map = new Map<string, UploadIntentRecord>([["v-shared", intent]]);

    const result = validateIntentMappings(
      [
        { item_id: "item-1", intent_id: "v-shared", file_kind: "video" },
        { item_id: "item-2", intent_id: "v-shared", file_kind: "video" },
      ],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DUPLICATE_INTENT_ID")).toBe(true);
  });

  it("rejects duplicate item slot (two videos for the same item)", () => {
    const intent1 = createMockIntent({ id: "v-1" });
    const intent2 = createMockIntent({ id: "v-2" });
    const map = new Map<string, UploadIntentRecord>([
      ["v-1", intent1],
      ["v-2", intent2],
    ]);

    const result = validateIntentMappings(
      [
        { item_id: "item-1", intent_id: "v-1", file_kind: "video" },
        { item_id: "item-1", intent_id: "v-2", file_kind: "video" },
      ],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DUPLICATE_ITEM_SLOT")).toBe(true);
  });

  it("rejects intents that are not in ready status (e.g. pending or consumed)", () => {
    const pendingIntent = createMockIntent({ id: "v-pending", status: "pending" });
    const consumedIntent = createMockIntent({ id: "v-consumed", status: "consumed" });

    const map = new Map<string, UploadIntentRecord>([
      ["v-pending", pendingIntent],
      ["v-consumed", consumedIntent],
    ]);

    const result = validateIntentMappings(
      [
        { item_id: "item-1", intent_id: "v-pending", file_kind: "video" },
        { item_id: "item-2", intent_id: "v-consumed", file_kind: "video" },
      ],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(false);
    const statusIssues = result.issues.filter((i) => i.code === "INVALID_STATUS");
    expect(statusIssues).toHaveLength(2);
  });

  it("rejects type mismatch (mapping a video to a photo slot)", () => {
    const videoIntent = createMockIntent({ id: "v-1", file_kind: "video" });
    const map = new Map<string, UploadIntentRecord>([["v-1", videoIntent]]);

    const result = validateIntentMappings(
      [{ item_id: "item-1", intent_id: "v-1", file_kind: "photo" }],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "TYPE_MISMATCH")).toBe(true);
  });

  it("rejects unauthorized draft ownership", () => {
    const intentOther = createMockIntent({ id: "v-other", draft_id: "foreign-draft" });
    const map = new Map<string, UploadIntentRecord>([["v-other", intentOther]]);

    const result = validateIntentMappings(
      [{ item_id: "item-1", intent_id: "v-other", file_kind: "video" }],
      map,
      "my-draft-123"
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "UNAUTHORIZED_DRAFT")).toBe(true);
  });

  it("rejects disallowed file extensions or mime types", () => {
    const exeIntent = createMockIntent({
      id: "v-exe",
      file_extension: "exe",
      mime_type: "application/x-msdownload",
    });
    const map = new Map<string, UploadIntentRecord>([["v-exe", exeIntent]]);

    const result = validateIntentMappings(
      [{ item_id: "item-1", intent_id: "v-exe", file_kind: "video" }],
      map,
      "draft-xyz"
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "UNAUTHORIZED_EXTENSION")).toBe(true);
    expect(result.issues.some((i) => i.code === "UNAUTHORIZED_MIME")).toBe(true);
  });
});
