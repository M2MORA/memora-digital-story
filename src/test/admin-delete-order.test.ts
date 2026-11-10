import { describe, expect, it, vi } from "vitest";
import server, { handleDeleteOrderRoute } from "../server";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function fakeSupabase(options: {
  user?: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null;
  authError?: { message: string };
  authThrows?: boolean;
  orderStatus?: string;
}) {
  const getUser = vi.fn(async () => {
    if (options.authThrows) throw new Error("network down");
    return { data: { user: options.user ?? null }, error: options.authError ?? null };
  });
  const deleteEq = vi.fn(async () => ({ error: null }));
  const single = vi.fn(async () => ({
    data: { id: ORDER_ID, status: options.orderStatus ?? "cancelled", order_number: "M-1" },
    error: null,
  }));
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ single }) }),
    delete: () => ({ eq: deleteEq }),
  }));

  return { client: { auth: { getUser }, from }, getUser, from, deleteEq };
}

function deleteRequest(authorization?: string, query = `?id=${ORDER_ID}`) {
  return new Request(`https://memora.tn/api/admin/orders${query}`, {
    method: "DELETE",
    headers: authorization ? { authorization } : {},
  });
}

const admin = { app_metadata: { role: "admin" } };

describe("DELETE /api/admin/orders authorization", () => {
  it.each([
    ["no header", undefined],
    ["a non-bearer scheme", "Basic abc"],
    ["an empty bearer token", "Bearer "],
  ])("rejects %s without touching Supabase", async (_label, header) => {
    const sb = fakeSupabase({ user: admin });

    const res = await handleDeleteOrderRoute(
      deleteRequest(header),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(401);
    expect(sb.getUser).not.toHaveBeenCalled();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("rejects a token Supabase Auth does not accept", async () => {
    const sb = fakeSupabase({ authError: { message: "invalid JWT" } });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer bad"),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(401);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("fails closed when the session cannot be verified", async () => {
    const sb = fakeSupabase({ authThrows: true });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer tok"),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(503);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it.each([
    ["no role", { app_metadata: {} }],
    ["a different role", { app_metadata: { role: "editor" } }],
    [
      "admin only in user-editable metadata",
      { app_metadata: {}, user_metadata: { role: "admin" } },
    ],
  ])("forbids a signed-in user with %s", async (_label, user) => {
    const sb = fakeSupabase({ user });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer tok"),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(403);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("lets an admin delete a cancelled order", async () => {
    const sb = fakeSupabase({ user: admin });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer tok"),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(200);
    expect(sb.getUser).toHaveBeenCalledWith("tok");
    expect(sb.deleteEq).toHaveBeenCalledWith("id", ORDER_ID);
  });

  it("still refuses to delete an order that is not cancelled", async () => {
    const sb = fakeSupabase({ user: admin, orderStatus: "paid" });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer tok"),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(400);
    expect(sb.deleteEq).not.toHaveBeenCalled();
  });

  it("requires an order id from an authorized admin", async () => {
    const sb = fakeSupabase({ user: admin });

    const res = await handleDeleteOrderRoute(
      deleteRequest("Bearer tok", ""),
      {},
      { supabaseAdmin: sb.client },
    );

    expect(res.status).toBe(400);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("is rejected through the public server entry without a token", async () => {
    const res = await server.fetch(deleteRequest(), {}, {});

    expect(res.status).toBe(401);
  });

  it("allows the Authorization header in the CORS preflight", async () => {
    const res = await server.fetch(
      new Request("https://memora.tn/api/admin/orders", { method: "OPTIONS" }),
      {},
      {},
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});
