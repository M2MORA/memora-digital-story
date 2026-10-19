/**
 * MÉMORA — Tests Unitaires Endpoint POST /api/upload/intent (Phase 3.0 / Étape 2)
 *
 * Couvre l'intégralité des 18 exigences de test :
 * 1. Intention d'upload vidéo valide
 * 2. Intention d'upload photo valide
 * 3. JSON invalide (HTTP 400)
 * 4. Champs obligatoires manquants (HTTP 400)
 * 5. Draft ID invalide (format non conforme -> HTTP 400)
 * 6. File kind invalide (autre que video/photo -> HTTP 400)
 * 7. Type MIME invalide (HTTP 400)
 * 8. Extension invalide (HTTP 400)
 * 9. Vidéo trop volumineuse (> 5 Go -> HTTP 400)
 * 10. Photo trop volumineuse (> 25 Mo -> HTTP 400)
 * 11. Échec RPC base de données (HTTP 500)
 * 12. RPC renvoie un résultat infructueux (data.success: false -> HTTP 500)
 * 13. Adaptateur R2 indisponible (HTTP 503)
 * 14. Échec de génération d'URL présignée (HTTP 500)
 * 15. Aucune storage_key divulguée dans la réponse
 * 16. Aucun draft_token divulgué dans la réponse
 * 17. Aucun identifiant ou secret R2 divulgué
 * 18. Expiration présignée n'excède jamais 900 secondes
 */

import { describe, it, expect, vi } from "vitest";
import server, { handleUploadIntentRoute } from "../server";
import { S3CompatibleR2Adapter } from "../lib/r2-backend";

describe("MÉMORA Phase 3.0 / Étape 2 — POST /api/upload/intent Unit Tests", () => {
  const dummyR2Config = {
    accountId: "0123456789abcdef0123456789abcdef",
    accessKeyId: "validaccesskey1234",
    secretAccessKey: "validsecretaccesskey12345678",
    bucketName: "memora-videos",
  };

  const s3Adapter = new S3CompatibleR2Adapter(dummyR2Config);

  const createMockSupabase = (customRpcHandler?: (args: any) => Promise<{ data: any; error: any }>) => ({
    rpc: vi.fn().mockImplementation(async (fn: string, args: any) => {
      if (fn === "create_upload_intent") {
        if (customRpcHandler) return customRpcHandler(args);
        return {
          data: {
            success: true,
            intent_id: "550e8400-e29b-41d4-a716-446655440000",
            storage_key: `staging/${args.p_draft_id}/550e8400-e29b-41d4-a716-446655440000.${args.p_file_extension}`,
            expires_at: new Date(Date.now() + 7200000).toISOString(),
            status: "pending",
          },
          error: null,
        };
      }
      return { data: null, error: new Error("RPC unknown") };
    }),
  });

  const validVideoPayload = {
    draft_id: "dft_abc12345678",
    draft_token: "tok_super_secret_token_123456",
    item_id: "item_01",
    file_kind: "video",
    file_name: "souvenir_mariage.mp4",
    mime_type: "video/mp4",
    file_size_bytes: 14582910,
    file_extension: "mp4",
  };

  const validPhotoPayload = {
    draft_id: "dft_abc12345678",
    draft_token: "tok_super_secret_token_123456",
    item_id: "item_02",
    file_kind: "photo",
    file_name: "portrait_famille.jpg",
    mime_type: "image/jpeg",
    file_size_bytes: 2450000,
    file_extension: "jpg",
  };

  // --------------------------------------------------------------------------
  // 1 & 2. REQUÊTES VALIDES (VIDÉO & PHOTO)
  // --------------------------------------------------------------------------
  it("1. handles valid video upload intent successfully (HTTP 200)", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.intent_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(data.upload_url).toContain("X-Amz-Signature=");
    expect(data.required_headers).toEqual({ "Content-Type": "video/mp4" });
    expect(data.expires_at).toBeDefined();

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("create_upload_intent", {
      p_draft_id: validVideoPayload.draft_id,
      p_draft_token: validVideoPayload.draft_token,
      p_file_kind: "video",
      p_file_name: validVideoPayload.file_name,
      p_mime_type: "video/mp4",
      p_file_size_bytes: validVideoPayload.file_size_bytes,
      p_file_extension: "mp4",
      p_item_id: "item_01",
    });
  });

  it("2. handles valid photo upload intent successfully (HTTP 200)", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPhotoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.required_headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  // --------------------------------------------------------------------------
  // 3 & 4. VALIDATION JSON ET CHAMPS MANQUANTS
  // --------------------------------------------------------------------------
  it("3. rejects invalid JSON with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json-body",
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/JSON invalide/);
  });

  it("4. rejects missing required fields with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const missingToken = { ...validVideoPayload, draft_token: "" };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(missingToken),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/draft_token/);
  });

  // --------------------------------------------------------------------------
  // 5 & 6. VALIDATION DRAFT ID ET FILE KIND
  // --------------------------------------------------------------------------
  it("5. rejects invalid draft_id format with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const badDraftId = { ...validVideoPayload, draft_id: "ab" }; // trop court (<3)
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badDraftId),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/draft_id/);
  });

  it("6. rejects invalid file_kind with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const badKind = { ...validVideoPayload, file_kind: "audio" };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badKind),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/file_kind/);
  });

  // --------------------------------------------------------------------------
  // 7 & 8. VALIDATION MIME TYPE ET EXTENSION
  // --------------------------------------------------------------------------
  it("7. rejects invalid MIME type with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const badMime = { ...validVideoPayload, mime_type: "application/pdf" };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badMime),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/MIME/);
  });

  it("8. rejects invalid extension with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const badExt = { ...validVideoPayload, file_extension: "avi" };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badExt),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Extension/);
  });

  // --------------------------------------------------------------------------
  // 9 & 10. FICHIERS TROP VOLUMINEUX
  // --------------------------------------------------------------------------
  it("9. rejects oversized video (> 5 Go) with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const bigVideo = { ...validVideoPayload, file_size_bytes: 5368709121 };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bigVideo),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Fichier vidéo trop volumineux/);
  });

  it("10. rejects oversized photo (> 25 Mo) with HTTP 400", async () => {
    const supabaseAdmin = createMockSupabase();
    const bigPhoto = { ...validPhotoPayload, file_size_bytes: 26214401 };
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bigPhoto),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Fichier photo trop volumineux/);
  });

  // --------------------------------------------------------------------------
  // 11 & 12. ERREURS DATABASE RPC
  // --------------------------------------------------------------------------
  it("11. handles database RPC error gracefully (HTTP 500 without leaking stack)", async () => {
    const supabaseAdmin = createMockSupabase(async () => ({
      data: null,
      error: { message: "Internal connection timeout" },
    }));

    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Erreur lors de la création de l'intention d'upload");
    expect(data.error).not.toContain("timeout");
  });

  it("11b. handles database quota exceeded error with HTTP 429", async () => {
    const supabaseAdmin = createMockSupabase(async () => ({
      data: null,
      error: { message: "Quota de fichiers atteint pour ce panier (max 20)" },
    }));

    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/Quota de fichiers atteint/);
  });

  it("12. handles RPC returning unsuccessful result with HTTP 500", async () => {
    const supabaseAdmin = createMockSupabase(async () => ({
      data: { success: false, reason: "draft_closed" },
      error: null,
    }));

    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Échec de création de l'intention d'upload");
  });

  // --------------------------------------------------------------------------
  // 13 & 14. GESTION DES ERREURS R2 ADAPTER
  // --------------------------------------------------------------------------
  it("13. returns HTTP 503 if R2 S3 adapter cannot be initialized", async () => {
    const supabaseAdmin = createMockSupabase();
    // Pas d'adaptateur injecté et env vide sans variables R2
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Service de stockage Cloudflare R2 non disponible");
  });

  it("14. handles Presigned URL generation failure with HTTP 500", async () => {
    const supabaseAdmin = createMockSupabase();
    const failingAdapter = {
      getPresignedPutUrl: vi.fn().mockRejectedValue(new Error("Crypto failure")),
    } as any;

    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter: failingAdapter });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Échec de génération de l'URL d'upload");
  });

  // --------------------------------------------------------------------------
  // 15, 16, 17. SÉCURITÉ ABSOLUE : NON-DIVULGATION
  // --------------------------------------------------------------------------
  it("15. never returns internal storage_key property to the client", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    const data = await res.json();
    expect(data.storage_key).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('"storage_key"');
  });

  it("16. never returns draft_token or draft_token_hash to the client", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    const data = await res.json();
    expect(data.draft_token).toBeUndefined();
    expect(data.draft_token_hash).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(validVideoPayload.draft_token);
  });

  it("17. never returns secret credentials or service_role key to client", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    const text = await res.text();
    expect(text).not.toContain(dummyR2Config.secretAccessKey);
    expect(text).not.toContain("service_role");
  });

  // --------------------------------------------------------------------------
  // 18. EXPIRATION DE L'URL PRÉSIGNÉE
  // --------------------------------------------------------------------------
  it("18. ensures presigned URL expiration is locked to 900 seconds maximum", async () => {
    const supabaseAdmin = createMockSupabase();
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validVideoPayload),
    });

    const res = await handleUploadIntentRoute(req, {}, { supabaseAdmin, s3Adapter });
    const data = await res.json();
    const url = new URL(data.upload_url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");

    const expiresAtMs = new Date(data.expires_at).getTime();
    const nowMs = Date.now();
    const diffSeconds = (expiresAtMs - nowMs) / 1000;
    expect(diffSeconds).toBeGreaterThan(800);
    expect(diffSeconds).toBeLessThanOrEqual(905);
  });

  // --------------------------------------------------------------------------
  // ROUTAGE INTÉGRÉ VIA SERVER.FETCH
  // --------------------------------------------------------------------------
  it("19. routes through server.default.fetch correctly", async () => {
    const env = {
      R2_ACCOUNT_ID: dummyR2Config.accountId,
      R2_ACCESS_KEY_ID: dummyR2Config.accessKeyId,
      R2_SECRET_ACCESS_KEY: dummyR2Config.secretAccessKey,
      R2_BUCKET_NAME: dummyR2Config.bucketName,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "mock_service_key",
    };

    // Mock global fetch or mock supabase client within env
    const req = new Request("http://localhost:3000/api/upload/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const res = await server.fetch(req, env, {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON invalide/);
  });
});
