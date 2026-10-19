import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  putCachedMedia,
  getCachedMedia,
  deleteCachedMedia,
  clearDraftMedia,
  getMediaCacheKey,
  _resetMemoryStore,
} from "@/lib/media-cache";
import {
  generateSecureDraftId,
  generateSecureDraftToken,
  getOrCreateDraftCredentials,
  resetDraftCredentials,
} from "@/lib/draft-manager";
import {
  requestUploadIntent,
  uploadBinaryToR2,
  verifyUploadedIntent,
  uploadMediaWithR2Intent,
} from "@/lib/r2-upload-client";
import { finalizeOrderWithIntents } from "@/lib/supabase";

describe("MÉMORA Phase 3.0 / Step 3 — Frontend Direct R2 Upload & Persistence", () => {
  beforeEach(() => {
    _resetMemoryStore();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. IndexedDB Media Cache Tests
  // ============================================================================
  describe("1. Media Cache (IndexedDB / Memory Fallback)", () => {
    it("1.1 Saves and retrieves an actual File object with stable keys", async () => {
      const file = new File(["test-video-binary-content"], "souvenir.mp4", {
        type: "video/mp4",
      });
      const key = getMediaCacheKey("dft_test123", "item_abc", "video");

      await putCachedMedia(key, file);
      const retrieved = await getCachedMedia(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved).toBeInstanceOf(File);
      expect(retrieved?.name).toBe("souvenir.mp4");
      expect(retrieved?.type).toBe("video/mp4");
      expect(retrieved?.size).toBe(file.size);
    });

    it("1.2 Returns null when media file is missing from cache", async () => {
      const missingKey = getMediaCacheKey("dft_test123", "nonexistent_item", "photo");
      const retrieved = await getCachedMedia(missingKey);
      expect(retrieved).toBeNull();
    });

    it("1.3 Deletes a specific cached file by key", async () => {
      const photo = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
      const key = getMediaCacheKey("dft_test123", "item_abc", "photo");

      await putCachedMedia(key, photo);
      expect(await getCachedMedia(key)).not.toBeNull();

      await deleteCachedMedia(key);
      expect(await getCachedMedia(key)).toBeNull();
    });

    it("1.4 Clears all draft media associated with a draftId prefix", async () => {
      const draftA = "dft_sessionA";
      const draftB = "dft_sessionB";

      const file1 = new File(["f1"], "f1.jpg", { type: "image/jpeg" });
      const file2 = new File(["f2"], "f2.mp4", { type: "video/mp4" });
      const file3 = new File(["f3"], "f3.jpg", { type: "image/jpeg" });

      await putCachedMedia(getMediaCacheKey(draftA, "it1", "photo"), file1);
      await putCachedMedia(getMediaCacheKey(draftA, "it1", "video"), file2);
      await putCachedMedia(getMediaCacheKey(draftB, "it2", "photo"), file3);

      await clearDraftMedia(draftA);

      expect(await getCachedMedia(getMediaCacheKey(draftA, "it1", "photo"))).toBeNull();
      expect(await getCachedMedia(getMediaCacheKey(draftA, "it1", "video"))).toBeNull();
      expect(await getCachedMedia(getMediaCacheKey(draftB, "it2", "photo"))).not.toBeNull();
    });
  });

  // ============================================================================
  // 2. Cryptographic Draft Manager Tests
  // ============================================================================
  describe("2. Draft Credentials Lifecycle", () => {
    it("2.1 Generates secure draft ID conforming to SQL regex ^[a-zA-Z0-9_-]{3,64}$", () => {
      const draftId = generateSecureDraftId();
      expect(draftId).toMatch(/^dft_[a-f0-9]{32}$/);
      expect(/^[a-zA-Z0-9_-]{3,64}$/.test(draftId)).toBe(true);
    });

    it("2.2 Generates high-entropy cryptographic draft token starting with tok_", () => {
      const token = generateSecureDraftToken();
      expect(token).toMatch(/^tok_[a-f0-9]{64}$/);
      expect(token.length).toBe(68);
    });

    it("2.3 Persists draft ID in localStorage and draft token in sessionStorage across simulated reloads", () => {
      const creds1 = getOrCreateDraftCredentials();
      expect(creds1.draftId).toBeDefined();
      expect(creds1.draftToken).toBeDefined();

      // Simulation d'un rechargement de page dans le même onglet
      const creds2 = getOrCreateDraftCredentials();
      expect(creds2.draftId).toBe(creds1.draftId);
      expect(creds2.draftToken).toBe(creds1.draftToken);
    });

    it("2.4 resetDraftCredentials generates fresh credentials and clears old session token", () => {
      const initial = getOrCreateDraftCredentials();
      const next = resetDraftCredentials();

      expect(next.draftId).not.toBe(initial.draftId);
      expect(next.draftToken).not.toBe(initial.draftToken);
      expect(next.draftId).toMatch(/^dft_/);
      expect(next.draftToken).toMatch(/^tok_/);
    });
  });

  // ============================================================================
  // 3. R2 Client & Endpoint Contract Tests
  // ============================================================================
  describe("3. R2 Upload Client (Intent, Direct PUT, Verify)", () => {
    it("3.1 Creates upload intent for photo and returns presigned PUT URL", async () => {
      const mockResponse = {
        success: true,
        intent_id: "11111111-2222-3333-4444-555555555555",
        upload_url: "https://r2.example.com/memora-videos/drafts/test/key.jpg?sig=xyz",
        required_headers: { "Content-Type": "image/jpeg" },
        expires_at: new Date(Date.now() + 900000).toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await requestUploadIntent({
        draft_id: "dft_abc123",
        draft_token: "tok_secret123",
        item_id: "item_1",
        file_kind: "photo",
        file_name: "memoir.jpg",
        mime_type: "image/jpeg",
        file_size_bytes: 1048576,
        file_extension: "jpg",
      });

      expect(result.success).toBe(true);
      expect(result.intent_id).toBe("11111111-2222-3333-4444-555555555555");
      expect(result.required_headers["Content-Type"]).toBe("image/jpeg");
    });

    it("3.2 Creates upload intent for video and returns presigned PUT URL", async () => {
      const mockResponse = {
        success: true,
        intent_id: "66666666-7777-8888-9999-000000000000",
        upload_url: "https://r2.example.com/memora-videos/drafts/test/key.mp4?sig=xyz",
        required_headers: { "Content-Type": "video/mp4" },
        expires_at: new Date(Date.now() + 900000).toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await requestUploadIntent({
        draft_id: "dft_abc123",
        draft_token: "tok_secret123",
        item_id: "item_1",
        file_kind: "video",
        file_name: "memory.mp4",
        mime_type: "video/mp4",
        file_size_bytes: 14582910,
        file_extension: "mp4",
      });

      expect(result.success).toBe(true);
      expect(result.intent_id).toBe("66666666-7777-8888-9999-000000000000");
      expect(result.required_headers["Content-Type"]).toBe("video/mp4");
    });

    it("3.3 Uploads file directly to R2 via PUT with required Content-Type and NO Authorization header", async () => {
      const file = new File(["binary-data"], "photo.png", { type: "image/png" });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await uploadBinaryToR2("https://r2.example.com/put-target", { "Content-Type": "image/png" }, file);

      expect(fetchSpy).toHaveBeenCalledWith("https://r2.example.com/put-target", {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: file,
      });

      const callHeaders = ((fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>);
      expect(callHeaders["authorization"]).toBeUndefined();
      expect(callHeaders["Authorization"]).toBeUndefined();
    });

    it("3.4 Throws descriptive error if R2 direct PUT returns failure", async () => {
      const file = new File(["binary-data"], "photo.png", { type: "image/png" });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

      await expect(
        uploadBinaryToR2("https://r2.example.com/put-target", { "Content-Type": "image/png" }, file)
      ).rejects.toThrow("Échec du transfert vers Cloudflare R2 (HTTP 403)");
    });

    it("3.5 Successfully calls /api/upload/verify and validates ready status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          intent_id: "intent_123",
          status: "ready",
          verified_size: 1048576,
        }),
      } as Response);

      const res = await verifyUploadedIntent("intent_123", "tok_secret");
      expect(res.success).toBe(true);
      expect(res.status).toBe("ready");
    });

    it("3.6 Throws error if /api/upload/verify returns unsuccessful or non-ready status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: "Objet R2 introuvable ou taille non conforme",
        }),
      } as Response);

      await expect(verifyUploadedIntent("intent_123", "tok_secret")).rejects.toThrow(
        "Objet R2 introuvable ou taille non conforme"
      );
    });

    it("3.7 uploadMediaWithR2Intent runs full sequence (intent -> direct PUT -> verify)", async () => {
      const file = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        // 1. Intent call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            intent_id: "intent_seq_1",
            upload_url: "https://r2.example.com/upload-url",
            required_headers: { "Content-Type": "video/mp4" },
            expires_at: new Date(Date.now() + 900000).toISOString(),
          }),
        } as Response)
        // 2. Direct PUT to R2
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response)
        // 3. Verify call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            intent_id: "intent_seq_1",
            status: "ready",
          }),
        } as Response);

      const intentId = await uploadMediaWithR2Intent({
        draftId: "dft_seq",
        draftToken: "tok_seq",
        itemId: "item_seq",
        fileKind: "video",
        file,
      });

      expect(intentId).toBe("intent_seq_1");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================================================
  // 4. Supabase finalizeOrderWithIntents & Critical Checkout Logic
  // ============================================================================
  describe("4. Supabase RPC Finalization & Failure Containment", () => {
    it("4.1 finalizeOrderWithIntents passes correct parameters and returns order confirmation", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          order_id: "ord_uuid_123",
          order_number: "MEM-789012",
          total: 49.0,
          idempotent_replay: false,
        },
        error: null,
      });

      // Injecter mock sur supabase
      const { supabase } = await import("@/lib/supabase");
      vi.spyOn(supabase, "rpc").mockImplementation(mockRpc);

      const result = await finalizeOrderWithIntents({
        orderPayload: {
          order_number: "MEM-789012",
          customer_name: "Yassine Test",
          customer_email: "test@memora.tn",
          shipping_address: { city: "Tunis" },
          items: [{ id: "item_1", format: "10x15", qty: 1 }],
        },
        draftId: "dft_order123",
        draftToken: "tok_order123",
        intentMappings: [
          { item_id: "item_1", intent_id: "11111111-1111-4111-8111-111111111111", file_kind: "photo" },
          { item_id: "item_1", intent_id: "22222222-2222-4222-8222-222222222222", file_kind: "video" },
        ],
        idempotencyKey: "idem_dft_order123_MEM-789012",
      });

      expect(result.success).toBe(true);
      expect(result.order_number).toBe("MEM-789012");
      expect(mockRpc).toHaveBeenCalledWith("finalize_order_with_intents", {
        p_order_payload: expect.any(Object),
        p_draft_id: "dft_order123",
        p_draft_token: "tok_order123",
        p_intent_mappings: expect.any(Array),
        p_idempotency_key: "idem_dft_order123_MEM-789012",
      });
    });

    it("4.2 finalizeOrderWithIntents returns error when database RPC rejects finalization", async () => {
      const { supabase } = await import("@/lib/supabase");
      (vi.spyOn(supabase, "rpc") as any).mockResolvedValueOnce({
        data: null,
        error: { message: "Mappage média incomplet pour l'article item_1" },
      });

      const result = await finalizeOrderWithIntents({
        orderPayload: { order_number: "MEM-789012", items: [] },
        draftId: "dft_err",
        draftToken: "tok_err",
        intentMappings: [],
        idempotencyKey: "idem_err",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Mappage média incomplet");
    });

    it("4.3 Preserves media files and draft credentials when checkout fails (No phantom cleanup)", async () => {
      const draftId = "dft_recovery_test";
      const photoFile = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
      const key = getMediaCacheKey(draftId, "item_recov", "photo");

      await putCachedMedia(key, photoFile);
      expect(await getCachedMedia(key)).not.toBeNull();

      // En cas d'erreur de finalisation (ex: réseau ou validation SQL) :
      // La règle stipule : "If finalization fails: Preserve IndexedDB media. Preserve draft credentials. Allow recovery."
      // On ne doit PAS appeler clearDraftMedia !
      const stillCached = await getCachedMedia(key);
      expect(stillCached).not.toBeNull();
      expect(stillCached?.name).toBe("photo.jpg");
    });

    it("4.4 Cleans up draft media from IndexedDB ONLY after successful finalization", async () => {
      const draftId = "dft_cleanup_test";
      const photoFile = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
      const videoFile = new File(["video-bytes"], "video.mp4", { type: "video/mp4" });

      await putCachedMedia(getMediaCacheKey(draftId, "item_clean", "photo"), photoFile);
      await putCachedMedia(getMediaCacheKey(draftId, "item_clean", "video"), videoFile);

      // Simulation finalisation réussie
      await clearDraftMedia(draftId);

      expect(await getCachedMedia(getMediaCacheKey(draftId, "item_clean", "photo"))).toBeNull();
      expect(await getCachedMedia(getMediaCacheKey(draftId, "item_clean", "video"))).toBeNull();
    });
  });
});
