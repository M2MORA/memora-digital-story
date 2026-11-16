/**
 * MÉMORA — The SQL Quote prices a catalogue article at its format (20261120120000).
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/quote-products-db.test.ts
 * Legacy inputs ('p1' with any format, pattern ids) are covered by quote-parity-db.test.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default service key of every local Supabase stack (public demo value, not a secret).
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const service = createClient(LOCAL_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PREFIX = `test-quote-${crypto.randomUUID().slice(0, 8)}`;
const copy = {
  name: { fr: "Article de test" },
  tagline: { fr: "" },
  description: { fr: "" },
  materials: { fr: [] },
};
let activeId = "";
let inactiveId = "";

const quote = (item: Record<string, unknown>) =>
  service.rpc("calculate_order_quote", {
    p_items: [{ id: "item_0", qty: 2, withFrame: true, videoDurationSec: 600, ...item }],
    p_promo_code: null,
    p_shipping_carrier: "aramex",
  });

describe.skipIf(!process.env["LOCAL_DB_TEST"])("SQL Quote and catalogue articles (local Supabase)", () => {
  beforeAll(async () => {
    const { data, error } = await service
      .from("products")
      .insert([
        { ...copy, slug: `${PREFIX}-box`, format: "box", active: true },
        { ...copy, slug: `${PREFIX}-off`, format: "box", active: false },
      ])
      .select("id, slug");
    if (error) throw error;
    activeId = data.find((r) => r.slug === `${PREFIX}-box`)!.id as string;
    inactiveId = data.find((r) => r.slug === `${PREFIX}-off`)!.id as string;
  });
  afterAll(async () => {
    await service.from("products").delete().like("slug", `${PREFIX}%`);
  });

  it("prices a new article at its format, with or without the format field", async () => {
    // Reference: the box price as today's checkout gets it.
    const reference = await quote({ productId: "p1", format: "box" });
    expect(reference.error).toBeNull();
    expect(reference.data.lines[0].format).toBe("box");

    const withoutFormat = await quote({ productId: activeId });
    expect(withoutFormat.error).toBeNull();
    expect(withoutFormat.data).toEqual(reference.data);

    const withFormat = await quote({ productId: activeId, format: "box" });
    expect(withFormat.error).toBeNull();
    expect(withFormat.data).toEqual(reference.data);
  });

  it("refuses a format that is not the article's", async () => {
    const { error } = await quote({ productId: activeId, format: "10x15" });
    expect(error?.message).toMatch(/ne correspond pas à l'article/);
  });

  it("refuses an inactive article, even with an explicit format", async () => {
    for (const item of [{ productId: inactiveId }, { productId: inactiveId, format: "box" }]) {
      const { error } = await quote(item);
      expect(error?.message).toMatch(/Article indisponible/);
    }
  });
});
