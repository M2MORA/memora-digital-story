/**
 * MÉMORA — Pricing tables (formats, price_tiers, pricing_settings) against a local Supabase.
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/pricing-access-db.test.ts
 * Anyone reads the grid, only admins (app_metadata.role = 'admin') write it,
 * and every format keeps a first tier at quantity 1.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchPricing } from "@/lib/pricing";
import { TODAY_PRICING } from "./pricing-fixture";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default keys of every local Supabase stack (public demo values, not secrets).
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, SERVICE_KEY, opts);

async function signedIn(role: "admin" | null): Promise<SupabaseClient> {
  const email = `pricing-${crypto.randomUUID()}@test.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(role ? { app_metadata: { role } } : {}),
  });
  if (error) throw error;
  const client = createClient(LOCAL_URL, ANON_KEY, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return client;
}

const tierPrice = async (format: string, minQty: number) =>
  (
    await service
      .from("price_tiers")
      .select("unit_price")
      .eq("format", format)
      .eq("min_qty", minQty)
      .single()
  ).data?.unit_price;

/** Tries every write on the three tables; returns what changed in the database. */
async function tryWrites(client: SupabaseClient) {
  await client.from("price_tiers").update({ unit_price: 1 }).eq("format", "10x15").eq("min_qty", 1);
  await client.from("price_tiers").insert({ format: "10x15", min_qty: 7, unit_price: 1 });
  await client.from("price_tiers").delete().eq("format", "10x15").eq("min_qty", 100);
  await client.from("formats").update({ frame_price: 1 }).eq("code", "10x15");
  await client.from("formats").insert({ code: "99x99", frame_price: 1 });
  await client.from("pricing_settings").update({ shipping_fee_aramex: 1 }).eq("id", true);
  await client.from("pricing_settings").delete().eq("id", true);
  const pricing = await fetchPricing(service);
  const tier = (minQty: number) =>
    pricing.tiers.find((t) => t.format === "10x15" && t.min_qty === minQty)?.unit_price;
  return {
    tiers: [tier(1), tier(7), tier(100)],
    formats: pricing.formats.map((f) => `${f.code}:${f.frame_price}`),
    aramex: pricing.settings?.shipping_fee_aramex,
  };
}

// Only the rows tryWrites touches (the parity test changes another tier alongside).
const UNTOUCHED = {
  tiers: [49, undefined, 20],
  formats: ["10x15:50", "20x30:120", "30x45:150", "box:0", "magnet:0"],
  aramex: 8,
};

describe.skipIf(!process.env["LOCAL_DB_TEST"])("pricing tables access (local Supabase)", () => {
  it("anonymous visitors read the grid and get_pricing(), without promo codes", async () => {
    const anon = createClient(LOCAL_URL, ANON_KEY, opts);
    const { data: tiers } = await anon.from("price_tiers").select("*");
    expect(tiers).toHaveLength(TODAY_PRICING.tiers.length);
    const { data: formats } = await anon.from("formats").select("*");
    expect(formats).toHaveLength(5);
    const { data: settings } = await anon.from("pricing_settings").select("*");
    expect(settings).toHaveLength(1);
    const pricing = await fetchPricing(anon);
    expect(pricing.tiers).toHaveLength(TODAY_PRICING.tiers.length);
    expect(pricing.settings).toEqual(TODAY_PRICING.settings);
    expect(JSON.stringify(pricing)).not.toMatch(/promo|MEMORA10|VIP20|BIENVENUE/i);
  });

  it("anonymous visitors cannot write", async () => {
    expect(await tryWrites(createClient(LOCAL_URL, ANON_KEY, opts))).toEqual(UNTOUCHED);
  });

  it("a signed-in customer cannot write", async () => {
    expect(await tryWrites(await signedIn(null))).toEqual(UNTOUCHED);
  });

  // Writes keep today's values (or a tier no test cart reaches): the parity test runs alongside.
  it("an admin can update a tier, add and remove one, and update the settings", async () => {
    const admin = await signedIn("admin");
    const update = await admin
      .from("price_tiers")
      .update({ unit_price: 42 })
      .eq("format", "10x15")
      .eq("min_qty", 5)
      .select();
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);

    const insert = await admin
      .from("price_tiers")
      .insert({ format: "10x15", min_qty: 10000, unit_price: 19 })
      .select();
    expect(insert.error).toBeNull();
    expect(await tierPrice("10x15", 10000)).toBe(19);
    const remove = await admin
      .from("price_tiers")
      .delete()
      .eq("format", "10x15")
      .eq("min_qty", 10000)
      .select();
    expect(remove.data).toHaveLength(1);

    const settings = await admin
      .from("pricing_settings")
      .update({ free_shipping_threshold: 250 })
      .eq("id", true)
      .select();
    expect(settings.error).toBeNull();
    expect(settings.data).toHaveLength(1);
  });

  it("rejects a grid without a first tier at 1, a negative price or a tier below 1", async () => {
    const admin = await signedIn("admin");
    const noFirst = await admin.from("price_tiers").delete().eq("format", "box").eq("min_qty", 1);
    expect(noFirst.error?.message).toMatch(/first price tier must start at quantity 1/);
    const negative = await admin
      .from("price_tiers")
      .update({ unit_price: -1 })
      .eq("format", "box")
      .eq("min_qty", 5);
    expect(negative.error?.code).toBe("23514");
    const zeroQty = await admin
      .from("price_tiers")
      .insert({ format: "box", min_qty: 0, unit_price: 1 });
    expect(zeroQty.error?.code).toBe("23514");
    const duplicate = await admin
      .from("price_tiers")
      .insert({ format: "box", min_qty: 5, unit_price: 1 });
    expect(duplicate.error?.code).toBe("23505");
    expect(await tierPrice("box", 1)).toBe(89);
    expect(await tierPrice("box", 5)).toBe(79);
  });
});
