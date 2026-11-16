/**
 * MÉMORA — Order lifecycle: set_order_status against a local Supabase.
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/order-lifecycle-db.test.ts
 * Calls go through an admin session (anon key + JWT with app_metadata.role = admin),
 * exactly like the admin SPA, so RLS and the update trigger apply.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default keys of every local Supabase stack (public demo values, not secrets).
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

type Status = "pending" | "printing" | "shipped" | "delivered" | "paid" | "cancelled";
const STATUSES: Status[] = ["pending", "printing", "shipped", "delivered", "paid", "cancelled"];
const ALLOWED: Record<Status, Status[]> = {
  pending: ["printing", "cancelled"],
  printing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["paid"],
  paid: [],
  cancelled: [],
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, SERVICE_KEY, opts);

async function signedInClient(role?: "admin"): Promise<SupabaseClient> {
  const email = `lifecycle-${crypto.randomUUID()}@test.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: role ? { role } : {},
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
      order_number: `MEM-LC-${crypto.randomUUID().slice(0, 12)}`,
      customer_name: "Lifecycle Test",
      customer_email: "lifecycle@test.local",
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function makeMemory(orderId: string, status: "active" | "draft" = "active"): Promise<string> {
  const { data, error } = await service
    .from("memories")
    .insert({
      slug: `lc-${crypto.randomUUID()}`,
      title: "Lifecycle",
      video_url: "https://example.test/v.mp4",
      order_id: orderId,
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const orderStatus = async (id: string) =>
  (await service.from("orders").select("status").eq("id", id).single()).data?.status;
const memoryStatus = async (id: string) =>
  (await service.from("memories").select("status").eq("id", id).single()).data?.status;

describe.skipIf(!process.env["LOCAL_DB_TEST"])("set_order_status (local Supabase)", () => {
  let admin: SupabaseClient;
  const setStatus = (id: string, status: string, client = admin) =>
    client.rpc("set_order_status", { p_order_id: id, p_status: status });

  beforeAll(async () => {
    admin = await signedInClient("admin");
  });

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED[from].includes(to);
      it(`${from} → ${to} is ${allowed ? "allowed" : "refused"}`, async () => {
        const id = await makeOrder(from);
        const { data, error } = await setStatus(id, to);
        expect(error).toBeNull();
        if (allowed) {
          expect(data.ok).toBe(true);
          expect(data.order.status).toBe(to);
          expect(await orderStatus(id)).toBe(to);
        } else {
          expect(data).toMatchObject({
            ok: false,
            reason: from === "paid" ? "paid_locked" : "transition_not_allowed",
            from,
            to,
          });
          expect(await orderStatus(id)).toBe(from);
        }
      });
    }
  }

  it("delivered → paid records paid_at", async () => {
    const id = await makeOrder("delivered");
    const { data } = await setStatus(id, "paid");
    expect(data.order.paid_at).toBeTruthy();
  });

  it("paid stays locked even for a direct update (trigger, second line of defence)", async () => {
    const id = await makeOrder("paid");
    const { error } = await admin.from("orders").update({ status: "cancelled" }).eq("id", id);
    expect(error?.message).toMatch(/locked/);
    expect(await orderStatus(id)).toBe("paid");
  });

  it("cancel archives the active Memory in the same call, and leaves others alone", async () => {
    const id = await makeOrder("printing");
    const active = await makeMemory(id);
    const draft = await makeMemory(id, "draft");
    const { data } = await setStatus(id, "cancelled");
    expect(data.ok).toBe(true);
    expect(data.archived_memory_ids).toEqual([active]);
    expect(await memoryStatus(active)).toBe("archived");
    expect(await memoryStatus(draft)).toBe("draft");
  });

  it("a refused cancel changes nothing: order and Memory untouched", async () => {
    const id = await makeOrder("shipped");
    const memory = await makeMemory(id);
    const { data } = await setStatus(id, "cancelled");
    expect(data.reason).toBe("transition_not_allowed");
    expect(await orderStatus(id)).toBe("shipped");
    expect(await memoryStatus(memory)).toBe("active");
  });

  it("refuses an unknown status and an unknown order", async () => {
    const id = await makeOrder("pending");
    expect((await setStatus(id, "confirmed")).data).toEqual({
      ok: false,
      reason: "invalid_status",
    });
    expect((await setStatus(crypto.randomUUID(), "printing")).data).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("a non-admin session cannot see the order; anon cannot call the function", async () => {
    const id = await makeOrder("pending");
    const customer = await signedInClient();
    expect((await setStatus(id, "printing", customer)).data).toEqual({
      ok: false,
      reason: "not_found",
    });
    const anon = createClient(LOCAL_URL, ANON_KEY, opts);
    expect((await setStatus(id, "printing", anon)).error).not.toBeNull();
    expect(await orderStatus(id)).toBe("pending");
  });
});
