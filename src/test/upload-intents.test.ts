import { describe, expect, it, vi } from "vitest";
import { handleUploadVerificationRoute } from "@/server";
import { S3CompatibleR2Adapter } from "@/lib/r2-backend";
import { sha256Hex } from "@/server/crypto";
import {
  checkUploadIntentRequest,
  handleOrphanPurge,
  READY_INTENT_LIFETIME_MS,
  type UploadIntentDependencies,
} from "@/server/upload-intents";

const NOW = Date.parse("2026-11-15T10:00:00.000Z");

const validVideo = {
  draft_id: "dft_abc123",
  draft_token: "tok_12345678",
  item_id: " item_1 ",
  file_kind: "video",
  file_name: " clip.mp4 ",
  mime_type: " Video/MP4 ",
  file_size_bytes: 1000,
  file_extension: ".MP4",
};

describe("checkUploadIntentRequest", () => {
  it("normalise une requête valide", () => {
    expect(checkUploadIntentRequest(validVideo)).toEqual({
      ok: true,
      request: {
        draftId: "dft_abc123",
        draftToken: "tok_12345678",
        itemId: "item_1",
        fileKind: "video",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 1000,
        fileExtension: "mp4",
      },
    });
  });

  it.each([
    [null, "body"],
    [{ ...validVideo, draft_id: "a/b" }, "draft_id"],
    [{ ...validVideo, draft_token: "court" }, "draft_token"],
    [{ ...validVideo, file_kind: "audio" }, "file_kind"],
    [{ ...validVideo, file_name: "a\nb" }, "file_name"],
    [{ ...validVideo, file_extension: " " }, "file_extension"],
    [{ ...validVideo, file_extension: "avi" }, "video_extension"],
    [{ ...validVideo, mime_type: "" }, "mime_type"],
    [{ ...validVideo, mime_type: "image/png" }, "video_mime"],
    [{ ...validVideo, file_size_bytes: 1.5 }, "file_size_bytes"],
    [{ ...validVideo, file_size_bytes: 6 * 1024 ** 3 }, "video_size"],
    [{ ...validVideo, item_id: 42 }, "item_id"],
    [
      {
        ...validVideo,
        file_kind: "photo",
        file_extension: "jpg",
        mime_type: "image/jpeg",
        file_size_bytes: 30 * 1024 ** 2,
      },
      "photo_size",
    ],
  ])("refuse %j avec %s", (body, issue) => {
    expect(checkUploadIntentRequest(body)).toEqual({ ok: false, issue });
  });

  it("signale l'extension avant le type MIME, et le MIME avant la taille", () => {
    expect(
      checkUploadIntentRequest({ ...validVideo, file_extension: "avi", mime_type: "text/plain" }),
    ).toEqual({ ok: false, issue: "video_extension" });
    expect(
      checkUploadIntentRequest({ ...validVideo, mime_type: "text/plain", file_size_bytes: -1 }),
    ).toEqual({ ok: false, issue: "video_mime" });
  });
});

type Intent = {
  id: string;
  status: string;
  storage_key: string;
  file_size_bytes: number;
  expires_at: string;
  order_id: string | null;
  draft_token_hash: string;
  completeRejection?: string;
};

/** Base factice : lecture d'une intention, mises à jour enregistrées, complete_upload_intent. */
function fakeDb(intents: Intent[]) {
  const updates: Array<{ patch: Record<string, unknown>; filters: unknown[][] }> = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({
            data: intents.find((i) => i.id === id) ?? null,
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        const record = { patch, filters: [] as unknown[][] };
        updates.push(record);
        const builder: any = { then: (resolve: (v: unknown) => void) => resolve({ error: null }) };
        for (const op of ["eq", "is"]) {
          builder[op] = (...args: unknown[]) => {
            record.filters.push([op, ...args]);
            return builder;
          };
        }
        return builder;
      },
    }),
    rpc: vi.fn(async (fn: string, args: any) => {
      const intent = intents.find((i) => i.id === args.p_intent_id);
      if (fn !== "complete_upload_intent" || !intent)
        return { data: null, error: { code: "22023" } };
      if (intent.completeRejection) {
        return { data: { success: false, reason: intent.completeRejection }, error: null };
      }
      intent.status = "ready";
      return { data: { success: true, status: "ready" }, error: null };
    }),
  };
  return { db, updates };
}

/** Vrai adaptateur S3 (identifiants factices) sur un fetch factice qui sert des tailles d'objets. */
function s3Storage(objects: Record<string, number>) {
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const key = decodeURIComponent(new URL(String(input)).pathname.split("/").slice(2).join("/"));
    const size = objects[key];
    return {
      ok: size !== undefined,
      status: size === undefined ? 404 : 200,
      headers: new Headers(size === undefined ? {} : { "content-length": String(size) }),
    } as Response;
  });
  const adapter = new S3CompatibleR2Adapter(
    {
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "validaccesskey1234",
      secretAccessKey: "validsecretaccesskey12345678",
      bucketName: "memora-videos",
    },
    fetchFn as unknown as typeof fetch,
  );
  return { adapter, fetchFn };
}

async function setup(intent: Partial<Intent>, objects: Record<string, number> = {}) {
  const row: Intent = {
    id: "int-1",
    status: "uploading",
    storage_key: "staging/dft_abc123/video.mp4",
    file_size_bytes: 5000,
    expires_at: new Date(NOW + 60_000).toISOString(),
    order_id: null,
    draft_token_hash: await sha256Hex("bon-token"),
    ...intent,
  };
  const { db, updates } = fakeDb([row]);
  const { adapter, fetchFn } = s3Storage(objects);
  const deps: UploadIntentDependencies = {
    db: () => db,
    storage: () => adapter,
    uploadSigner: () => adapter,
    now: () => NOW,
  };
  const verify = async (body: unknown) => {
    const res = await handleUploadVerificationRoute(
      new Request("https://memora.tn/api/upload/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      deps,
    );
    return { status: res.status, body: await res.json() };
  };
  return { row, updates, fetchFn, verify };
}

describe("POST /api/upload/verify", () => {
  it("valide le fichier présent à la bonne taille puis prolonge l'intention de 24 h", async () => {
    const { row, updates, verify } = await setup({}, { "staging/dft_abc123/video.mp4": 5000 });

    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });

    expect(res).toEqual({
      status: 200,
      body: { success: true, intent_id: "int-1", status: "ready", verified_size: 5000 },
    });
    expect(row.status).toBe("ready");
    expect(updates).toEqual([
      {
        patch: {
          expires_at: new Date(NOW + READY_INTENT_LIFETIME_MS).toISOString(),
          updated_at: new Date(NOW).toISOString(),
        },
        filters: [
          ["eq", "id", "int-1"],
          ["eq", "status", "ready"],
          ["is", "order_id", null],
        ],
      },
    ]);
  });

  it("re-vérifier une intention déjà prête la prolonge sans relire le stockage", async () => {
    const { updates, fetchFn, verify } = await setup({ status: "ready" });
    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });
    expect(res.status).toBe(200);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });

  it.each(["uploading", "ready"])(
    "refuse un mauvais token (statut %s) sans jamais appeler le stockage",
    async (status) => {
      const { updates, fetchFn, verify } = await setup(
        { status },
        { "staging/dft_abc123/video.mp4": 5000 },
      );
      const res = await verify({ intent_id: "int-1", draft_token: "token-attaquant" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("UNAUTHORIZED");
      expect(fetchFn).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    },
  );

  it("refuse une intention expirée selon l'horloge injectée", async () => {
    const { fetchFn, verify } = await setup({ expires_at: new Date(NOW - 1).toISOString() });
    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INTENT_EXPIRED");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("OBJECT_NOT_FOUND sans divulguer la storage_key", async () => {
    const { row, verify } = await setup({});
    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OBJECT_NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain(row.storage_key);
    expect(row.status).toBe("uploading");
  });

  it("SIZE_MISMATCH quand la taille stockée diffère de la taille déclarée", async () => {
    const { updates, verify } = await setup({}, { "staging/dft_abc123/video.mp4": 999 });
    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SIZE_MISMATCH");
    expect(res.body.error).toContain("Taille constatée (999 octets) non conforme");
    expect(updates).toHaveLength(0);
  });

  it("traite un refus de complete_upload_intent comme un échec", async () => {
    const { updates, verify } = await setup(
      { completeRejection: "intent_expired" },
      { "staging/dft_abc123/video.mp4": 5000 },
    );
    const res = await verify({ intent_id: "int-1", draft_token: "bon-token" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: "intent_expired",
      error: "Complétion refusée par la base (intent_expired)",
    });
    expect(updates).toHaveLength(0);
  });

  it("404 pour une intention inconnue, 400 si un champ manque", async () => {
    const { verify } = await setup({});
    expect((await verify({ intent_id: "inconnue", draft_token: "bon-token" })).status).toBe(404);
    expect(await verify({ intent_id: "int-1" })).toEqual({
      status: 400,
      body: { error: "intent_id et draft_token sont obligatoires" },
    });
  });

  it("500 si la base n'est pas configurée", async () => {
    const res = await handleUploadVerificationRoute(
      new Request("https://memora.tn/api/upload/verify", {
        method: "POST",
        body: JSON.stringify({ intent_id: "int-1", draft_token: "bon-token" }),
      }),
      {
        db: () => {
          throw new Error("SUPABASE_URL manquant");
        },
        storage: () => {
          throw new Error("non utilisé");
        },
        uploadSigner: () => {
          throw new Error("non utilisé");
        },
        now: () => NOW,
      },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erreur interne lors de la vérification" });
  });
});

describe("/api/upload/purge (handleOrphanPurge)", () => {
  const SECRET = "secret-cron-999";
  const PURGE_TOKEN = "00000000-0000-0000-0000-000000000001";

  /** Base factice : réclame les intentions expirées, confirme les ids reçus. */
  function purgeDb(intents: Array<{ id: string; storage_key: string; status: string }>) {
    return {
      rpc: vi.fn(async (fn: string, args: any) => {
        if (fn === "claim_orphan_upload_intents_for_purge") {
          const claims = intents
            .filter((i) => i.status === "expired")
            .slice(0, args.p_batch_size)
            .map((i) => ({
              claimed_id: i.id,
              storage_key: i.storage_key,
              purge_token: PURGE_TOKEN,
            }));
          return { data: claims, error: null };
        }
        if (fn === "confirm_purge_upload_intents") {
          return { data: args.p_purged_ids.length, error: null };
        }
        return { data: null, error: { message: "rpc inconnue" } };
      }),
    };
  }

  /** Vrai adaptateur S3 ; `failures[key]` = nombre de DELETE en échec (500) avant succès. */
  function deletingStorage(failures: Record<string, number> = {}) {
    const deleted: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const key = decodeURIComponent(new URL(String(input)).pathname.split("/").slice(2).join("/"));
      if ((failures[key] ?? 0) > 0) {
        failures[key]! -= 1;
        return new Response("<Error><Code>InternalError</Code></Error>", { status: 500 });
      }
      deleted.push(key);
      return new Response(null, { status: 204 });
    });
    const adapter = new S3CompatibleR2Adapter(
      {
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "validaccesskey1234",
        secretAccessKey: "validsecretaccesskey12345678",
        bucketName: "memora-videos",
      },
      fetchFn as unknown as typeof fetch,
    );
    return { adapter, fetchFn, deleted };
  }

  const intents = [
    { id: "o-1", storage_key: "staging/dft_1/a.mp4", status: "expired" },
    { id: "o-2", storage_key: "staging/dft_1/b.jpg", status: "expired" },
    { id: "live", storage_key: "staging/dft_2/c.mp4", status: "ready" },
  ];

  async function purge(
    opts: {
      secret?: string;
      authorization?: string;
      body?: unknown;
      failures?: Record<string, number>;
      db?: any;
    } = {},
  ) {
    const db = opts.db ?? purgeDb(intents);
    const storage = deletingStorage(opts.failures);
    const res = await handleOrphanPurge(
      { db: () => db, storage: () => storage.adapter, cronSecret: () => opts.secret ?? SECRET },
      new Request("https://memora.tn/api/upload/purge", {
        method: opts.body === undefined ? "GET" : "POST",
        headers: { authorization: opts.authorization ?? `Bearer ${SECRET}` },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      }),
    );
    return { status: res.status, body: await res.json(), db, ...storage };
  }

  it("reste fermé (500) sans secret configuré", async () => {
    for (const secret of ["", "   "]) {
      const res = await purge({ secret, authorization: "Bearer " });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe(
        "Configuration serveur incomplète (PURGE_CRON_SECRET non configuré)",
      );
      expect(res.db.rpc).not.toHaveBeenCalled();
    }
  });

  it.each(["Bearer mauvais-secret", "", SECRET, `Bearer ${SECRET}x`])(
    "refuse l'en-tête %j (401) sans toucher la base",
    async (authorization) => {
      const res = await purge({ authorization });
      expect(res).toMatchObject({ status: 401, body: { error: "Non autorisé" } });
      expect(res.db.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([0, 501, 10.5, "10"])("refuse batch_size=%j (400)", async (batch_size) => {
    const res = await purge({ body: { batch_size } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Paramètre batch_size invalide (doit être un entier compris entre 1 et 500)",
    );
    expect(res.db.rpc).not.toHaveBeenCalled();
  });

  it.each([29, 3601, 60.5])("refuse lease_seconds=%j (400)", async (lease_seconds) => {
    const res = await purge({ body: { lease_seconds } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Paramètre lease_seconds invalide (doit être un entier compris entre 30 et 3600)",
    );
    expect(res.db.rpc).not.toHaveBeenCalled();
  });

  it("purge les intentions expirées (GET Cron, bornes par défaut) sans divulguer les clés", async () => {
    const res = await purge();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      claimed_count: 2,
      r2_deleted_count: 2,
      confirmed_db_count: 2,
      failed_count: 0,
    });
    expect(JSON.stringify(res.body)).not.toContain("staging/");
    expect(res.deleted).toEqual(["staging/dft_1/a.mp4", "staging/dft_1/b.jpg"]);
    expect(res.db.rpc.mock.calls).toEqual([
      ["claim_orphan_upload_intents_for_purge", { p_batch_size: 50, p_lease_seconds: 300 }],
      [
        "confirm_purge_upload_intents",
        { p_purged_ids: ["o-1", "o-2"], p_purge_token: PURGE_TOKEN },
      ],
    ]);
  });

  it("transmet batch_size et lease_seconds, et réessaie un DeleteObject en échec passager", async () => {
    const res = await purge({
      body: { batch_size: 1, lease_seconds: 600 },
      failures: { "staging/dft_1/a.mp4": 1 },
    });
    expect(res.body).toEqual({
      claimed_count: 1,
      r2_deleted_count: 1,
      confirmed_db_count: 1,
      failed_count: 0,
    });
    expect(res.fetchFn).toHaveBeenCalledTimes(2);
    expect(res.db.rpc.mock.calls[0]).toEqual([
      "claim_orphan_upload_intents_for_purge",
      { p_batch_size: 1, p_lease_seconds: 600 },
    ]);
  });

  it("ne confirme pas en base un objet dont la suppression échoue toujours", async () => {
    const res = await purge({ failures: { "staging/dft_1/a.mp4": 99 } });
    expect(res.body).toEqual({
      claimed_count: 2,
      r2_deleted_count: 1,
      confirmed_db_count: 1,
      failed_count: 1,
    });
    expect(res.db.rpc).toHaveBeenLastCalledWith("confirm_purge_upload_intents", {
      p_purged_ids: ["o-2"],
      p_purge_token: PURGE_TOKEN,
    });
  });

  it("500 générique si la réclamation SQL échoue", async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) };
    const res = await purge({ db });
    expect(res).toMatchObject({
      status: 500,
      body: { error: "Erreur lors du traitement de la purge" },
    });
    expect(res.fetchFn).not.toHaveBeenCalled();
  });
});
