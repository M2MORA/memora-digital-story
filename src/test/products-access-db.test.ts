/**
 * MÉMORA — products table against a local Supabase.
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/products-access-db.test.ts
 * Anyone reads active articles, only admins (app_metadata.role = 'admin') read
 * inactive ones and write, and nobody deletes.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchProducts, getProduct } from "@/lib/products";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default keys of every local Supabase stack (public demo values, not secrets).
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, SERVICE_KEY, opts);

async function signedIn(role: "admin" | null): Promise<SupabaseClient> {
  const email = `products-${crypto.randomUUID()}@test.local`;
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

const HIDDEN = `test-inactive-${crypto.randomUUID().slice(0, 8)}`;
const hiddenRow = {
  slug: HIDDEN,
  format: "10x15",
  active: false,
  name: { fr: "Article caché" },
  tagline: { fr: "" },
  description: { fr: "" },
  materials: { fr: [] },
};

const badgeOf = async (slug: string) =>
  (await service.from("products").select("badge").eq("slug", slug).single()).data?.badge;

/** Tries every write; returns what changed on the seeded article and the hidden one. */
async function tryWrites(client: SupabaseClient) {
  await client.from("products").update({ badge: "x" }).eq("id", "p1");
  await client.from("products").update({ active: true }).eq("slug", HIDDEN);
  await client.from("products").insert({ ...hiddenRow, slug: `${HIDDEN}-new` });
  await client.from("products").delete().eq("id", "p1");
  const { data } = await service
    .from("products")
    .select("slug, badge, active")
    .in("slug", ["memora-simple-enveloppe", HIDDEN, `${HIDDEN}-new`])
    .order("slug");
  return data;
}

const UNTOUCHED = [
  { slug: "memora-simple-enveloppe", badge: "L'Essentiel", active: true },
  { slug: HIDDEN, badge: null, active: false },
];

describe.skipIf(!process.env["LOCAL_DB_TEST"])("products table access (local Supabase)", () => {
  beforeAll(async () => {
    const { error } = await service.from("products").insert(hiddenRow);
    if (error) throw error;
  });
  afterAll(async () => {
    await service.from("products").delete().like("slug", `${HIDDEN}%`);
  });

  it("anonymous visitors see the seeded article and no inactive one", async () => {
    const anon = createClient(LOCAL_URL, ANON_KEY, opts);
    const { data } = await anon.from("products").select("slug");
    expect(data?.map((r) => r.slug)).toEqual(["memora-simple-enveloppe"]);
    const products = await fetchProducts(anon);
    expect(products.map((p) => p.id)).toEqual(["p1"]);
    expect(products[0]?.name).toEqual({
      fr: "MÉMORA, la photo",
      en: "MÉMORA, the photo",
      ar: "MÉMORA، الصورة",
    });
    expect(await getProduct(anon, HIDDEN)).toBeNull();
    expect(await getProduct(anon, "memora-simple-enveloppe")).not.toBeNull();
  });

  it("anonymous visitors cannot write", async () => {
    expect(await tryWrites(createClient(LOCAL_URL, ANON_KEY, opts))).toEqual(UNTOUCHED);
  });

  it("a signed-in customer cannot write", async () => {
    expect(await tryWrites(await signedIn(null))).toEqual(UNTOUCHED);
  });

  it("an admin reads inactive articles and writes, but cannot delete", async () => {
    const admin = await signedIn("admin");
    const { data } = await admin.from("products").select("slug").eq("slug", HIDDEN);
    expect(data).toHaveLength(1);
    // The storefront module filters inactive rows even for an admin session.
    expect(await getProduct(admin, HIDDEN)).toBeNull();

    const update = await admin
      .from("products")
      .update({ badge: "Test" })
      .eq("slug", HIDDEN)
      .select();
    expect(update.error).toBeNull();
    expect(await badgeOf(HIDDEN)).toBe("Test");

    const insert = await admin.from("products").insert({ ...hiddenRow, slug: `${HIDDEN}-admin` });
    expect(insert.error).toBeNull();

    const remove = await admin.from("products").delete().eq("slug", HIDDEN);
    expect(remove.error).not.toBeNull();
    expect(await badgeOf(HIDDEN)).toBe("Test");
  });

  it("rejects a bad slug and missing French copy", async () => {
    const admin = await signedIn("admin");
    const slug = await admin.from("products").insert({ ...hiddenRow, slug: "Bad Slug" });
    expect(slug.error?.code).toBe("23514");
    const noFr = await admin
      .from("products")
      .insert({ ...hiddenRow, slug: `${HIDDEN}-nofr`, name: { en: "Only English" } });
    expect(noFr.error?.code).toBe("23514");
  });
});
