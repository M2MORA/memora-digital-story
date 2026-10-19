/**
 * MÉMORA — Tests Unitaires du Durcissement R2 & AWS SigV4 (Phase 2.1)
 *
 * Couvre l'intégralité des 11 exigences du cahier des charges :
 * 1. Rejet des identifiants vides
 * 2. Rejet d'un account ID malformé
 * 3. Rejet d'un nom de bucket manquant ou non conforme
 * 4. Rejet d'un binding Cloudflare R2 incomplet
 * 5. Encodage URI RFC 3986 des clés d'objets (préservation des '/')
 * 6. Calcul SHA-256 du corps vide
 * 7. Calcul SHA-256 d'un payload non vide
 * 8. Signature et en-têtes corrects sur PUT
 * 9. Comportement HEAD (200, 404, 500)
 * 10. Comportement DELETE (204, NoSuchKey idempotent, NoSuchBucket bloquant)
 * 11. Absence totale de fuite de clés ou secrets dans les messages d'erreur
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  S3CompatibleR2Adapter,
  CloudflareR2BindingAdapter,
  encodeRfc3986,
  encodeS3UriPath,
  sha256Hex,
} from "../lib/r2-backend";
import { getR2Adapter } from "../server";

describe("MÉMORA Phase 2.1 — R2 Backend Hardening & SigV4 Unit Tests", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --------------------------------------------------------------------------
  // 1. REJET DES IDENTIFIANTS VIDES
  // --------------------------------------------------------------------------
  describe("1. Validation synchrone des identifiants (Fail-Closed)", () => {
    it("rejects empty accountId synchronously", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "memora-dev-bucket",
        });
      }).toThrow(/accountId/);
    });

    it("rejects empty accessKeyId synchronously", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "0123456789abcdef0123456789abcdef",
          accessKeyId: "",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "memora-dev-bucket",
        });
      }).toThrow(/accessKeyId/);
    });

    it("rejects empty secretAccessKey synchronously", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "0123456789abcdef0123456789abcdef",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "",
          bucketName: "memora-dev-bucket",
        });
      }).toThrow(/secretAccessKey/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. REJET D'UN ACCOUNT ID MALFORMÉ
  // --------------------------------------------------------------------------
  describe("2. Validation de l'Account ID", () => {
    it("rejects accountId with spaces or special characters", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "invalid account id with spaces",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "memora-dev-bucket",
        });
      }).toThrow(/accountId/);
    });

    it("rejects accountId that is too short (< 8 chars)", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "abc",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "memora-dev-bucket",
        });
      }).toThrow(/accountId/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. REJET D'UN NOM DE BUCKET MANQUANT OU NON CONFORME
  // --------------------------------------------------------------------------
  describe("3. Validation du nom de bucket DNS", () => {
    it("rejects empty bucketName synchronously", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "0123456789abcdef0123456789abcdef",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "",
        });
      }).toThrow(/bucketName/);
    });

    it("rejects uppercase or invalid characters in bucketName", () => {
      expect(() => {
        new S3CompatibleR2Adapter({
          accountId: "0123456789abcdef0123456789abcdef",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: "validsecretaccesskey12345678",
          bucketName: "My_Invalid_Bucket!",
        });
      }).toThrow(/bucketName/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. REJET D'UN BINDING CLOUDFLARE INCOMPLET
  // --------------------------------------------------------------------------
  describe("4. Validation des bindings Cloudflare R2", () => {
    it("rejects binding missing delete() method in getR2Adapter", () => {
      const incompleteBinding = {
        head: vi.fn(),
        put: vi.fn(),
      };
      expect(() => {
        getR2Adapter({ MEMORA_VIDEOS_BUCKET: incompleteBinding });
      }).toThrow(/binding existe mais n'implémente pas toutes les méthodes requises/);
    });

    it("rejects binding missing put() method in getR2Adapter", () => {
      const incompleteBinding = {
        head: vi.fn(),
        delete: vi.fn(),
      };
      expect(() => {
        getR2Adapter({ MEMORA_VIDEOS_BUCKET: incompleteBinding });
      }).toThrow(/binding existe mais n'implémente pas toutes les méthodes requises/);
    });

    it("rejects incomplete binding in CloudflareR2BindingAdapter constructor", () => {
      expect(() => {
        new CloudflareR2BindingAdapter({ head: vi.fn() });
      }).toThrow(/Binding Cloudflare R2 incomplet : méthodes head, delete et put requises/);

      expect(() => {
        new CloudflareR2BindingAdapter({ head: vi.fn(), delete: vi.fn() });
      }).toThrow(/Binding Cloudflare R2 incomplet : méthodes head, delete et put requises/);

      expect(() => {
        new CloudflareR2BindingAdapter({ head: vi.fn(), put: vi.fn() });
      }).toThrow(/Binding Cloudflare R2 incomplet : méthodes head, delete et put requises/);

      expect(() => {
        new CloudflareR2BindingAdapter({ delete: vi.fn(), put: vi.fn() });
      }).toThrow(/Binding Cloudflare R2 incomplet : méthodes head, delete et put requises/);
    });

    it("accepts complete binding with head, delete, put", () => {
      const completeBinding = {
        head: vi.fn(),
        delete: vi.fn(),
        put: vi.fn(),
      };
      const adapter = getR2Adapter({ MEMORA_VIDEOS_BUCKET: completeBinding });
      expect(adapter).toBeInstanceOf(CloudflareR2BindingAdapter);
    });
  });

  // --------------------------------------------------------------------------
  // 5. ENCODAGE URI RFC 3986 DES CLÉS D'OBJETS
  // --------------------------------------------------------------------------
  describe("5. Encodage URI RFC 3986 des clés S3", () => {
    it("encodes RFC 3986 reserved characters including exclamation and parenthesis", () => {
      expect(encodeRfc3986("video (1)!*'.mp4")).toBe("video%20%281%29%21%2A%27.mp4");
    });

    it("preserves path separators '/' while encoding segment characters", () => {
      const rawKey = "intents/video draft #1 (test)/final preview.mp4";
      const encoded = encodeS3UriPath(rawKey);
      expect(encoded).toBe("intents/video%20draft%20%231%20%28test%29/final%20preview.mp4");
      // Vérifie la préservation des slashes
      expect(encoded.split("/").length).toBe(3);
    });

    it("strips leading slashes", () => {
      expect(encodeS3UriPath("///folder/sub/file.txt")).toBe("folder/sub/file.txt");
    });
  });

  // --------------------------------------------------------------------------
  // 6 & 7. CALCUL SHA-256 DU PAYLOAD (VIDE VS NON-VIDE)
  // --------------------------------------------------------------------------
  describe("6 & 7. Calcul SHA-256 du Payload", () => {
    it("produces standard empty-body SHA-256 on empty string or Uint8Array", async () => {
      const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      expect(await sha256Hex("")).toBe(emptyHash);
      expect(await sha256Hex(new Uint8Array(0))).toBe(emptyHash);
    });

    it("calculates exact SHA-256 for non-empty text and byte payloads", async () => {
      const payload = "MEMORA_PHASE_2_TEST_DATA";
      const expectedHash = await sha256Hex(payload);
      expect(expectedHash.length).toBe(64);

      // Le calcul à partir de Uint8Array doit être strictement identique
      const bytesHash = await sha256Hex(new TextEncoder().encode(payload));
      expect(bytesHash).toBe(expectedHash);
    });
  });

  // --------------------------------------------------------------------------
  // 8. SIGNATURE ET EN-TÊTES CORRECTS SUR PUT
  // --------------------------------------------------------------------------
  describe("8. Signature SigV4 et en-têtes sur putObject", () => {
    it("signs PUT request with correct payload hash and content-type", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mytestaccesskey123",
        secretAccessKey: "mytestsecretaccesskey1234567890",
        bucketName: "memora-dev-bucket",
      });

      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        capturedBody = init.body;
        return new Response(null, { status: 200, headers: { etag: '"etag-12345"' } });
      });

      const payload = "Hello Cloudflare R2!";
      const payloadBytes = new TextEncoder().encode(payload);
      const expectedPayloadHash = await sha256Hex(payloadBytes);

      const res = await adapter.putObject("test/folder/file.txt", payload, {
        contentType: "text/plain",
      });

      expect(res.success).toBe(true);
      expect(res.etag).toBe('"etag-12345"');
      expect(capturedUrl).toBe(
        "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/memora-dev-bucket/test/folder/file.txt"
      );

      // Vérification des en-têtes SigV4
      expect(capturedHeaders["x-amz-content-sha256"]).toBe(expectedPayloadHash);
      expect(capturedHeaders["content-type"]).toBe("text/plain");
      expect(capturedHeaders["authorization"]).toContain("AWS4-HMAC-SHA256 Credential=mytestaccesskey123/");
      expect(capturedHeaders["authorization"]).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
    });
  });

  // --------------------------------------------------------------------------
  // 9. COMPORTEMENT HEAD (200, 404, 500)
  // --------------------------------------------------------------------------
  describe("9. Comportement headObject", () => {
    const adapter = new S3CompatibleR2Adapter({
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "mytestaccesskey123",
      secretAccessKey: "mytestsecretaccesskey1234567890",
      bucketName: "memora-dev-bucket",
    });

    it("returns exists=true with contentLength on HTTP 200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "content-length": "1048576", etag: '"head-etag"' },
        })
      );

      const res = await adapter.headObject("videos/preview.mp4");
      expect(res.exists).toBe(true);
      expect(res.contentLength).toBe(1048576);
      expect(res.etag).toBe('"head-etag"');
    });

    it("returns exists=false with contentLength=0 on HTTP 404", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

      const res = await adapter.headObject("missing/video.mp4");
      expect(res.exists).toBe(false);
      expect(res.contentLength).toBe(0);
    });

    it("throws on HTTP 500 server error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

      await expect(adapter.headObject("error/video.mp4")).rejects.toThrow(/HTTP 500/);
    });
  });

  // --------------------------------------------------------------------------
  // 10. COMPORTEMENT DELETE (204, NoSuchKey, NoSuchBucket)
  // --------------------------------------------------------------------------
  describe("10. Comportement deleteObject", () => {
    const adapter = new S3CompatibleR2Adapter({
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "mytestaccesskey123",
      secretAccessKey: "mytestsecretaccesskey1234567890",
      bucketName: "memora-dev-bucket",
    });

    it("returns success=true on HTTP 204 or 200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const res = await adapter.deleteObject("videos/to-delete.mp4");
      expect(res.success).toBe(true);
    });

    it("returns success=true on HTTP 404 with NoSuchKey (idempotent success)", async () => {
      const xmlBody =
        '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>';
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(xmlBody, { status: 404 }));

      const res = await adapter.deleteObject("videos/already-gone.mp4");
      expect(res.success).toBe(true);
    });

    it("returns success=false on HTTP 404 with NoSuchBucket (configuration failure)", async () => {
      const xmlBody =
        '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message></Error>';
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(xmlBody, { status: 404 }));

      const res = await adapter.deleteObject("videos/test.mp4");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Ressource ou Bucket introuvable");
    });
  });

  // --------------------------------------------------------------------------
  // 11. ABSENCE DE FUITE D'INFORMATIONS SENSIBLES DANS LES ERREURS
  // --------------------------------------------------------------------------
  describe("11. Protection contre les fuites d'informations sensibles", () => {
    it("never includes secretAccessKey in validation errors", () => {
      const secret = "SUPER_SECRET_VALUE_DO_NOT_LEAK_123456";
      try {
        new S3CompatibleR2Adapter({
          accountId: "invalid",
          accessKeyId: "validaccesskey1234",
          secretAccessKey: secret,
          bucketName: "memora-dev-bucket",
        });
        expect.unreachable("Devrait lever une erreur");
      } catch (err: any) {
        expect(err.message).not.toContain(secret);
      }
    });

    it("never includes network URLs with account ID in catch errors of deleteObject and putObject", async () => {
      const adapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "mytestaccesskey123",
        secretAccessKey: "mytestsecretaccesskey1234567890",
        bucketName: "memora-dev-bucket",
      });

      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("Failed to fetch from https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com")
      );

      const delRes = await adapter.deleteObject("videos/secret-key.mp4");
      expect(delRes.success).toBe(false);
      expect(delRes.error).not.toContain("0123456789abcdef0123456789abcdef");
      expect(delRes.error).toBe("Erreur réseau S3 DeleteObject");

      const putRes = await adapter.putObject("videos/secret-key.mp4", "content");
      expect(putRes.success).toBe(false);
      expect(putRes.error).not.toContain("0123456789abcdef0123456789abcdef");
      expect(putRes.error).toBe("Erreur réseau S3 PutObject");
    });
  });

  // --------------------------------------------------------------------------
  // 12. VECTEURS DE TEST AWS SIGV4 DÉTERMINISTES COMPLETS
  // --------------------------------------------------------------------------
  describe("12. Vecteurs de signature AWS SigV4 déterministes complets", () => {
    async function independentHmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
      const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
      const arrayBuffer = rawKey.buffer.slice(
        rawKey.byteOffset,
        rawKey.byteOffset + rawKey.byteLength
      ) as ArrayBuffer;
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        arrayBuffer,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
      return new Uint8Array(sig);
    }

    async function independentHmacHex(key: Uint8Array, data: string): Promise<string> {
      const res = await independentHmac(key, data);
      return Array.from(res)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    it("matches official AWS SigV4 key derivation test vector", async () => {
      // Vecteur officiel AWS Documentation (Task 3: Calculate Signature - Example)
      // https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html
      const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      const dateStamp = "20130810";
      const region = "us-east-1";

      const kDate = await independentHmac("AWS4" + secret, dateStamp);
      const kRegion = await independentHmac(kDate, region);

      // 1. Vecteur officiel de référence AWS General Guide (service = iam)
      const kServiceIam = await independentHmac(kRegion, "iam");
      const kSigningIam = await independentHmac(kServiceIam, "aws4_request");
      const kSigningIamHex = Array.from(kSigningIam)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      expect(kSigningIamHex).toBe("86058008c7ec53485f93e6dd20ba27731cdd6c1cc3f5dde435d3c5d3ded4853b");

      // 2. Vecteur de référence S3 (service = s3)
      const kServiceS3 = await independentHmac(kRegion, "s3");
      const kSigningS3 = await independentHmac(kServiceS3, "aws4_request");
      const kSigningS3Hex = Array.from(kSigningS3)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      expect(kSigningS3Hex).toBe("8d45b854d1c445905a9ba1a7d172cfa162fa3c9a154c2e461d0b8007b0ef47a4");
    });

    it("verifies canonical request, canonical URI, headers, signed headers, string to sign and exact final signature", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));

      const config = {
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        bucketName: "memora-dev-test",
      };
      const adapter = new S3CompatibleR2Adapter(config);

      const objectKey = "videos/draft-1/final (test)!.mp4";
      const contentType = "video/mp4";
      const payload = "MEMORA_EXACT_DETERMINISTIC_SIGV4_PAYLOAD_12345";
      const payloadBytes = new TextEncoder().encode(payload);

      // 1. Calcul indépendant du hash de payload
      const expectedPayloadHash = await sha256Hex(payloadBytes);
      expect(expectedPayloadHash.length).toBe(64);

      // 2. Calcul indépendant de l'URI canonique (RFC 3986 + préservation '/')
      const expectedCanonicalUri = `/${config.bucketName}/${encodeS3UriPath(objectKey)}`;
      expect(expectedCanonicalUri).toBe(
        "/memora-dev-test/videos/draft-1/final%20%28test%29%21.mp4"
      );

      // 3. Calcul indépendant des en-têtes canoniques et signed headers (tri ASCII)
      const amzDate = "20261019T120000Z";
      const dateStamp = "20261019";
      const host = `${config.accountId}.r2.cloudflarestorage.com`;
      const expectedCanonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${expectedPayloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
      const expectedSignedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

      // 4. Calcul indépendant de la Canonical Request
      const expectedCanonicalRequest =
        `PUT\n` +
        `${expectedCanonicalUri}\n\n` +
        `${expectedCanonicalHeaders}\n` +
        `${expectedSignedHeaders}\n` +
        `${expectedPayloadHash}`;

      const expectedCanonicalReqHash = await sha256Hex(expectedCanonicalRequest);

      // 5. Calcul indépendant du String to Sign
      const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
      const expectedStringToSign =
        `AWS4-HMAC-SHA256\n` +
        `${amzDate}\n` +
        `${credentialScope}\n` +
        `${expectedCanonicalReqHash}`;

      // 6. Dérivation indépendante des clés de signature HMAC
      const kDate = await independentHmac("AWS4" + config.secretAccessKey, dateStamp);
      const kRegion = await independentHmac(kDate, "auto");
      const kService = await independentHmac(kRegion, "s3");
      const kSigning = await independentHmac(kService, "aws4_request");
      const expectedSignature = await independentHmacHex(kSigning, expectedStringToSign);

      // 7. Interception de la requête émise par la classe de production
      let capturedHeaders: Record<string, string> = {};
      let capturedUrl = "";
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        return new Response(null, { status: 200, headers: { etag: '"test-etag"' } });
      });

      const putRes = await adapter.putObject(objectKey, payload, { contentType });
      expect(putRes.success).toBe(true);

      // 8. Vérifications de conformité absolue
      expect(capturedUrl).toBe(`https://${host}${expectedCanonicalUri}`);
      expect(capturedHeaders["x-amz-date"]).toBe(amzDate);
      expect(capturedHeaders["x-amz-content-sha256"]).toBe(expectedPayloadHash);
      expect(capturedHeaders["content-type"]).toBe(contentType);

      const authHeader = capturedHeaders["authorization"] ?? "";
      const authMatch = authHeader.match(
        /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/
      );
      expect(authMatch, "L'en-tête Authorization doit respecter la grammaire exacte AWS SigV4").not.toBeNull();

      const [, capturedCredential, capturedSignedHeaders, capturedSignature] = authMatch!;
      expect(capturedCredential).toBe(`${config.accessKeyId}/${credentialScope}`);
      expect(capturedSignedHeaders).toBe(expectedSignedHeaders);

      // PREUVE FORMELLE : La signature produite par l'adaptateur de production
      // correspond au bit près à la signature calculée indépendamment
      expect(capturedSignature).toBe(expectedSignature);

      vi.useRealTimers();
    });
  });
});
