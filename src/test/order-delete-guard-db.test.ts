/**
 * MÉMORA — Order delete guard (trg_guard_order_delete) against a local Supabase.
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/order-delete-guard-db.test.ts
 * Only a cancelled order can be deleted, whatever the caller: the service role
 * (used by DELETE /api/admin/orders, bypasses RLS) and an admin session alike.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default keys of every local Supabase stack (public demo values, not secrets).
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

type Status = "pending" | "printing" | "shipped" | "delivered" | "paid" | "cancelled";
const LIVE: Status[] = ["pending", "printing", "shipped", "delivered", "paid"];

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, SERVICE_KEY, opts);

async function adminClient() {
  const email = `delete-guard-${crypto.randomUUID()}@test.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (error) throw error;
  const client = createClient(LOCAL_URL, ANON_KEY, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return client;
}

async function makeOrder(status: Status): Promise<string> {
  const { data, error } = await service
    .from("orders")
    .insert({
      order_number: `MEM-DG-${crypto.randomUUID().slice(0, 12)}`,
      customer_name: "Delete Guard Test",
      customer_email: "delete-guard@test.local",
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function makeMemory(orderId: string): Promise<string> {
  const { data, error } = await service
    .from("memories")
    .insert({
      slug: `dg-${crypto.randomUUID()}`,
      title: "Delete guard",
      video_url: "https://example.test/v.mp4",
      order_id: orderId,
      status: "archived",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const orderExists = async (id: string) =>
  (await service.from("orders").select("id").eq("id", id).maybeSingle()).data !== null;

describe.skipIf(!process.env["LOCAL_DB_TEST"])("order delete guard (local Supabase)", () => {
  for (const status of LIVE) {
    it(`service role cannot delete a ${status} order`, async () => {
      const id = await makeOrder(status);
      const { error } = await service.from("orders").delete().eq("id", id);
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/only cancelled orders can be deleted/);
      expect(await orderExists(id)).toBe(true);
    });
  }

  it("an admin session cannot delete a non-cancelled order", async () => {
    const admin = await adminClient();
    const id = await makeOrder("pending");
    await admin.from("orders").delete().eq("id", id);
    expect(await orderExists(id)).toBe(true);
  });

  it("a cancelled order is deleted and its Memory is detached (ON DELETE SET NULL)", async () => {
    const id = await makeOrder("cancelled");
    const memory = await makeMemory(id);
    const { error } = await service.from("orders").delete().eq("id", id);
    expect(error).toBeNull();
    expect(await orderExists(id)).toBe(false);
    const { data } = await service.from("memories").select("order_id").eq("id", memory).single();
    expect(data?.order_id).toBeNull();
  });
});
