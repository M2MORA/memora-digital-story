/**
 * MÉMORA — Tests Unitaires Génération d'URL Présignées PUT Cloudflare R2 (Phase 3.0 / Étape 1)
 *
 * Couvre l'intégralité des exigences spécifiées dans le cahier des charges :
 * A. Génération de base (clé valide, MIME valide, expiration par défaut 900s, structure URL)
 * B. Validation de l'expiration (60s explicite, rejet 0, négatif, décimal, > 900, non-entier)
 * C. Validation des entrées (clé vide, Content-Type vide ou invalide, traversée de chemin, octet nul)
 * D. Encodage URI RFC 3986 (nom simple, imbriqué, espaces, unicode, caractères spéciaux, %, +)
 * E. Exactitude cryptographique AWS SigV4 (vecteur de test déterministe avec calcul indépendant)
 * F. Protection absolue des secrets (non-divulgation de secretAccessKey)
 * G. Support / Rejet explicite CloudflareR2BindingAdapter
 */

import { describe, it, expect } from "vitest";
import { createHmac, createHash } from "node:crypto";
import {
  S3CompatibleR2Adapter,
  CloudflareR2BindingAdapter,
  encodeS3UriPath,
} from "../lib/r2-backend";

describe("MÉMORA Phase 3.0 / Étape 1 — Cloudflare R2 Presigned PUT URL Generation", () => {
  const validConfig = {
    accountId: "0123456789abcdef0123456789abcdef",
    accessKeyId: "validaccesskey1234",
    secretAccessKey: "validsecretaccesskey12345678",
    bucketName: "memora-videos",
  };

  const adapter = new S3CompatibleR2Adapter(validConfig);
  const fixedNow = new Date("2026-10-19T23:00:00.000Z");

  // --------------------------------------------------------------------------
  // A. GÉNÉRATION DE BASE
  // --------------------------------------------------------------------------
  describe("A. Génération de base", () => {
    it("generates a valid presigned PUT URL with default 900s expiration", async () => {
      const result = await adapter.getPresignedPutUrl(
        {
          key: "staging/dft_abc123/video.mp4",
          contentType: "video/mp4",
        },
        fixedNow
      );

      expect(result).toBeDefined();
      expect(result.requiredHeaders).toEqual({
        "Content-Type": "video/mp4",
      });

      // Expiration ISO = fixedNow + 900 secondes
      const expectedExpiresAt = new Date(fixedNow.getTime() + 900 * 1000).toISOString();
      expect(result.expiresAt).toBe(expectedExpiresAt);

      // Structure de base de l'URL
      const parsedUrl = new URL(result.url);
      expect(parsedUrl.protocol).toBe("https:");
      expect(parsedUrl.host).toBe(`${validConfig.accountId}.r2.cloudflarestorage.com`);
      expect(parsedUrl.pathname).toBe("/memora-videos/staging/dft_abc123/video.mp4");

      // Paramètres de requête SigV4 requis
      const params = parsedUrl.searchParams;
      expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(params.get("X-Amz-Credential")).toBe(
        `${validConfig.accessKeyId}/20261019/auto/s3/aws4_request`
      );
      expect(params.get("X-Amz-Date")).toBe("20261019T230000Z");
      expect(params.get("X-Amz-Expires")).toBe("900");
      expect(params.get("X-Amz-SignedHeaders")).toBe("content-type;host");

      const signature = params.get("X-Amz-Signature");
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it("strips leading slashes on key without altering the path", async () => {
      const res = await adapter.getPresignedPutUrl(
        {
          key: "/staging/dft_1/photo.jpg",
          contentType: "image/jpeg",
        },
        fixedNow
      );

      const parsedUrl = new URL(res.url);
      expect(parsedUrl.pathname).toBe("/memora-videos/staging/dft_1/photo.jpg");
    });
  });

  // --------------------------------------------------------------------------
  // B. VALIDATION DE L'EXPIRATION
  // --------------------------------------------------------------------------
  describe("B. Validation de l'expiration", () => {
    it("accepts explicit valid expiration of 60 seconds", async () => {
      const result = await adapter.getPresignedPutUrl(
        {
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: 60,
        },
        fixedNow
      );

      const parsedUrl = new URL(result.url);
      expect(parsedUrl.searchParams.get("X-Amz-Expires")).toBe("60");
      expect(result.expiresAt).toBe(new Date(fixedNow.getTime() + 60 * 1000).toISOString());
    });

    it("rejects zero expiration (<= 0)", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: 0,
        })
      ).rejects.toThrow(/Expiration R2 invalide/);
    });

    it("rejects negative expiration", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: -30,
        })
      ).rejects.toThrow(/Expiration R2 invalide/);
    });

    it("rejects decimal expiration", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: 60.5,
        })
      ).rejects.toThrow(/Expiration R2 invalide/);
    });

    it("rejects expiration exceeding 900 seconds", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: 901,
        })
      ).rejects.toThrow(/Expiration R2 invalide.*900 secondes/);

      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: 3600,
        })
      ).rejects.toThrow(/Expiration R2 invalide.*900 secondes/);
    });

    it("rejects non-number expiration", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
          expiresInSeconds: "900" as any,
        })
      ).rejects.toThrow(/Expiration R2 invalide/);
    });
  });

  // --------------------------------------------------------------------------
  // C. VALIDATION DES ENTRÉES
  // --------------------------------------------------------------------------
  describe("C. Validation des entrées", () => {
    it("rejects null or missing options", async () => {
      await expect(adapter.getPresignedPutUrl(null as any)).rejects.toThrow(/Options/);
      await expect(adapter.getPresignedPutUrl(undefined as any)).rejects.toThrow(/Options/);
    });

    it("rejects empty or whitespace-only key", async () => {
      await expect(
        adapter.getPresignedPutUrl({ key: "", contentType: "video/mp4" })
      ).rejects.toThrow(/Clé d'objet R2 invalide/);

      await expect(
        adapter.getPresignedPutUrl({ key: "   ", contentType: "video/mp4" })
      ).rejects.toThrow(/Clé d'objet R2 invalide/);

      await expect(
        adapter.getPresignedPutUrl({ key: "///", contentType: "video/mp4" })
      ).rejects.toThrow(/Clé d'objet R2 invalide/);
    });

    it("rejects null byte in key", async () => {
      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test\0.mp4", contentType: "video/mp4" })
      ).rejects.toThrow(/octet nul interdit/);
    });

    it("rejects path traversal ('..' or '.') in key", async () => {
      await expect(
        adapter.getPresignedPutUrl({ key: "staging/../secret.txt", contentType: "text/plain" })
      ).rejects.toThrow(/traversée de chemin interdite/);

      await expect(
        adapter.getPresignedPutUrl({ key: "../../etc/passwd", contentType: "text/plain" })
      ).rejects.toThrow(/traversée de chemin interdite/);

      await expect(
        adapter.getPresignedPutUrl({ key: "staging/./test.mp4", contentType: "video/mp4" })
      ).rejects.toThrow(/traversée de chemin interdite/);
    });

    it("rejects empty or whitespace-only Content-Type", async () => {
      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test.mp4", contentType: "" })
      ).rejects.toThrow(/Content-Type R2 invalide/);

      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test.mp4", contentType: "   " })
      ).rejects.toThrow(/Content-Type R2 invalide/);
    });

    it("rejects Content-Type with header injection (newlines or control chars)", async () => {
      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4\r\nx-injected-header: bad",
        })
      ).rejects.toThrow(/retours à la ligne interdits/);

      await expect(
        adapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4\n",
        })
      ).rejects.toThrow(/retours à la ligne interdits/);
    });

    it("rejects malformed MIME types", async () => {
      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test.mp4", contentType: "invalid-type" })
      ).rejects.toThrow(/format MIME non conforme/);

      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test.mp4", contentType: "video/" })
      ).rejects.toThrow(/format MIME non conforme/);

      await expect(
        adapter.getPresignedPutUrl({ key: "staging/test.mp4", contentType: "/mp4" })
      ).rejects.toThrow(/format MIME non conforme/);
    });
  });

  // --------------------------------------------------------------------------
  // D. ENCODAGE URI RFC 3986
  // --------------------------------------------------------------------------
  describe("D. Encodage URI RFC 3986", () => {
    it("handles keys with spaces correctly (%20 instead of +)", async () => {
      const res = await adapter.getPresignedPutUrl(
        {
          key: "staging/mon film de vacances.mp4",
          contentType: "video/mp4",
        },
        fixedNow
      );

      const parsedUrl = new URL(res.url);
      expect(parsedUrl.pathname).toBe("/memora-videos/staging/mon%20film%20de%20vacances.mp4");
      expect(parsedUrl.pathname).not.toContain("+");
    });

    it("handles keys with Unicode characters (accented characters)", async () => {
      const res = await adapter.getPresignedPutUrl(
        {
          key: "staging/souvenir_noël_été.mp4",
          contentType: "video/mp4",
        },
        fixedNow
      );

      const parsedUrl = new URL(res.url);
      // noël -> no%C3%ABl, été -> %C3%A9t%C3%A9
      expect(parsedUrl.pathname).toBe("/memora-videos/staging/souvenir_no%C3%ABl_%C3%A9t%C3%A9.mp4");
    });

    it("handles keys with RFC 3986 reserved characters (!, ', (, ), *)", async () => {
      const res = await adapter.getPresignedPutUrl(
        {
          key: "staging/photo_(1)_!*'test.jpg",
          contentType: "image/jpeg",
        },
        fixedNow
      );

      const parsedUrl = new URL(res.url);
      expect(parsedUrl.pathname).toContain("%281%29");
      expect(parsedUrl.pathname).toContain("%21");
      expect(parsedUrl.pathname).toContain("%2A");
      expect(parsedUrl.pathname).toContain("%27");
    });

    it("handles percent signs and plus signs in filenames", async () => {
      const res = await adapter.getPresignedPutUrl(
        {
          key: "staging/promo 100% + bonus.mp4",
          contentType: "video/mp4",
        },
        fixedNow
      );

      const parsedUrl = new URL(res.url);
      expect(parsedUrl.pathname).toBe("/memora-videos/staging/promo%20100%25%20%2B%20bonus.mp4");
    });
  });

  // --------------------------------------------------------------------------
  // E. EXACTITUDE CRYPTOGRAPHIQUE AWS SIGV4 (VECTEUR DE TEST DÉTERMINISTE)
  // --------------------------------------------------------------------------
  describe("E. Exactitude cryptographique AWS SigV4", () => {
    it("matches independently calculated AWS SigV4 signature", async () => {
      const testConfig = {
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        bucketName: "memora-videos",
      };

      const testAdapter = new S3CompatibleR2Adapter(testConfig);
      const testNow = new Date("2026-10-19T23:00:00.000Z");
      const key = "staging/dft_vector/video.mp4";
      const contentType = "video/mp4";
      const expiresInSeconds = 900;

      const result = await testAdapter.getPresignedPutUrl(
        { key, contentType, expiresInSeconds },
        testNow
      );

      // --- CALCUL INDÉPENDANT CONFORME AWS SIGV4 ---
      const amzDate = "20261019T230000Z";
      const dateStamp = "20261019";
      const region = "auto";
      const service = "s3";
      const host = `${testConfig.accountId}.r2.cloudflarestorage.com`;
      const canonicalUri = `/memora-videos/${encodeS3UriPath(key)}`;

      const canonicalQueryString =
        `X-Amz-Algorithm=AWS4-HMAC-SHA256&` +
        `X-Amz-Credential=${encodeURIComponent(testConfig.accessKeyId)}%2F${dateStamp}%2F${region}%2F${service}%2Faws4_request&` +
        `X-Amz-Date=${amzDate}&` +
        `X-Amz-Expires=${expiresInSeconds}&` +
        `X-Amz-SignedHeaders=content-type%3Bhost`;

      const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
      const signedHeaders = "content-type;host";
      const payloadHash = "UNSIGNED-PAYLOAD";

      const canonicalRequest =
        `PUT\n` +
        `${canonicalUri}\n` +
        `${canonicalQueryString}\n` +
        `${canonicalHeaders}\n` +
        `${signedHeaders}\n` +
        `${payloadHash}`;

      const canonicalReqHash = createHash("sha256").update(canonicalRequest, "utf8").digest("hex");

      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalReqHash}`;

      // Dérivation de la clé de signature indépendante
      const kDate = createHmac("sha256", "AWS4" + testConfig.secretAccessKey).update(dateStamp).digest();
      const kRegion = createHmac("sha256", kDate).update(region).digest();
      const kService = createHmac("sha256", kRegion).update(service).digest();
      const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
      const expectedSignature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

      const parsedUrl = new URL(result.url);
      const generatedSignature = parsedUrl.searchParams.get("X-Amz-Signature");

      // Vérification de la signature finale exacte
      expect(generatedSignature).toBe(expectedSignature);

      // Vérification que les headers requis correspondent exactement au header signé
      expect(result.requiredHeaders).toEqual({
        "Content-Type": contentType,
      });
    });
  });

  // --------------------------------------------------------------------------
  // F. PROTECTION DES SECRETS
  // --------------------------------------------------------------------------
  describe("F. Protection des secrets", () => {
    it("never exposes secretAccessKey in the URL or returned object", async () => {
      const secret = "verysecretkeyneverleak123456789";
      const secAdapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "publicaccesskey12",
        secretAccessKey: secret,
        bucketName: "memora-videos",
      });

      const res = await secAdapter.getPresignedPutUrl({
        key: "staging/test.mp4",
        contentType: "video/mp4",
      });

      expect(res.url).not.toContain(secret);
      expect(JSON.stringify(res)).not.toContain(secret);
    });

    it("never includes secretAccessKey in thrown error messages", async () => {
      const secret = "supersecretkey9999999999999999";
      const secAdapter = new S3CompatibleR2Adapter({
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "publicaccesskey12",
        secretAccessKey: secret,
        bucketName: "memora-videos",
      });

      try {
        await secAdapter.getPresignedPutUrl({
          key: "",
          contentType: "video/mp4",
        });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.message).not.toContain(secret);
      }
    });
  });

  // --------------------------------------------------------------------------
  // G. SUPPORT / REJET EXPLICITE CLOUDFLARE R2 BINDING ADAPTER
  // --------------------------------------------------------------------------
  describe("G. Support CloudflareR2BindingAdapter", () => {
    it("throws explicit descriptive error indicating S3CompatibleR2Adapter is required", async () => {
      const mockBucket = {
        head: async () => null,
        delete: async () => {},
        put: async () => ({}),
      };
      const bindingAdapter = new CloudflareR2BindingAdapter(mockBucket);

      await expect(
        bindingAdapter.getPresignedPutUrl({
          key: "staging/test.mp4",
          contentType: "video/mp4",
        })
      ).rejects.toThrow(/CloudflareR2BindingAdapter ne supporte pas la génération d'URL présignées/);
    });
  });
});
