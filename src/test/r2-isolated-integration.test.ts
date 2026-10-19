/**
 * MÉMORA — Test d'Intégration Isolé Cloudflare R2 (Phase 2.3)
 *
 * Ce fichier teste le cycle de vie réel d'un objet temporaire sur Cloudflare R2
 * en utilisant la classe de production S3CompatibleR2Adapter.
 *
 * GARANTIES DE SÉCURITÉ STRICTES :
 * - Inactif par défaut (skip automatique si R2_INTEGRATION_TEST !== '1').
 * - Si R2_INTEGRATION_TEST === '1', échec explicite immédiat si une variable requise manque.
 * - Correspondance exacte exigée entre R2_BUCKET_NAME et R2_TEST_BUCKET_NAME.
 * - Correspondance exacte exigée avec l'allowlist explicite des buckets de test approuvés.
 * - Refus absolu de s'exécuter sur un bucket de production (blacklist formelle).
 * - Utilise exclusivement une clé temporaire unique aléatoire (préfixe integration-tests/<uuid>/).
 * - Échec explicite et bloquant si le nettoyage de l'objet temporaire échoue.
 * - Ne consigne JAMAIS d'en-têtes d'autorisation, de clés ou de secrets.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { S3CompatibleR2Adapter } from "../lib/r2-backend";
import fs from "node:fs";
import path from "node:path";

// 1. Chargement sécurisé de .env pour environnement de test Node/Vitest
function loadEnvIfNotPresent() {
  if (process.env["R2_ACCOUNT_ID"] && process.env["R2_ACCESS_KEY_ID"]) {
    return;
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
          continue;
        }
        const eqIdx = trimmed.indexOf("=");
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Échec silencieux si le fichier .env est absent
  }
}

loadEnvIfNotPresent();

// Ne s'exécute QUE si explicitement activé via R2_INTEGRATION_TEST=1
const isOptedIn = process.env["R2_INTEGRATION_TEST"] === "1";

// Allowlist explicite des buckets de test autorisés
const APPROVED_TEST_BUCKET_ALLOWLIST = new Set([
  "memora-dev-test",
  "memora-integration-test",
  "memora-test-bucket",
  "memora-test",
]);

// Blacklist explicite des buckets de production formellement interdits
const FORBIDDEN_PRODUCTION_BUCKETS = new Set([
  "memora-videos",
  "memora-media",
  "memora-production",
  "memora-prod",
  "production",
  "prod",
]);

function validateTestBucketConfiguration(bucketName: string, testBucketName: string): void {
  if (!bucketName) {
    throw new Error("SÉCURITÉ R2 : R2_BUCKET_NAME est obligatoire");
  }
  if (!testBucketName) {
    throw new Error("SÉCURITÉ R2 : R2_TEST_BUCKET_NAME est obligatoire");
  }
  if (bucketName !== testBucketName) {
    throw new Error(
      `SÉCURITÉ R2 : R2_BUCKET_NAME ("${bucketName}") ne correspond pas à R2_TEST_BUCKET_NAME ("${testBucketName}")`
    );
  }

  const lower = bucketName.toLowerCase();
  if (FORBIDDEN_PRODUCTION_BUCKETS.has(lower)) {
    throw new Error(
      `SÉCURITÉ R2 : Le bucket "${bucketName}" est un bucket de production interdit.`
    );
  }

  if (!APPROVED_TEST_BUCKET_ALLOWLIST.has(lower)) {
    throw new Error(
      `SÉCURITÉ R2 : Le bucket "${bucketName}" ne figure pas dans l'allowlist explicite des buckets de test autorisés (${Array.from(
        APPROVED_TEST_BUCKET_ALLOWLIST
      ).join(", ")})`
    );
  }
}

describe.skipIf(!isOptedIn)("Cloudflare R2 Isolated Integration Test (Real S3 API)", () => {
  const randomId = crypto.randomUUID();
  const testKey = `integration-tests/${randomId}/test.txt`;
  const testPayload = `MEMORA_R2_ISOLATED_TEST_PAYLOAD_${Date.now()}_${randomId}`;
  const payloadBytes = new TextEncoder().encode(testPayload);

  let adapter: S3CompatibleR2Adapter;
  let accountId = "";
  let accessKeyId = "";
  let secretAccessKey = "";
  let bucketName = "";
  let testBucketName = "";

  beforeAll(() => {
    // Si R2_INTEGRATION_TEST=1, les 5 variables doivent être présentes sinon échec explicite
    accountId = process.env["R2_ACCOUNT_ID"]?.trim() ?? "";
    accessKeyId = process.env["R2_ACCESS_KEY_ID"]?.trim() ?? "";
    secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"]?.trim() ?? "";
    bucketName = process.env["R2_BUCKET_NAME"]?.trim() ?? "";
    testBucketName = process.env["R2_TEST_BUCKET_NAME"]?.trim() ?? "";

    const missing: string[] = [];
    if (!accountId) missing.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
    if (!bucketName) missing.push("R2_BUCKET_NAME");
    if (!testBucketName) missing.push("R2_TEST_BUCKET_NAME");

    if (missing.length > 0) {
      throw new Error(
        `Échec R2_INTEGRATION_TEST : Variables obligatoires manquantes (${missing.join(", ")})`
      );
    }

    validateTestBucketConfiguration(bucketName, testBucketName);

    adapter = new S3CompatibleR2Adapter({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
    });
  });

  afterAll(async () => {
    if (!adapter) return;
    try {
      const delResult = await adapter.deleteObject(testKey);
      if (!delResult.success) {
        throw new Error(
          `ÉCHEC CRITIQUE DE NETTOYAGE R2 : Impossible de supprimer l'objet de test "${testKey}" : ${delResult.error}`
        );
      }
    } catch (err: any) {
      throw new Error(
        `ÉCHEC CRITIQUE DE NETTOYAGE R2 : Exception lors de la suppression de "${testKey}" : ${err?.message}`
      );
    }
  });

  it(
    "executes real object lifecycle on Cloudflare R2 using production S3CompatibleR2Adapter",
    async () => {
      // 1. PUT d'un petit objet texte
      const putResult = await adapter.putObject(testKey, payloadBytes, {
        contentType: "text/plain",
      });
      expect(putResult.success, `PUT échoué: ${putResult.error}`).toBe(true);

      // 2. HEAD pour vérifier la présence de l'objet
      const headResult1 = await adapter.headObject(testKey);
      expect(headResult1.exists).toBe(true);

      // 3. Contrôle strict de la taille exacte (Content-Length)
      expect(headResult1.contentLength).toBe(payloadBytes.byteLength);

      // 4. DELETE de l'objet temporaire
      const deleteResult = await adapter.deleteObject(testKey);
      expect(deleteResult.success, `DELETE échoué: ${deleteResult.error}`).toBe(true);

      // 5. HEAD à nouveau pour confirmer l'absence effective de l'objet
      const headResult2 = await adapter.headObject(testKey);
      expect(headResult2.exists).toBe(false);
      expect(headResult2.contentLength).toBe(0);
    },
    15000
  );
});
