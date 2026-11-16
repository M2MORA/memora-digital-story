/**
 * MÉMORA — catalogue photo bucket against a local Supabase.
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/catalogue-storage-db.test.ts
 * Anyone reads, only admins (app_metadata.role = 'admin') upload and delete,
 * and the bucket refuses non-images.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default keys of every local Supabase stack (public demo values, not secrets).
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, SERVICE_KEY, opts);
const BUCKET = "catalogue";
const FOLDER = `test-${crypto.randomUUID()}`;

async function signedIn(role: "admin" | null): Promise<SupabaseClient> {
  const email = `catalogue-${crypto.randomUUID()}@test.local`;
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

// 1×1 PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const png = () => new Blob([PNG], { type: "image/png" });

const exists = async (path: string) => {
  const { data } = await service.storage
    .from(BUCKET)
    .list(FOLDER, { search: path.slice(FOLDER.length + 1) });
  return (data ?? []).length > 0;
};

/** Seeds one object as the service role and returns its path. */
async function seeded() {
  const path = `${FOLDER}/${crypto.randomUUID()}.png`;
  const { error } = await service.storage
    .from(BUCKET)
    .upload(path, png(), { contentType: "image/png" });
  if (error) throw error;
  return path;
}

/** Tries upload, overwrite and delete; returns what actually happened. */
async function tryWrites(client: SupabaseClient) {
  const target = await seeded();
  const newPath = `${FOLDER}/${crypto.randomUUID()}.png`;
  const upload = await client.storage
    .from(BUCKET)
    .upload(newPath, png(), { contentType: "image/png" });
  await client.storage
    .from(BUCKET)
    .upload(target, png(), { contentType: "image/png", upsert: true });
  await client.storage.from(BUCKET).remove([target]);
  return {
    uploaded: !upload.error && (await exists(newPath)),
    targetStillThere: await exists(target),
  };
}

describe.skipIf(!process.env["LOCAL_DB_TEST"])("catalogue bucket access (local Supabase)", () => {
  afterAll(async () => {
    const { data } = await service.storage.from(BUCKET).list(FOLDER);
    if (data?.length)
      await service.storage.from(BUCKET).remove(data.map((o) => `${FOLDER}/${o.name}`));
  });

  it("anyone reads a photo through its public URL", async () => {
    const path = await seeded();
    const anon = createClient(LOCAL_URL, ANON_KEY, opts);
    const res = await fetch(anon.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("anonymous visitors cannot upload, replace or delete", async () => {
    expect(await tryWrites(createClient(LOCAL_URL, ANON_KEY, opts))).toEqual({
      uploaded: false,
      targetStillThere: true,
    });
  });

  it("a signed-in customer cannot upload, replace or delete", async () => {
    expect(await tryWrites(await signedIn(null))).toEqual({
      uploaded: false,
      targetStillThere: true,
    });
  });

  it("an admin uploads and deletes", async () => {
    expect(await tryWrites(await signedIn("admin"))).toEqual({
      uploaded: true,
      targetStillThere: false,
    });
  });

  it("the bucket refuses non-images and files over 5 MB, even for an admin", async () => {
    const admin = await signedIn("admin");
    const text = await admin.storage
      .from(BUCKET)
      .upload(`${FOLDER}/note.txt`, new Blob(["hi"], { type: "text/plain" }), {
        contentType: "text/plain",
      });
    expect(text.error).not.toBeNull();
    const big = await admin.storage
      .from(BUCKET)
      .upload(
        `${FOLDER}/big.png`,
        new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
        {
          contentType: "image/png",
        },
      );
    expect(big.error).not.toBeNull();
  });
});
