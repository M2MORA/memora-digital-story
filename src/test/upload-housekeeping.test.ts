import { afterEach, describe, expect, it, vi } from "vitest";
import serverEntry, { extendReadyUploadIntent, handleUploadIntentRoute } from "@/server";
import { sha256Hex } from "@/lib/r2-backend";
import { getOrCreateDraftOrderNumber, clearDraftOrderNumber } from "@/lib/draft-manager";

type RecordedUpdate = { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function createSupabaseMock() {
  const updates: RecordedUpdate[] = [];
  const calls: string[] = [];

  const supabaseAdmin = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        calls.push("update");
        const record: RecordedUpdate = { patch, filters: [] };
        updates.push(record);
        const builder: any = {
          then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
        };
        for (const op of ["eq", "in", "lt", "is"]) {
          builder[op] = (column: string, value: unknown) => {
            record.filters.push([op, column, value]);
            return builder;
          };
        }
        return builder;
      },
    }),
    rpc: vi.fn(async () => {
      calls.push("rpc");
      return {
        data: { success: true, intent_id: "intent_1", storage_key: "staging/dft_1/x.mp4" },
        error: null,
      };
    }),
  };

  return { supabaseAdmin, updates, calls };
}

const s3Adapter: any = {
  getPresignedPutUrl: vi.fn(async () => ({
    url: "https://r2.example.com/put",
    requiredHeaders: { "Content-Type": "video/mp4" },
    expiresAt: new Date().toISOString(),
  })),
};

function intentRequest() {
  return new Request("https://memora.tn/api/upload/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draft_id: "dft_1",
      draft_token: "tok_12345678",
      item_id: "item_1",
      file_kind: "video",
      file_name: "clip.mp4",
      mime_type: "video/mp4",
      file_size_bytes: 1000,
      file_extension: "mp4",
    }),
  });
}

function hasFilter(
  update: RecordedUpdate | undefined,
  op: string,
  column: string,
  value?: unknown,
) {
  return Boolean(
    update?.filters.some(
      ([o, c, v]) => o === op && c === column && (value === undefined || v === value),
    ),
  );
}

describe("Maintenance des intentions d'upload", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("libère le quota et remplace l'ancien média, uniquement pour le détenteur du token", async () => {
    const { supabaseAdmin, updates, calls } = createSupabaseMock();
    const tokenHash = await sha256Hex("tok_12345678");

    const res = await handleUploadIntentRoute(intentRequest(), {}, { supabaseAdmin, s3Adapter });

    expect(res.status).toBe(200);
    expect(calls).toEqual(["update", "update", "rpc"]);

    const [expired, replaced] = updates;
    expect(expired?.patch["status"]).toBe("expired");
    expect(hasFilter(expired, "eq", "draft_token_hash", tokenHash)).toBe(true);
    expect(hasFilter(expired, "lt", "expires_at")).toBe(true);

    expect(replaced?.patch["status"]).toBe("cancelled");
    expect(hasFilter(replaced, "eq", "draft_token_hash", tokenHash)).toBe(true);
    expect(hasFilter(replaced, "eq", "item_id", "item_1")).toBe(true);
    expect(hasFilter(replaced, "eq", "file_kind", "video")).toBe(true);
    expect(hasFilter(replaced, "is", "order_id", null)).toBe(true);
  });

  it("ne bloque pas l'envoi si la maintenance échoue", async () => {
    const supabaseAdmin = {
      from: () => {
        throw new Error("indisponible");
      },
      rpc: vi.fn(async () => ({
        data: { success: true, intent_id: "intent_1", storage_key: "staging/dft_1/x.mp4" },
        error: null,
      })),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await handleUploadIntentRoute(intentRequest(), {}, { supabaseAdmin, s3Adapter });
    expect(res.status).toBe(200);
  });

  it("prolonge de 24 h uniquement une intention prête et non rattachée", async () => {
    const { supabaseAdmin, updates } = createSupabaseMock();
    const before = Date.now();

    await extendReadyUploadIntent(supabaseAdmin, "intent_1");

    const [update] = updates;
    const expiresAt = new Date(update?.patch["expires_at"] as string).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(hasFilter(update, "eq", "status", "ready")).toBe(true);
    expect(hasFilter(update, "is", "order_id", null)).toBe(true);
  });

  it("accepte le GET de Vercel Cron, reste fermé sans secret et refuse un mauvais secret", async () => {
    const call = (authorization?: string) =>
      serverEntry.fetch(
        new Request("https://memora.tn/api/upload/purge", {
          method: "GET",
          ...(authorization ? { headers: { authorization } } : {}),
        }),
        {},
        {},
      );

    vi.stubEnv("PURGE_CRON_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(500);

    vi.stubEnv("CRON_SECRET", "le-bon-secret");
    expect((await call("Bearer mauvais-secret")).status).toBe(401);
  });

  it("garde le même numéro de commande pour un même panier jusqu'à sa remise à zéro", () => {
    const first = getOrCreateDraftOrderNumber("dft_order");
    expect(first).toMatch(/^MEM-\d{6}$/);
    expect(getOrCreateDraftOrderNumber("dft_order")).toBe(first);

    clearDraftOrderNumber("dft_order");
    localStorage.clear();
    expect(getOrCreateDraftOrderNumber("dft_other")).toMatch(/^MEM-\d{6}$/);
  });
});
