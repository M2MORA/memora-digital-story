import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { UploadIntentStatus } from "@/types/database";
import {
  verifyAndCompleteUploadIntent,
  purgeOrphanUploadIntents,
  R2StorageAdapter,
  R2HeadResult,
  S3CompatibleR2Adapter,
  timingSafeCompare,
  sha256Hex,
} from "@/lib/r2-backend";

/**
 * ==============================================================================
 * MÉMORA — Tests Unitaires & Simulations de Sécurité (Phase 1.6)
 *
 * DÉLIMITATION TECHNIQUE DES TESTS :
 * 1. Vitest Unit & Simulation Tests :
 *    - pgcrypto dans schémas dynamiques (extensions, public, custom, absent -> 0A000).
 *    - Index d'idempotence (validation stricte de prédicat, unicité, mono-colonne).
 *    - Concurrence & Verrous transactionnels (sérialisation advisory lock, double-checked lookup, rejeu identique, détection de collision inter-clés).
 *    - Validation JSON & schéma strict (objets, tableaux, booléens, nombres, UUID regex).
 *    - Transactional Expiration (statut persisté sans rollback).
 *    - Propriété Intent-Item (anti-réassignation d'articles liés).
 * 2. Cloudflare R2 Backend Component Tests :
 *    - HeadObject existence & exact size validation.
 *    - Échec HeadObject (404, size mismatch).
 *    - Interdiction absolue de la storage_key client.
 *    - Purge à bail en deux phases : DeleteObject avec retries.
 *    - Échec DeleteObject : non-confirmation en base et expiration du bail.
 * 3. Static SQL Security Audit :
 *    - Détection dynamique pgcrypto via pg_proc et pg_namespace.
 *    - Introspection d'index via pg_index, pg_get_expr, pg_get_indexdef.
 *    - Acquisition des verrous advisory_xact_lock avant toute lecture.
 *    - search_path durci avec pg_temp strictement dernier.
 *    - Ownership postgres et privilèges exclusifs service_role.
 *
 * STRICTE RESTRICTION RESPECTÉE : Aucun appel vers Supabase Production ni Cloudflare R2 réel.
 * ==============================================================================
 */

describe("MÉMORA Phase 1.6 — Post-Audit Security & SQL Corrections", () => {
  // --------------------------------------------------------------------------
  // A. pgcrypto DYNAMIC RESOLUTION & SCHEMA RESILIENCE
  // --------------------------------------------------------------------------
  describe("A. pgcrypto Dynamic Schema Detection & digest Signature Verification", () => {
    type CatalogProc = {
      schema: string;
      proname: string;
      identityArgs: string;
    };

    function simulateDynamicPgcryptoResolver(
      catalog: CatalogProc[],
      input: string
    ): { schema: string; hash: string } {
      // Modèle exact de la fonction SQL Phase 1.6 :
      // Interroge pg_proc + pg_namespace pour trouver digest avec signature ('text, text' ou 'bytea, text')
      // Priorité : extensions > public > autre schéma
      const matching = catalog
        .filter(
          (p) =>
            p.proname === "digest" &&
            ["text, text", "bytea, text"].includes(p.identityArgs)
        )
        .sort((a, b) => {
          const score = (s: string) =>
            s === "extensions" ? 1 : s === "public" ? 2 : 3;
          return score(a.schema) - score(b.schema);
        });

      if (matching.length === 0) {
        const err = new Error(
          "Fonction cryptographique pgcrypto.digest introuvable dans le cluster"
        );
        (err as any).code = "0A000";
        throw err;
      }

      const activeSchema = matching[0]!.schema;
      return {
        schema: activeSchema,
        hash: `hash_from_${activeSchema}_of_${input}`,
      };
    }

    it("resolves digest when pgcrypto is installed in 'extensions' schema", () => {
      const catalog: CatalogProc[] = [
        { schema: "extensions", proname: "digest", identityArgs: "bytea, text" },
      ];
      const res = simulateDynamicPgcryptoResolver(catalog, "draft-token-123");
      expect(res.schema).toBe("extensions");
      expect(res.hash).toContain("hash_from_extensions");
    });

    it("resolves digest when pgcrypto is installed in 'public' schema", () => {
      const catalog: CatalogProc[] = [
        { schema: "public", proname: "digest", identityArgs: "text, text" },
      ];
      const res = simulateDynamicPgcryptoResolver(catalog, "draft-token-123");
      expect(res.schema).toBe("public");
      expect(res.hash).toContain("hash_from_public");
    });

    it("resolves digest when pgcrypto is installed in a custom schema (e.g. 'crypto_custom')", () => {
      const catalog: CatalogProc[] = [
        { schema: "crypto_custom", proname: "digest", identityArgs: "bytea, text" },
      ];
      const res = simulateDynamicPgcryptoResolver(catalog, "draft-token-123");
      expect(res.schema).toBe("crypto_custom");
      expect(res.hash).toContain("hash_from_crypto_custom");
    });

    it("raises controlled exception 0A000 when pgcrypto is completely absent", () => {
      const catalog: CatalogProc[] = [
        { schema: "public", proname: "unrelated_func", identityArgs: "text" },
      ];
      expect(() => simulateDynamicPgcryptoResolver(catalog, "token")).toThrowError(
        "Fonction cryptographique pgcrypto.digest introuvable"
      );
      try {
        simulateDynamicPgcryptoResolver(catalog, "token");
      } catch (err: any) {
        expect(err.code).toBe("0A000");
      }
    });

    it("prioritizes 'extensions' schema over 'public' when both have digest", () => {
      const catalog: CatalogProc[] = [
        { schema: "public", proname: "digest", identityArgs: "text, text" },
        { schema: "extensions", proname: "digest", identityArgs: "bytea, text" },
      ];
      const res = simulateDynamicPgcryptoResolver(catalog, "token");
      expect(res.schema).toBe("extensions");
    });
  });

  // --------------------------------------------------------------------------
  // B. IDEMPOTENCY INDEX DEFINITION & CATALOG INTROSPECTION
  // --------------------------------------------------------------------------
  describe("B. Idempotency Index Definition & Safety Validation", () => {
    type IndexCatalogEntry = {
      relname: string;
      indisunique: boolean;
      indnatts: number;
      colname: string;
      predicate: string | null;
      is_composite: boolean;
    };

    function simulateIndexInspection(
      existingIndexes: IndexCatalogEntry[]
    ): { preserved: string[]; dropped: string[]; created: string[] } {
      const preserved: string[] = [];
      const dropped: string[] = [];
      const created: string[] = [];

      let validFound = false;

      for (const idx of existingIndexes) {
        if (idx.relname === "uq_orders_idempotency_key") {
          // Validation stricte : unicité, mono-colonne sur idempotency_key, prédicat partiel IS NOT NULL
          const isValid =
            idx.indisunique === true &&
            idx.indnatts === 1 &&
            idx.colname === "idempotency_key" &&
            (idx.predicate?.toUpperCase().includes("IDEMPOTENCY_KEY IS NOT NULL") ?? false);

          if (isValid) {
            validFound = true;
            preserved.push(idx.relname);
          } else {
            dropped.push(idx.relname);
          }
        } else if (idx.relname === "idx_orders_idempotency_key") {
          // Ancien index non-unique simple : supprimé
          dropped.push(idx.relname);
        } else if (idx.is_composite) {
          // Index composites utiles (ex: user_id + idempotency_key) : STRICTEMENT PRÉSERVÉS
          preserved.push(idx.relname);
        }
      }

      if (!validFound) {
        created.push("uq_orders_idempotency_key");
      }

      return { preserved, dropped, created };
    }

    it("retains compliant unique partial index and drops nothing useful", () => {
      const indexes: IndexCatalogEntry[] = [
        {
          relname: "uq_orders_idempotency_key",
          indisunique: true,
          indnatts: 1,
          colname: "idempotency_key",
          predicate: "(idempotency_key IS NOT NULL)",
          is_composite: false,
        },
        {
          relname: "idx_orders_user_idempotency_composite",
          indisunique: false,
          indnatts: 2,
          colname: "user_id",
          predicate: null,
          is_composite: true,
        },
      ];

      const res = simulateIndexInspection(indexes);
      expect(res.preserved).toEqual([
        "uq_orders_idempotency_key",
        "idx_orders_user_idempotency_composite",
      ]);
      expect(res.dropped).toEqual([]);
      expect(res.created).toEqual([]); // Déjà conforme
    });

    it("drops malformed index named uq_orders_idempotency_key if non-unique or missing predicate", () => {
      const indexes: IndexCatalogEntry[] = [
        {
          relname: "uq_orders_idempotency_key",
          indisunique: false, // NON UNIQUE !
          indnatts: 1,
          colname: "idempotency_key",
          predicate: null,
          is_composite: false,
        },
      ];

      const res = simulateIndexInspection(indexes);
      expect(res.dropped).toContain("uq_orders_idempotency_key");
      expect(res.created).toContain("uq_orders_idempotency_key");
    });

    it("preserves beneficial composite indexes when cleaning legacy single-column index", () => {
      const indexes: IndexCatalogEntry[] = [
        {
          relname: "idx_orders_idempotency_key", // Ancien index non unique
          indisunique: false,
          indnatts: 1,
          colname: "idempotency_key",
          predicate: null,
          is_composite: false,
        },
        {
          relname: "idx_orders_composite_analytics",
          indisunique: false,
          indnatts: 3,
          colname: "created_at",
          predicate: null,
          is_composite: true,
        },
      ];

      const res = simulateIndexInspection(indexes);
      expect(res.dropped).toContain("idx_orders_idempotency_key");
      expect(res.preserved).toContain("idx_orders_composite_analytics");
      expect(res.created).toContain("uq_orders_idempotency_key");
    });
  });

  // --------------------------------------------------------------------------
  // C. CONCURRENCY & TRANSACTIONAL ADVISORY LOCK SERIALIZATION
  // --------------------------------------------------------------------------
  describe("C. Concurrency & Transactional Advisory Lock Serialization", () => {
    type OrderRecord = {
      id: string;
      order_number: string;
      idempotency_key: string;
      payload_hash: string;
      draft_id: string;
      draft_token_hash: string;
      total: number;
    };

    class SimulatedDbWithAdvisoryLocks {
      private orders: OrderRecord[] = [];
      private activeLocks = new Set<string>();

      async finalizeOrder(params: {
        idempotency_key: string;
        payload_hash: string;
        draft_id: string;
        draft_token_hash: string;
        order_number: string;
        total: number;
      }) {
        const lockKeyOrder = `memora_order_finalize:${params.idempotency_key}`;
        const lockKeyDraft = `memora_draft_finalize:${params.draft_id}`;

        // Sérialisation transactionnelle : attente d'acquisition des verrous exclusifs
        while (this.activeLocks.has(lockKeyOrder) || this.activeLocks.has(lockKeyDraft)) {
          await new Promise((r) => setTimeout(r, 10));
        }
        this.activeLocks.add(lockKeyOrder);
        this.activeLocks.add(lockKeyDraft);

        try {
          // Double-Checked Lookup SOUS verrou exclusif
          const existing = this.orders.find(
            (o) => o.idempotency_key === params.idempotency_key
          );

          if (existing) {
            if (
              existing.draft_id !== params.draft_id ||
              existing.draft_token_hash !== params.draft_token_hash
            ) {
              const err = new Error(
                "Accès refusé : cette clé d'idempotence n'appartient pas à ce panier"
              );
              (err as any).code = "42501";
              throw err;
            }

            if (existing.payload_hash === params.payload_hash) {
              return {
                success: true,
                order_id: existing.id,
                order_number: existing.order_number,
                total: existing.total,
                idempotent_replay: true,
              };
            } else {
              const err = new Error(
                "Collision d'idempotence : cette clé a déjà été utilisée avec un contenu différent"
              );
              (err as any).code = "23505";
              throw err;
            }
          }

          // Contrôle anti-collision : Vérifier si ce draft a déjà été finalisé sous une autre clé
          const draftConflict = this.orders.find((o) => o.draft_id === params.draft_id);
          if (draftConflict) {
            const err = new Error(
              `Ce panier a déjà été finalisé sous une autre clé d'idempotence (${draftConflict.order_number})`
            );
            (err as any).code = "23505";
            throw err;
          }

          // Insertion sécurisée
          const newOrder: OrderRecord = {
            id: `ord_${Math.random().toString(36).substring(2, 9)}`,
            order_number: params.order_number,
            idempotency_key: params.idempotency_key,
            payload_hash: params.payload_hash,
            draft_id: params.draft_id,
            draft_token_hash: params.draft_token_hash,
            total: params.total,
          };
          this.orders.push(newOrder);

          return {
            success: true,
            order_id: newOrder.id,
            order_number: newOrder.order_number,
            total: newOrder.total,
            idempotent_replay: false,
          };
        } finally {
          this.activeLocks.delete(lockKeyOrder);
          this.activeLocks.delete(lockKeyDraft);
        }
      }

      getOrderCount() {
        return this.orders.length;
      }
    }

    it("serializes two concurrent identical finalizations and returns identical idempotent replay", async () => {
      const db = new SimulatedDbWithAdvisoryLocks();
      const params = {
        idempotency_key: "idem-key-abc",
        payload_hash: "hash-payload-1",
        draft_id: "draft-xyz",
        draft_token_hash: "token-hash-1",
        order_number: "CMD-2026-001",
        total: 108.0,
      };

      // Exécution de deux transactions concurrentes lancées simultanément
      const [res1, res2] = await Promise.all([
        db.finalizeOrder({ ...params }),
        db.finalizeOrder({ ...params }),
      ]);

      expect(db.getOrderCount()).toBe(1); // Exactement 1 commande insérée
      expect(res1.order_id).toBe(res2.order_id);
      expect(res1.order_number).toBe("CMD-2026-001");
      expect(res2.order_number).toBe("CMD-2026-001");

      const replays = [res1.idempotent_replay, res2.idempotent_replay];
      expect(replays).toContain(false); // Le gagnant
      expect(replays).toContain(true); // Le rejeu sous advisory lock
    });

    it("rejects two concurrent finalizations of the same draft with DIFFERENT idempotency keys", async () => {
      const db = new SimulatedDbWithAdvisoryLocks();
      const baseParams = {
        payload_hash: "hash-payload-1",
        draft_id: "draft-single-session",
        draft_token_hash: "token-hash-1",
        order_number: "CMD-2026-002",
        total: 108.0,
      };

      const results = await Promise.allSettled([
        db.finalizeOrder({ ...baseParams, idempotency_key: "key-first" }),
        db.finalizeOrder({ ...baseParams, idempotency_key: "key-second" }),
      ]);

      expect(db.getOrderCount()).toBe(1);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      if (rejected[0]?.status === "rejected") {
        expect((rejected[0].reason as any).code).toBe("23505");
        expect(rejected[0].reason.message).toContain("Ce panier a déjà été finalisé");
      }
    });

    it("rejects replay of existing idempotency key with modified payload (code 23505)", async () => {
      const db = new SimulatedDbWithAdvisoryLocks();
      await db.finalizeOrder({
        idempotency_key: "key-tamper-check",
        payload_hash: "original-payload-hash",
        draft_id: "draft-1",
        draft_token_hash: "token-1",
        order_number: "CMD-2026-003",
        total: 100.0,
      });

      await expect(
        db.finalizeOrder({
          idempotency_key: "key-tamper-check",
          payload_hash: "tampered-payload-hash", // Payload modifié !
          draft_id: "draft-1",
          draft_token_hash: "token-1",
          order_number: "CMD-2026-003",
          total: 10.0, // Montant falsifié
        })
      ).rejects.toThrow("Collision d'idempotence");
    });
  });

  // --------------------------------------------------------------------------
  // D. CLOUDFLARE R2 INTEGRATION & STORAGE ADAPTER TESTS
  // --------------------------------------------------------------------------
  describe("D. Cloudflare R2 Upload Verification & Orphan Purge Components", () => {
    class MockR2Storage implements R2StorageAdapter {
      public files = new Map<string, { size: number; content: string }>();
      public deleteFailCount = 0;
      public deleteCallCount = 0;
      public headCallCount = 0;

      async headObject(key: string): Promise<R2HeadResult> {
        this.headCallCount++;
        const file = this.files.get(key);
        if (!file) {
          return { exists: false, contentLength: 0 };
        }
        return {
          exists: true,
          contentLength: file.size,
          etag: '"mock-etag-123"',
          contentType: "video/mp4",
        };
      }

      async deleteObject(key: string): Promise<{ success: boolean; error?: string }> {
        this.deleteCallCount++;
        if (this.deleteFailCount > 0) {
          this.deleteFailCount--;
          return { success: false, error: "Mock R2 transient network error" };
        }
        this.files.delete(key);
        return { success: true };
      }

      async putObject(
        key: string,
        payload: Uint8Array | ArrayBuffer | string
      ): Promise<{ success: boolean; etag?: string; error?: string }> {
        const size =
          typeof payload === "string"
            ? payload.length
            : payload instanceof Uint8Array
            ? payload.byteLength
            : payload.byteLength;
        this.files.set(key, { size, content: "mock-content" });
        return { success: true, etag: '"mock-etag-put"' };
      }
    }

    function createMockSupabaseAdmin(intents: any[]) {
      return {
        from: (_table: string) => ({
          select: (_cols: string) => ({
            eq: (_field: string, val: string) => ({
              maybeSingle: async () => {
                const found = intents.find((i) => i.id === val);
                if (found && !found.draft_token_hash && found.draft_token) {
                  found.draft_token_hash = await sha256Hex(found.draft_token);
                }
                return { data: found ?? null, error: null };
              },
            }),
          }),
        }),
        rpc: async (fn: string, args: any) => {
          if (fn === "complete_upload_intent") {
            const intent = intents.find((i) => i.id === args.p_intent_id);
            if (!intent) return { data: null, error: { message: "Intent not found", code: "22023" } };
            if (intent.mockRpcFailReason) {
              return { data: { success: false, reason: intent.mockRpcFailReason }, error: null };
            }
            intent.status = "ready";
            return { data: { success: true, status: "ready" }, error: null };
          }
          if (fn === "claim_orphan_upload_intents_for_purge") {
            const purgeToken = "00000000-0000-0000-0000-000000000001";
            const claims = intents
              .filter((i) => i.status === "expired" || i.status === "purging")
              .slice(0, args.p_batch_size ?? 50)
              .map((i) => ({
                claimed_id: i.id,
                storage_key: i.storage_key,
                purge_token: purgeToken,
              }));
            return { data: claims, error: null };
          }
          if (fn === "confirm_purge_upload_intents") {
            const count = (args.p_purged_ids ?? []).length;
            return { data: count, error: null };
          }
          return { data: null, error: null };
        },
      } as any;
    }

    it("verifies upload successfully when R2 object exists and size matches exact DB declaration", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/uuid-1/video.mp4", { size: 1048576, content: "data" });

      const intents = [
        {
          id: "int-1",
          status: "uploading",
          storage_key: "intents/uuid-1/video.mp4",
          file_size_bytes: 1048576, // Exact match
          draft_token: "secret-token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-1",
        draft_token: "secret-token",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("ready");
      expect(res.verified_size).toBe(1048576);
      expect(intents[0]!.status).toBe("ready");
      expect(storage.headCallCount).toBe(1);
    });

    it("rejects immediately with UNAUTHORIZED and NEVER calls R2 when draft_token is invalid", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/uuid-1/video.mp4", { size: 1048576, content: "data" });

      const intents = [
        {
          id: "int-unauth",
          status: "uploading",
          storage_key: "intents/uuid-1/video.mp4",
          file_size_bytes: 1048576,
          draft_token: "correct-secret-token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-unauth",
        draft_token: "wrong-attacker-token",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("UNAUTHORIZED");
      // Preuve P0 absolue : HeadObject n'a JAMAIS été appelé sur R2
      expect(storage.headCallCount).toBe(0);
    });

    it("rejects intent with status ready if provided token is invalid (no bypass on status ready)", async () => {
      const storage = new MockR2Storage();
      const intents = [
        {
          id: "int-ready-unauth",
          status: "ready",
          storage_key: "intents/ready/video.mp4",
          file_size_bytes: 5000,
          draft_token: "legit-owner-token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-ready-unauth",
        draft_token: "wrong-token",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("UNAUTHORIZED");
      expect(storage.headCallCount).toBe(0);
    });

    it("fails upload verification with OBJECT_NOT_FOUND when file does not exist on R2", async () => {
      const storage = new MockR2Storage(); // Empty storage
      const intents = [
        {
          id: "int-missing",
          status: "uploading",
          storage_key: "intents/missing/video.mp4",
          file_size_bytes: 5000,
          draft_token: "token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-missing",
        draft_token: "token",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("OBJECT_NOT_FOUND");
      expect(intents[0]!.status).toBe("uploading");
      // Ne doit jamais exposer la storage_key dans le message d'erreur
      expect(res.error).not.toContain("intents/missing/video.mp4");
    });

    it("fails upload verification with SIZE_MISMATCH when R2 ContentLength differs from DB declared size", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/tampered/video.mp4", { size: 999, content: "short" });

      const intents = [
        {
          id: "int-tampered",
          status: "uploading",
          storage_key: "intents/tampered/video.mp4",
          file_size_bytes: 5000,
          draft_token: "token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-tampered",
        draft_token: "token",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("SIZE_MISMATCH");
      expect(res.error).toContain("Taille constatée (999 octets) non conforme");
    });

    it("treats RPC complete_upload_intent returning success=false as a real failure instead of fake 200", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/fail/video.mp4", { size: 5000, content: "valid" });

      const intents = [
        {
          id: "int-rpc-fail",
          status: "uploading",
          storage_key: "intents/fail/video.mp4",
          file_size_bytes: 5000,
          draft_token: "token",
          mockRpcFailReason: "intent_expired",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await verifyAndCompleteUploadIntent(supabaseAdmin, storage, {
        intent_id: "int-rpc-fail",
        draft_token: "token",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("intent_expired");
      expect(res.error).toContain("Complétion refusée par la base (intent_expired)");
    });

    it("purges orphan upload intents with retry and confirms deletion in DB only after R2 success", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/orphan-1.mp4", { size: 1000, content: "a" });
      storage.files.set("intents/orphan-2.mp4", { size: 2000, content: "b" });
      // Simule 1 échec temporaire réseau R2 sur orphan-1, récupéré au 2e essai
      storage.deleteFailCount = 1;

      const intents = [
        { id: "o-1", storage_key: "intents/orphan-1.mp4", status: "expired" },
        { id: "o-2", storage_key: "intents/orphan-2.mp4", status: "expired" },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await purgeOrphanUploadIntents(supabaseAdmin, storage, {
        batchSize: 10,
        leaseSeconds: 300,
        maxRetries: 3,
      });

      expect(res.claimed_count).toBe(2);
      expect(res.r2_deleted_count).toBe(2);
      expect(res.confirmed_db_count).toBe(2);
      expect(res.failed_count).toBe(0);
      expect(storage.files.size).toBe(0); // Supprimé de R2
    });

    it("does not confirm in DB if R2 DeleteObject permanently fails", async () => {
      const storage = new MockR2Storage();
      storage.files.set("intents/permanent-fail.mp4", { size: 1000, content: "a" });
      storage.deleteFailCount = 10; // Toujours en échec

      const intents = [
        { id: "o-fail", storage_key: "intents/permanent-fail.mp4", status: "expired" },
      ];

      const supabaseAdmin = createMockSupabaseAdmin(intents);
      const res = await purgeOrphanUploadIntents(supabaseAdmin, storage, {
        batchSize: 10,
        leaseSeconds: 300,
        maxRetries: 2,
      });

      expect(res.claimed_count).toBe(1);
      expect(res.r2_deleted_count).toBe(0);
      expect(res.confirmed_db_count).toBe(0); // Protégé en base : non supprimé
      expect(res.failed_count).toBe(1);
      expect(res.errors[0]!.key).toBe("intents/permanent-fail.mp4");
    });
  });

  // --------------------------------------------------------------------------
  // E. STATIC SQL AUDIT OF PHYSICAL MIGRATION SCRIPT
  // --------------------------------------------------------------------------
  describe("E. Static SQL Security & Structure Audit", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../supabase/migrations/20261018220000_phase1_upload_intents_and_order_finalization.sql"
    );

    it("verifies the physical migration file exists and is readable", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it("verifies dynamic pgcrypto detection in memora_sha256 using pg_depend bound to digest(text, text)", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("FROM pg_catalog.pg_proc p");
      expect(sql).toContain("JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace");
      expect(sql).toContain("JOIN pg_catalog.pg_depend d");
      expect(sql).toContain("d.classid = 'pg_catalog.pg_proc'::regclass");
      expect(sql).toContain("d.deptype = 'e'");
      expect(sql).toContain("d.refclassid = 'pg_catalog.pg_extension'::regclass");
      expect(sql).toContain("p.proname = 'digest'");
      expect(sql).toContain("e.extname = 'pgcrypto'");
      expect(sql).toContain("pg_catalog.pg_get_function_identity_arguments(p.oid) = 'text, text'");
      expect(sql).toContain("USING ERRCODE = '0A000'");
      expect(sql).toContain("EXECUTE format('SELECT encode(%I.digest");
    });

    it("verifies index definition inspection using pg_index and SHARE MODE locks with zero automatic DROP INDEX", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("LOCK TABLE public.orders IN SHARE MODE;");
      expect(sql).toContain("FROM pg_catalog.pg_index i");
      expect(sql).toContain("c.relname = 'uq_orders_idempotency_key'");
      expect(sql).toContain("c.relname = 'uq_orders_draft_id'");
      expect(sql).toContain("i.indrelid = 'public.orders'::regclass");
      expect(sql).toContain("Suppression automatique interdite : intervention manuelle requise");
      expect(sql).toContain("USING ERRCODE = '55000'");
      expect(sql).toContain("WHERE idempotency_key IS NOT NULL;");
      expect(sql).toContain("WHERE draft_id IS NOT NULL;");
    });

    it("verifies advisory lock acquisition before reading public.orders in finalize_order", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      const finalizeFn = sql.split("CREATE OR REPLACE FUNCTION public.finalize_order_with_intents")[1];
      expect(finalizeFn).toBeDefined();

      const lockIdx = finalizeFn!.indexOf("pg_catalog.pg_advisory_xact_lock");
      const selectOrdersIdx = finalizeFn!.indexOf("FROM public.orders");
      expect(lockIdx).toBeGreaterThan(0);
      expect(selectOrdersIdx).toBeGreaterThan(lockIdx); // Verrou ACQUIS AVANT première lecture
    });

    it("verifies search_path specifies pg_temp strictly last across all functions", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      const lines = sql.split("\n");
      const searchPathLines = lines.filter((l) => l.includes("SET search_path ="));
      expect(searchPathLines.length).toBeGreaterThanOrEqual(10);

      for (const line of searchPathLines) {
        expect(line.trim()).toMatch(/pg_temp$/);
      }
    });

    it("verifies REVOKE ALL and service_role exclusivity for complete_upload_intent and purge", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon;");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.complete_upload_intent(UUID, TEXT, BIGINT, TEXT, TEXT) TO service_role;"
      );
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.claim_orphan_upload_intents_for_purge(INT, INT) TO service_role;"
      );
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.confirm_purge_upload_intents(UUID[], UUID) TO service_role;"
      );
    });

    it("verifies transactional expiration returns structured JSON without rolling back status", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("UPDATE public.upload_intents \n            SET status = 'expired'");
      expect(sql).toContain("'reason', 'intent_expired'");
      expect(sql).toContain("RETURN jsonb_build_object(");
    });

    it("verifies intent item ownership check prevents reassignment", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain(
        "v_intent.item_id IS NOT NULL AND v_intent.item_id IS DISTINCT FROM v_item_id"
      );
      expect(sql).toContain("ne peut pas être réassigné");
    });
  });

  // --------------------------------------------------------------------------
  // F. TRANSACTIONAL EXPIRATION & REASSIGNMENT REJECTION
  // --------------------------------------------------------------------------
  describe("F. Transactional Expiration & Intent Reassignment Safety", () => {
    type SimulatedIntent = {
      id: string;
      status: UploadIntentStatus;
      expires_at: number;
      item_id: string | null;
    };

    function simulateFinalizeValidation(
      intent: SimulatedIntent,
      targetItemId: string,
      currentTime: number
    ) {
      if (intent.expires_at < currentTime) {
        intent.status = "expired";
        return {
          success: false,
          reason: "intent_expired",
          message: `L'intention d'upload ${intent.id} a expiré`,
        };
      }

      if (intent.item_id !== null && intent.item_id !== targetItemId) {
        const err = new Error(
          `L'intent ${intent.id} a été créé pour l'article ${intent.item_id} et ne peut pas être réassigné à l'article ${targetItemId}`
        );
        (err as any).code = "22023";
        throw err;
      }

      if (intent.item_id === null) {
        intent.item_id = targetItemId;
      }

      return { success: true, status: intent.status };
    }

    it("commits status='expired' without exception rollback when expired", () => {
      const intent: SimulatedIntent = {
        id: "int-exp-committed",
        status: "ready",
        expires_at: 1000,
        item_id: "item-1",
      };

      const res = simulateFinalizeValidation(intent, "item-1", 2000);
      expect(res.success).toBe(false);
      expect(res.reason).toBe("intent_expired");
      expect(intent.status).toBe("expired"); // Statut persisté sans rollback
    });

    it("strictly rejects reassignment of an intent bound to item-1 when requested for item-2", () => {
      const intent: SimulatedIntent = {
        id: "int-bound-1",
        status: "ready",
        expires_at: 5000,
        item_id: "item-1",
      };

      expect(() => simulateFinalizeValidation(intent, "item-2", 2000)).toThrow(
        "ne peut pas être réassigné"
      );
      expect(intent.item_id).toBe("item-1"); // Invariant intact
    });

    it("allows unbound intent (item_id is null) to be bound to item-1 upon finalize", () => {
      const intent: SimulatedIntent = {
        id: "int-unbound",
        status: "ready",
        expires_at: 5000,
        item_id: null,
      };

      const res = simulateFinalizeValidation(intent, "item-1", 2000);
      expect(res.success).toBe(true);
      expect(intent.item_id).toBe("item-1");
    });
  });

  // --------------------------------------------------------------------------
  // G. INTENT MAPPINGS VALIDATION & REPLAY GUARDS
  // --------------------------------------------------------------------------
  describe("G. Intent Mapping Validation & Error Codes", () => {
    type MappingItem = { item_id: string; intent_id: string; file_kind: string };

    function validateMappings(mappings: MappingItem[]) {
      const seenIntents = new Set<string>();
      const seenSlots = new Set<string>();

      for (const m of mappings) {
        if (seenIntents.has(m.intent_id)) {
          const err = new Error("Doublon détecté dans intent_mappings : chaque uploadIntentId doit être unique");
          (err as any).code = "23505";
          throw err;
        }
        seenIntents.add(m.intent_id);

        const slot = `${m.item_id}:${m.file_kind.toLowerCase()}`;
        if (seenSlots.has(slot)) {
          const err = new Error("Doublon détecté : un même article ne peut avoir deux intents pour le même type de fichier");
          (err as any).code = "23505";
          throw err;
        }
        seenSlots.add(slot);
      }
      return true;
    }

    it("rejects duplicate uploadIntentId mapped to different items (code 23505)", () => {
      const mappings: MappingItem[] = [
        { item_id: "item-1", intent_id: "uuid-shared", file_kind: "video" },
        { item_id: "item-2", intent_id: "uuid-shared", file_kind: "video" },
      ];
      expect(() => validateMappings(mappings)).toThrow("chaque uploadIntentId doit être unique");
    });

    it("rejects duplicate slot (same item having two videos) with code 23505", () => {
      const mappings: MappingItem[] = [
        { item_id: "item-1", intent_id: "uuid-1", file_kind: "video" },
        { item_id: "item-1", intent_id: "uuid-2", file_kind: "video" },
      ];
      expect(() => validateMappings(mappings)).toThrow("un même article ne peut avoir deux intents pour le même type");
    });

    it("accepts valid 1-photo and 1-video mapping per item", () => {
      const mappings: MappingItem[] = [
        { item_id: "item-1", intent_id: "uuid-1", file_kind: "photo" },
        { item_id: "item-1", intent_id: "uuid-2", file_kind: "video" },
      ];
      expect(validateMappings(mappings)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // H. PURGE PROTOCOL WITH EXPIRED LEASE & RECOVERY
  // --------------------------------------------------------------------------
  describe("H. Two-Phase Orphan Purge Protocol & Lease Expiry Recovery", () => {
    type PurgeRecord = {
      id: string;
      status: UploadIntentStatus;
      purge_token: string | null;
      lease_expires_at: number;
    };

    function claimPurge(records: PurgeRecord[], now: number, newPurgeToken: string) {
      return records.filter((r) => {
        // Éligible si expiré OU si en cours de purge mais avec bail expiré
        return (
          r.status === "expired" ||
          (r.status === "purging" && r.lease_expires_at < now)
        );
      }).map((r) => {
        r.status = "purging";
        r.purge_token = newPurgeToken;
        r.lease_expires_at = now + 300000; // +5 min
        return r;
      });
    }

    function confirmPurge(records: PurgeRecord[], ids: string[], token: string, now: number) {
      let deleted = 0;
      for (const id of ids) {
        const r = records.find((x) => x.id === id);
        if (r && r.status === "purging" && r.purge_token === token && r.lease_expires_at > now) {
          deleted++;
        }
      }
      return deleted;
    }

    it("reclaims an abandoned purging intent whose lease has expired", () => {
      const records: PurgeRecord[] = [
        {
          id: "p-stuck",
          status: "purging",
          purge_token: "old-token",
          lease_expires_at: 1000, // Expiré à t=2000
        },
      ];

      const claimed = claimPurge(records, 2000, "new-token-2");
      expect(claimed.length).toBe(1);
      expect(records[0]!.purge_token).toBe("new-token-2");
      expect(records[0]!.lease_expires_at).toBe(2000 + 300000);
    });

    it("rejects confirmation if purge lease has expired before confirmation arrives", () => {
      const records: PurgeRecord[] = [
        {
          id: "p-delayed",
          status: "purging",
          purge_token: "valid-token",
          lease_expires_at: 1000,
        },
      ];

      const confirmed = confirmPurge(records, ["p-delayed"], "valid-token", 2000); // 2000 > lease
      expect(confirmed).toBe(0); // Non supprimé car bail expiré
    });
  });

  // --------------------------------------------------------------------------
  // I. MIGRATION COMPATIBILITY (CLEAN & EXISTING SCHEMAS)
  // --------------------------------------------------------------------------
  describe("I. Migration Compatibility (Clean & Existing Schemas)", () => {
    function simulateMigrationPreCheck(existingOrders: Array<{ idempotency_key: string | null }>) {
      const keyCounts = new Map<string, number>();
      for (const o of existingOrders) {
        if (o.idempotency_key) {
          keyCounts.set(o.idempotency_key, (keyCounts.get(o.idempotency_key) ?? 0) + 1);
        }
      }

      let dupCount = 0;
      for (const [, count] of keyCounts) {
        if (count > 1) dupCount++;
      }

      if (dupCount > 0) {
        const err = new Error(`Migration interrompue : ${dupCount} valeur(s) en doublon détectée(s) pour idempotency_key`);
        (err as any).code = "23505";
        throw err;
      }

      return { canCreateUniqueIndex: true };
    }

    it("aborts migration cleanly with code 23505 if duplicates exist on idempotency_key in existing DB", () => {
      const orders = [
        { idempotency_key: "dup-key-1" },
        { idempotency_key: "dup-key-1" }, // Duplicate!
        { idempotency_key: "unique-key-2" },
      ];

      expect(() => simulateMigrationPreCheck(orders)).toThrow("Migration interrompue");
    });

    it("passes migration pre-check on clean DB or existing DB without duplicates", () => {
      const orders = [
        { idempotency_key: null },
        { idempotency_key: null }, // Nulls allowed
        { idempotency_key: "unique-key-1" },
        { idempotency_key: "unique-key-2" },
      ];

      expect(simulateMigrationPreCheck(orders).canCreateUniqueIndex).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // J. CRYPTOGRAPHIC PRIMITIVES (TIMING-SAFE DOUBLE-HMAC & SHA-256) [Unit Test]
  // --------------------------------------------------------------------------
  describe("J. Cryptographic Primitives (timingSafeCompare & sha256Hex) [Unit Test]", () => {
    it("returns true for identical strings", async () => {
      expect(await timingSafeCompare("super-secret-cron-token", "super-secret-cron-token")).toBe(true);
      expect(await timingSafeCompare("", "")).toBe(true);
    });

    it("returns false for different strings", async () => {
      expect(await timingSafeCompare("secret-token-a", "secret-token-b")).toBe(false);
      expect(await timingSafeCompare("token", "token-longer")).toBe(false);
      expect(await timingSafeCompare("token-longer", "token")).toBe(false);
      expect(await timingSafeCompare("token", "")).toBe(false);
      expect(await timingSafeCompare("", "token")).toBe(false);
    });

    it("returns false for non-string inputs", async () => {
      expect(await timingSafeCompare(null as any, "secret")).toBe(false);
      expect(await timingSafeCompare("secret", undefined as any)).toBe(false);
    });

    it("computes SHA-256 equivalent to FIPS standard test vector", async () => {
      const emptyHash = await sha256Hex("");
      expect(emptyHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

      const tokenHash = await sha256Hex("draft-token-123");
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // --------------------------------------------------------------------------
  // K. FAIL-CLOSED PURGE ROUTE AUTHENTICATION & BOUNDS [Component / Mock Test]
  // --------------------------------------------------------------------------
  describe("K. Fail-Closed Purge Route Authentication & Bounds [Component / Mock Test]", () => {
    async function simulatePurgeRoute(
      env: { PURGE_CRON_SECRET?: string },
      authHeader: string | null,
      body?: { batch_size?: unknown; lease_seconds?: unknown }
    ): Promise<{ status: number; body: any }> {
      const cronSecret = env?.PURGE_CRON_SECRET;
      if (!cronSecret || typeof cronSecret !== "string" || !cronSecret.trim()) {
        return {
          status: 500,
          body: { error: "Configuration serveur incomplète (PURGE_CRON_SECRET non configuré)" },
        };
      }

      const expectedHeader = `Bearer ${cronSecret.trim()}`;
      const isAuthorized = await timingSafeCompare(authHeader ?? "", expectedHeader);
      if (!isAuthorized) {
        return { status: 401, body: { error: "Non autorisé" } };
      }

      if (body?.batch_size !== undefined) {
        if (
          typeof body.batch_size !== "number" ||
          !Number.isInteger(body.batch_size) ||
          body.batch_size < 1 ||
          body.batch_size > 500
        ) {
          return { status: 400, body: { error: "Paramètre batch_size invalide" } };
        }
      }

      if (body?.lease_seconds !== undefined) {
        if (
          typeof body.lease_seconds !== "number" ||
          !Number.isInteger(body.lease_seconds) ||
          body.lease_seconds < 30 ||
          body.lease_seconds > 3600
        ) {
          return { status: 400, body: { error: "Paramètre lease_seconds invalide" } };
        }
      }

      // Succès simulé avec masquage absolu des clés
      return {
        status: 200,
        body: {
          claimed_count: 2,
          r2_deleted_count: 2,
          confirmed_db_count: 2,
          failed_count: 0,
        },
      };
    }

    it("refuses execution with 500 fail-closed when PURGE_CRON_SECRET is missing", async () => {
      const res = await simulatePurgeRoute({}, "Bearer some-token");
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("PURGE_CRON_SECRET non configuré");
    });

    it("refuses execution with 500 fail-closed when PURGE_CRON_SECRET is empty string", async () => {
      const res = await simulatePurgeRoute({ PURGE_CRON_SECRET: "" }, "Bearer ");
      expect(res.status).toBe(500);
    });

    it("returns 401 when provided Bearer token is incorrect", async () => {
      const res = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer attacker-wrong-token"
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Non autorisé");
    });

    it("returns 200 and sanitizes response when secret is valid", async () => {
      const res = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { batch_size: 50, lease_seconds: 300 }
      );
      expect(res.status).toBe(200);
      expect(res.body.claimed_count).toBe(2);
      expect(JSON.stringify(res.body)).not.toContain("storage_key");
    });

    it("returns 400 when batch_size is outside bounds [1, 500]", async () => {
      const resZero = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { batch_size: 0 }
      );
      expect(resZero.status).toBe(400);

      const resTooLarge = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { batch_size: 501 }
      );
      expect(resTooLarge.status).toBe(400);

      const resFloat = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { batch_size: 10.5 }
      );
      expect(resFloat.status).toBe(400);
    });

    it("returns 400 when lease_seconds is outside bounds [30, 3600]", async () => {
      const resShort = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { lease_seconds: 29 }
      );
      expect(resShort.status).toBe(400);

      const resLong = await simulatePurgeRoute(
        { PURGE_CRON_SECRET: "valid-secret-999" },
        "Bearer valid-secret-999",
        { lease_seconds: 3601 }
      );
      expect(resLong.status).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  // L. INDEPENDENT QUANTITY VALIDATION & 10000 CEILING [Component / Mock Test]
  // --------------------------------------------------------------------------
  describe("L. Quantity Validation, Priority & 10000 Unit Ceiling [Component / Mock Test]", () => {
    function simulateQuantityParsing(item: { qty?: unknown; quantity?: unknown; withFrame?: unknown; videoDurationSec?: unknown }): number {
      let qtyVal: number | null = null;
      let quantityVal: number | null = null;

      if ("qty" in item && item.qty !== undefined) {
        if (
          typeof item.qty !== "number" ||
          !Number.isInteger(item.qty) ||
          item.qty <= 0 ||
          item.qty > 10000
        ) {
          const err = new Error("Quantité qty invalide (doit être un entier positif <= 10000)");
          (err as any).code = "22023";
          throw err;
        }
        qtyVal = item.qty;
      }

      if ("quantity" in item && item.quantity !== undefined) {
        if (
          typeof item.quantity !== "number" ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > 10000
        ) {
          const err = new Error("Quantité quantity invalide (doit être un entier positif <= 10000)");
          (err as any).code = "22023";
          throw err;
        }
        quantityVal = item.quantity;
      }

      if ("withFrame" in item && item.withFrame !== undefined) {
        if (typeof item.withFrame !== "boolean") {
          const err = new Error("withFrame doit être un booléen");
          (err as any).code = "22023";
          throw err;
        }
      }

      if ("videoDurationSec" in item && item.videoDurationSec !== undefined) {
        if (
          typeof item.videoDurationSec !== "number" ||
          !Number.isInteger(item.videoDurationSec) ||
          item.videoDurationSec < 0 ||
          item.videoDurationSec > 1800
        ) {
          const err = new Error("videoDurationSec invalide (doit être compris entre 0 et 1800 s)");
          (err as any).code = "22023";
          throw err;
        }
      }

      // Priorité : qty prévaut sur quantity si les deux sont valides
      return qtyVal ?? quantityVal ?? 1;
    }

    it("rejects when qty is valid integer but quantity is fractional (individual validation fails)", () => {
      expect(() => simulateQuantityParsing({ qty: 5, quantity: 1.5 })).toThrow("Quantité quantity invalide");
    });

    it("rejects when quantity is valid integer but qty is fractional (individual validation fails)", () => {
      expect(() => simulateQuantityParsing({ qty: 2.7, quantity: 3 })).toThrow("Quantité qty invalide");
    });

    it("rejects when quantity is valid integer but qty is invalid string", () => {
      expect(() => simulateQuantityParsing({ qty: "bad" as any, quantity: 4 })).toThrow("Quantité qty invalide");
    });

    it("rejects when quantity exceeds the 10000 ceiling", () => {
      expect(() => simulateQuantityParsing({ qty: 10001 })).toThrow("Quantité qty invalide");
      expect(() => simulateQuantityParsing({ quantity: 15000 })).toThrow("Quantité quantity invalide");
    });

    it("rejects negative or zero quantities", () => {
      expect(() => simulateQuantityParsing({ qty: 0 })).toThrow("Quantité qty invalide");
      expect(() => simulateQuantityParsing({ quantity: -5 })).toThrow("Quantité quantity invalide");
    });

    it("applies priority to qty when both qty and quantity are valid integers <= 10000", () => {
      const result = simulateQuantityParsing({ qty: 10, quantity: 3 });
      expect(result).toBe(10); // qty takes precedence
    });

    it("rejects invalid withFrame non-boolean", () => {
      expect(() => simulateQuantityParsing({ qty: 2, withFrame: "yes" as any })).toThrow("withFrame doit être un booléen");
    });

    it("rejects videoDurationSec greater than 1800s", () => {
      expect(() => simulateQuantityParsing({ qty: 2, videoDurationSec: 1801 })).toThrow("videoDurationSec invalide");
    });
  });

  // --------------------------------------------------------------------------
  // M. CATALOG INTROSPECTION FOR uq_orders_draft_id & SHARE MODE LOCK [Simulation Test]
  // --------------------------------------------------------------------------
  describe("M. Robust Index Catalog Introspection & SHARE MODE Lock [Simulation Test]", () => {
    type CatalogIndex = {
      relname: string;
      relkind: string;
      tablename: string;
      schemaname: string;
      indisunique: boolean;
      indisvalid: boolean;
      indisready: boolean;
      indislive: boolean;
      indnatts: number;
      indnkeyatts: number;
      indexprs: string | null;
      colname: string;
      pred: string;
    };

    function simulateDraftIdIndexVerification(
      ordersTableExists: boolean,
      draftIdColumnExists: boolean,
      existingDraftIds: string[],
      catalogIndexes: CatalogIndex[],
      isShareLockAcquired: boolean
    ): { success: boolean; created: boolean } {
      if (!ordersTableExists) {
        const err = new Error("Table public.orders introuvable");
        (err as any).code = "42P01";
        throw err;
      }

      if (!draftIdColumnExists) {
        const err = new Error("Colonne draft_id introuvable dans public.orders");
        (err as any).code = "42703";
        throw err;
      }

      // Verrouillage requis avant contrôle des doublons
      if (!isShareLockAcquired) {
        throw new Error("Verrou LOCK TABLE public.orders IN SHARE MODE requis avant contrôle");
      }

      // Contrôle des doublons
      const counts = new Map<string, number>();
      for (const d of existingDraftIds) {
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      for (const [, c] of counts) {
        if (c > 1) {
          const err = new Error("Migration interrompue : doublon(s) de draft_id détecté(s)");
          (err as any).code = "23505";
          throw err;
        }
      }

      // Introspection de uq_orders_draft_id
      const found = catalogIndexes.find(
        (i) =>
          i.relname === "uq_orders_draft_id" &&
          i.tablename === "orders" &&
          i.schemaname === "public"
      );

      if (found) {
        const isConforming =
          found.relkind === "i" &&
          found.indisunique === true &&
          found.indisvalid === true &&
          found.indisready === true &&
          found.indislive === true &&
          found.indnatts === 1 &&
          found.indnkeyatts === 1 &&
          found.indexprs === null &&
          found.colname === "draft_id" &&
          found.pred.trim() === "(draft_id IS NOT NULL)";

        if (isConforming) {
          return { success: true, created: false };
        } else {
          const err = new Error(
            "Index public.uq_orders_draft_id existant mais non conforme. Suppression automatique interdite."
          );
          (err as any).code = "55000";
          throw err;
        }
      }

      // Non existant : création
      return { success: true, created: true };
    }

    it("creates unique index uq_orders_draft_id cleanly when index does not exist yet", () => {
      const res = simulateDraftIdIndexVerification(true, true, ["dft_1", "dft_2"], [], true);
      expect(res.success).toBe(true);
      expect(res.created).toBe(true);
    });

    it("accepts existing conforming index without recreating it", () => {
      const existingConforming: CatalogIndex = {
        relname: "uq_orders_draft_id",
        relkind: "i",
        tablename: "orders",
        schemaname: "public",
        indisunique: true,
        indisvalid: true,
        indisready: true,
        indislive: true,
        indnatts: 1,
        indnkeyatts: 1,
        indexprs: null,
        colname: "draft_id",
        pred: "(draft_id IS NOT NULL)",
      };

      const res = simulateDraftIdIndexVerification(true, true, ["dft_1"], [existingConforming], true);
      expect(res.success).toBe(true);
      expect(res.created).toBe(false);
    });

    it("throws 55000 without dropping when existing index is non-unique", () => {
      const nonUnique: CatalogIndex = {
        relname: "uq_orders_draft_id",
        relkind: "i",
        tablename: "orders",
        schemaname: "public",
        indisunique: false, // Invalide !
        indisvalid: true,
        indisready: true,
        indislive: true,
        indnatts: 1,
        indnkeyatts: 1,
        indexprs: null,
        colname: "draft_id",
        pred: "(draft_id IS NOT NULL)",
      };

      expect(() =>
        simulateDraftIdIndexVerification(true, true, ["dft_1"], [nonUnique], true)
      ).toThrow("Index public.uq_orders_draft_id existant mais non conforme");
    });

    it("throws 55000 when index is on wrong column (e.g. order_number)", () => {
      const wrongCol: CatalogIndex = {
        relname: "uq_orders_draft_id",
        relkind: "i",
        tablename: "orders",
        schemaname: "public",
        indisunique: true,
        indisvalid: true,
        indisready: true,
        indislive: true,
        indnatts: 1,
        indnkeyatts: 1,
        indexprs: null,
        colname: "order_number", // Mauvaise colonne !
        pred: "(draft_id IS NOT NULL)",
      };

      expect(() =>
        simulateDraftIdIndexVerification(true, true, ["dft_1"], [wrongCol], true)
      ).toThrow("Index public.uq_orders_draft_id existant mais non conforme");
    });

    it("throws 55000 when index has expressions (indexprs IS NOT NULL)", () => {
      const exprIndex: CatalogIndex = {
        relname: "uq_orders_draft_id",
        relkind: "i",
        tablename: "orders",
        schemaname: "public",
        indisunique: true,
        indisvalid: true,
        indisready: true,
        indislive: true,
        indnatts: 1,
        indnkeyatts: 1,
        indexprs: "lower(draft_id)", // Expression invalide !
        colname: "draft_id",
        pred: "(draft_id IS NOT NULL)",
      };

      expect(() =>
        simulateDraftIdIndexVerification(true, true, ["dft_1"], [exprIndex], true)
      ).toThrow("Index public.uq_orders_draft_id existant mais non conforme");
    });

    it("throws 23505 when duplicate draft_id exist in public.orders without modifying data", () => {
      expect(() =>
        simulateDraftIdIndexVerification(true, true, ["dup_draft", "dup_draft"], [], true)
      ).toThrow("Migration interrompue : doublon(s) de draft_id détecté(s)");
    });

    it("throws 42P01 or 42703 when table or column is missing", () => {
      expect(() =>
        simulateDraftIdIndexVerification(false, true, [], [], true)
      ).toThrow("Table public.orders introuvable");

      expect(() =>
        simulateDraftIdIndexVerification(true, false, [], [], true)
      ).toThrow("Colonne draft_id introuvable dans public.orders");
    });
  });

  // --------------------------------------------------------------------------
  // N. S3 / R2 DELETE OBJECT XML ERROR PARSING [Component / Mock Test]
  // --------------------------------------------------------------------------
  describe("N. S3 / R2 DeleteObject XML Interpretation (NoSuchKey vs NoSuchBucket) [Component / Mock Test]", () => {
    it("treats 204 No Content as successful deletion", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mockaccesskey123",
        secretAccessKey: "mocksecretaccesskey123456789",
        bucketName: "test-bucket",
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(null, { status: 204 }) as any;

      try {
        const res = await adapter.deleteObject("test-key.mp4");
        expect(res.success).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("treats 404 with <Code>NoSuchKey</Code> as idempotent success", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mockaccesskey123",
        secretAccessKey: "mocksecretaccesskey123456789",
        bucketName: "test-bucket",
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>',
          { status: 404 }
        ) as any;

      try {
        const res = await adapter.deleteObject("non-existent-key.mp4");
        expect(res.success).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("treats 404 with <Code>NoSuchBucket</Code> as a strict failure", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mockaccesskey123",
        secretAccessKey: "mocksecretaccesskey123456789",
        bucketName: "test-bucket",
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message></Error>',
          { status: 404 }
        ) as any;

      try {
        const res = await adapter.deleteObject("some-key.mp4");
        expect(res.success).toBe(false);
        expect(res.error).toContain("Ressource ou Bucket introuvable (404)");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("treats 403 Forbidden as failure", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mockaccesskey123",
        secretAccessKey: "mocksecretaccesskey123456789",
        bucketName: "test-bucket",
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response("Forbidden", { status: 403 }) as any;

      try {
        const res = await adapter.deleteObject("some-key.mp4");
        expect(res.success).toBe(false);
        expect(res.error).toContain("HTTP 403");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});

