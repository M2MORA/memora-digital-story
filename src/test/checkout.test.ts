import { describe, expect, it, vi } from "vitest";
import {
  resumeUploads,
  submitOrder,
  type CheckoutDeps,
  type CheckoutInput,
  type ResumeUploadsDeps,
} from "../lib/checkout";
import type { CartItem } from "../lib/cart";
import type { FinalizeOrderParams, FinalizeOrderResponse } from "../lib/supabase";

// ---------------------------------------------------------------- fakes

const DRAFT = "draft_1";
const item = (key: string): CartItem => ({
  key,
  productId: "memora-card",
  format: "10x15",
  qty: 1,
  videoDurationSec: 30,
});

/** Serveur de commandes : une commande par clé d'idempotence, comme finalize_order_with_intents. */
function fakeWorld(opts: { cached?: boolean } = {}) {
  const orders = new Map<string, FinalizeOrderParams>();
  const calls: FinalizeOrderParams[] = [];
  /** Réponses forcées, consommées dans l'ordre ; ensuite le serveur accepte. */
  const script: Array<"expired" | "clash" | "rejected" | "drop_after_commit" | "offline"> = [];
  const media = new Map<string, File>();
  let orderNumberSeq = 0;
  let storedOrderNumber: string | null = null;
  let uploadSeq = 0;
  const forgotten: string[] = [];
  const clearedMedia: string[] = [];
  let cartCleared = 0;

  const putMedia = (itemKey: string) => {
    media.set(`${DRAFT}:${itemKey}:photo`, new File(["p"], "p.jpg"));
    media.set(`${DRAFT}:${itemKey}:video`, new File(["v"], "v.mp4"));
  };
  if (opts.cached !== false) putMedia("a");

  const deps: CheckoutDeps = {
    async finalizeOrder(params): Promise<FinalizeOrderResponse> {
      calls.push(params);
      const next = script.shift();
      if (next === "expired") return { success: false, error: "Upload intent expired" };
      if (next === "clash")
        return { success: false, error: 'duplicate key value violates "orders_order_number_key"' };
      if (next === "rejected") return { success: false, error: "Montant invalide" };
      if (next === "offline") throw new TypeError("Failed to fetch");
      const replay = orders.has(params.idempotencyKey);
      if (!replay) orders.set(params.idempotencyKey, params);
      // La commande est enregistrée mais la réponse se perd en route
      if (next === "drop_after_commit") return { success: false, error: "Failed to fetch" };
      return { success: true, order_id: "o1", total: 79, idempotent_replay: replay };
    },
    async resolveUploadIntent({ itemId, kind }) {
      return `intent_${itemId}_${kind}_${++uploadSeq}`;
    },
    forgetUploads: (draftId) => forgotten.push(draftId),
    media: {
      get: async (key) => media.get(key) ?? null,
      clearDraft: async (draftId) => {
        clearedMedia.push(draftId);
      },
    },
    draft: {
      getOrderNumber: () => (storedOrderNumber ??= `MEM-${++orderNumberSeq}`),
      clearOrderNumber: () => {
        storedOrderNumber = null;
      },
    },
    clearCart: () => {
      cartCleared++;
    },
  };

  return {
    deps,
    orders,
    calls,
    script,
    forgotten,
    clearedMedia,
    putMedia,
    get cartCleared() {
      return cartCleared;
    },
    get storedOrderNumber() {
      return storedOrderNumber;
    },
  };
}

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  items: [item("a")],
  promoCode: "",
  draftId: DRAFT,
  draftToken: "tok",
  customer: {
    name: "Amira Ben Ali",
    phone: "+216 98765432",
    governorate: "Tunis",
    address: "12 rue de Rome",
  },
  ...over,
});

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

// ---------------------------------------------------------------- tests

describe("submitOrder", () => {
  it("success: finalizes once with intents, customer and stable idempotency key", async () => {
    const w = fakeWorld();
    const steps: string[] = [];
    const result = await submitOrder(input({ onStep: (s) => steps.push(s) }), w.deps);

    expect(result).toEqual({ ok: true, orderNumber: "MEM-1", total: 79 });
    expect(steps).toEqual(["preparing", "uploading_media", "finalizing"]);
    expect(w.calls).toHaveLength(1);
    const call = w.calls[0]!;
    expect(call.idempotencyKey).toBe(`idem_${DRAFT}`);
    expect(call.intentMappings.map((m) => m.file_kind)).toEqual(["photo", "video"]);
    expect(call.orderPayload).toMatchObject({
      order_number: "MEM-1",
      customer_name: "Amira Ben Ali",
      customer_phone: "+216 98765432",
      shipping_address: { city: "Tunis", address: "12 rue de Rome", carrier: "aramex" },
      promo_code: undefined,
    });
  });

  it("cleanup after success: uploads, order number, cached media and cart", async () => {
    const w = fakeWorld();
    await submitOrder(input(), w.deps);
    expect(w.forgotten).toEqual([DRAFT]);
    expect(w.storedOrderNumber).toBeNull();
    expect(w.clearedMedia).toEqual([DRAFT]);
    expect(w.cartCleared).toBe(1);
  });

  it("falls back to the local quote when the server returns no total", async () => {
    const w = fakeWorld();
    w.deps.finalizeOrder = async () => ({ success: true });
    const result = await submitOrder(input(), w.deps);
    expect(result.ok && result.total).toBeGreaterThan(0);
  });

  it("expired uploads: forgets them, re-resolves fresh intents and retries once", async () => {
    const w = fakeWorld();
    w.script.push("expired");
    const result = await submitOrder(input(), w.deps);

    expect(result.ok).toBe(true);
    expect(w.calls).toHaveLength(2);
    expect(w.calls[1]!.intentMappings).not.toEqual(w.calls[0]!.intentMappings);
    expect(w.orders.size).toBe(1);
  });

  it("uploads still expired after the retry: uploads_expired, nothing cleaned up", async () => {
    quiet();
    const w = fakeWorld();
    w.script.push("expired", "expired");
    const result = await submitOrder(input(), w.deps);

    expect(result).toEqual({
      ok: false,
      error: { type: "uploads_expired", message: "Upload intent expired" },
    });
    expect(w.calls).toHaveLength(2);
    expect(w.cartCleared).toBe(0);
    expect(w.clearedMedia).toEqual([]);
  });

  it("order-number clash: clears the number so the next attempt draws a new one", async () => {
    quiet();
    const w = fakeWorld();
    w.script.push("clash");
    const first = await submitOrder(input(), w.deps);
    expect(first.ok).toBe(false);
    expect(!first.ok && first.error.type).toBe("order_number_clash");
    expect(w.storedOrderNumber).toBeNull();

    const second = await submitOrder(input(), w.deps);
    expect(second).toMatchObject({ ok: true, orderNumber: "MEM-2" });
  });

  it("network failure: typed network error, cart kept", async () => {
    quiet();
    const w = fakeWorld();
    w.script.push("offline");
    const result = await submitOrder(input(), w.deps);
    expect(result).toEqual({ ok: false, error: { type: "network", message: "Failed to fetch" } });
    expect(w.cartCleared).toBe(0);
    expect(w.storedOrderNumber).toBe("MEM-1");
  });

  it("retry after a dropped response never creates a second order", async () => {
    quiet();
    const w = fakeWorld();
    w.script.push("drop_after_commit");
    const first = await submitOrder(input(), w.deps);
    expect(!first.ok && first.error.type).toBe("network");

    const retry = await submitOrder(input(), w.deps);
    expect(retry).toMatchObject({ ok: true, orderNumber: "MEM-1" });
    expect(w.orders.size).toBe(1);
    expect(w.calls.map((c) => c.idempotencyKey)).toEqual([`idem_${DRAFT}`, `idem_${DRAFT}`]);
  });

  it("rejected order: raw server message, no cleanup", async () => {
    quiet();
    const w = fakeWorld();
    w.script.push("rejected");
    const result = await submitOrder(input(), w.deps);
    expect(result).toEqual({ ok: false, error: { type: "rejected", message: "Montant invalide" } });
    expect(w.forgotten).toEqual([]);
    expect(w.cartCleared).toBe(0);
  });

  it("missing cached media: reports which file of which item, never finalizes", async () => {
    const w = fakeWorld({ cached: false });
    w.putMedia("a");
    const result = await submitOrder(input({ items: [item("a"), item("b")] }), w.deps);
    expect(result).toEqual({
      ok: false,
      error: { type: "missing_media", kind: "photo", index: 2 },
    });
    expect(w.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- resumeUploads

/** File d'envois : un seul envoi par article et type tant qu'il est en cours, comme startBackgroundUpload. */
function fakeQueue(cachedItems: string[]) {
  const media = new Map<string, File>();
  for (const key of cachedItems) {
    media.set(`${DRAFT}:${key}:photo`, new File(["p"], "p.jpg"));
    media.set(`${DRAFT}:${key}:video`, new File(["v"], "v.mp4"));
  }
  const inFlight = new Map<string, Promise<string>>();
  const started: string[] = [];
  const deps: ResumeUploadsDeps = {
    resolveUploadIntent({ itemId, kind }) {
      const key = `${itemId}:${kind}`;
      const existing = inFlight.get(key);
      if (existing) return existing;
      started.push(key);
      const promise = new Promise<string>(() => {}); // reste en cours
      inFlight.set(key, promise);
      return promise;
    },
    media: { get: async (key) => media.get(key) ?? null },
  };
  return { deps, started };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const resumeInput = (stage: string, items: CartItem[]) => ({
  stage,
  items,
  draftId: DRAFT,
  draftToken: "tok",
});

describe("resumeUploads", () => {
  it("entering the cart restarts every cached upload", async () => {
    const q = fakeQueue(["a", "b"]);
    resumeUploads(resumeInput("cart", [item("a"), item("b")]), q.deps);
    await flush();
    expect(q.started).toEqual(["a:photo", "a:video", "b:photo", "b:video"]);
  });

  it("delivery resumes too; earlier stages and missing draft do not", async () => {
    const q = fakeQueue(["a"]);
    resumeUploads(resumeInput("photo", [item("a")]), q.deps);
    resumeUploads({ ...resumeInput("cart", [item("a")]), draftId: "" }, q.deps);
    await flush();
    expect(q.started).toEqual([]);
    resumeUploads(resumeInput("delivery", [item("a")]), q.deps);
    await flush();
    expect(q.started).toEqual(["a:photo", "a:video"]);
  });

  it("an item already uploading is not uploaded twice", async () => {
    const q = fakeQueue(["a"]);
    resumeUploads(resumeInput("cart", [item("a")]), q.deps);
    await flush();
    resumeUploads(resumeInput("delivery", [item("a")]), q.deps);
    await flush();
    expect(q.started).toEqual(["a:photo", "a:video"]);
  });

  it("removed items are not resumed, even if the previous pass was still reading", async () => {
    const q = fakeQueue(["a", "b"]);
    const cancel = resumeUploads(resumeInput("cart", [item("a"), item("b")]), q.deps);
    cancel(); // « b » retiré avant la fin de la lecture du cache
    resumeUploads(resumeInput("cart", [item("a")]), q.deps);
    await flush();
    expect(q.started).toEqual(["a:photo", "a:video"]);
  });

  it("items without cached media are skipped", async () => {
    const q = fakeQueue([]);
    resumeUploads(resumeInput("cart", [item("a")]), q.deps);
    await flush();
    expect(q.started).toEqual([]);
  });
});
