/**
 * MÉMORA — Phase 3.0 / Step 4 — Tests fonctionnels base de données locale
 * Usage: npx tsx src/test/local-db-integration.test.ts
 */
import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const sb = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pass = (m: string) => console.log(`  ✅ ${m}`);
const fail = (m: string, e?: unknown) => console.error(`  ❌ ${m}`, e ?? "");
const uid = () => crypto.randomUUID();
const draftId = () => `dft_${Math.random().toString(16).slice(2, 18)}`;
const draftTok = () => `tok_${crypto.randomUUID().replace(/-/g, "")}`;

async function main() {
  console.log("=".repeat(60));
  console.log("MÉMORA — DB Integration Tests (Local Supabase)");
  console.log("=".repeat(60));

  // ── TEST 1: Schema verification ──────────────────────────────
  console.log("\n[1] Schema verification");
  for (const tbl of ["upload_intents", "orders", "memories"]) {
    const { error } = await sb.from(tbl).select("id").limit(0);
    error ? fail(`Table ${tbl} inaccessible`, error.message) : pass(`Table ${tbl} OK`);
  }

  // ── TEST 2: create_upload_intent (photo) ──────────────────────
  console.log("\n[2] create_upload_intent — photo");
  const did = draftId();
  const dtok = draftTok();
  const { data: p, error: pe } = await sb.rpc("create_upload_intent", {
    p_draft_id: did,
    p_draft_token: dtok,
    p_file_kind: "photo",
    p_file_name: "test.jpg",
    p_mime_type: "image/jpeg",
    p_file_size_bytes: 512000,
    p_file_extension: "jpg",
    p_item_id: "item_001",
  });
  if (pe || !p?.intent_id) { fail("photo intent failed", pe?.message ?? p); process.exit(1); }
  pass(`photo intent: ${p.intent_id}`);
  pass(`storage_key : ${p.storage_key}`);
  const photoId = p.intent_id as string;

  // ── TEST 3: create_upload_intent (video) ─────────────────────
  console.log("\n[3] create_upload_intent — video");
  const { data: v, error: ve } = await sb.rpc("create_upload_intent", {
    p_draft_id: did,
    p_draft_token: dtok,
    p_file_kind: "video",
    p_file_name: "test.mp4",
    p_mime_type: "video/mp4",
    p_file_size_bytes: 10 * 1024 * 1024,
    p_file_extension: "mp4",
    p_item_id: "item_001",
  });
  if (ve || !v?.intent_id) { fail("video intent failed", ve?.message ?? v); process.exit(1); }
  pass(`video intent: ${v.intent_id}`);
  const videoId = v.intent_id as string;

  // ── TEST 4: Mark intents 'ready' (simulate backend verify) ───
  console.log("\n[4] Marking intents as 'ready'");
  for (const id of [photoId, videoId]) {
    const { error } = await sb.from("upload_intents").update({ status: "ready" }).eq("id", id);
    error ? fail(`mark ready ${id}`, error.message) : pass(`intent ${id} → ready`);
  }

  // ── TEST 5: finalize_order_with_intents ───────────────────────
  console.log("\n[5] finalize_order_with_intents");
  const orderNum = `MEM-TEST-${Date.now()}`;
  const idemKey = `idem_${did}_${orderNum}`;
  const { data: fin, error: fe } = await sb.rpc("finalize_order_with_intents", {
    p_order_payload: {
      order_number: orderNum,
      customer_name: "Test Client",
      customer_email: "test@memora.tn",
      customer_phone: "+21612345678",
      shipping_address: { address: "1 Rue Test", city: "Tunis", country: "TN", recipient: "Test Client" },
      items: [{ id: "item_001", productId: "p1", format: "10x15", qty: 1, withFrame: false, videoDurationSec: 30 }],
      shipping_carrier: "aramex",
    },
    p_draft_id: did,
    p_draft_token: dtok,
    p_intent_mappings: [
      { item_id: "item_001", intent_id: photoId, file_kind: "photo" },
      { item_id: "item_001", intent_id: videoId, file_kind: "video" },
    ],
    p_idempotency_key: idemKey,
  });
  if (fe || !fin?.success) { fail("finalize failed", fe?.message ?? fin); process.exit(1); }
  pass(`order finalized: ${fin.order_number}`);
  pass(`order_id: ${fin.order_id}`);

  // ── TEST 6: Idempotent replay ─────────────────────────────────
  console.log("\n[6] Idempotent replay");
  const { data: rp, error: re } = await sb.rpc("finalize_order_with_intents", {
    p_order_payload: {
      order_number: orderNum,
      customer_name: "Test Client",
      customer_email: "test@memora.tn",
      customer_phone: "+21612345678",
      shipping_address: { address: "1 Rue Test", city: "Tunis", country: "TN", recipient: "Test Client" },
      items: [{ id: "item_001", productId: "p1", format: "10x15", qty: 1, withFrame: false, videoDurationSec: 30 }],
      shipping_carrier: "aramex",
    },
    p_draft_id: did,
    p_draft_token: dtok,
    p_intent_mappings: [
      { item_id: "item_001", intent_id: photoId, file_kind: "photo" },
      { item_id: "item_001", intent_id: videoId, file_kind: "video" },
    ],
    p_idempotency_key: idemKey,
  });
  if (re) { fail("idempotent replay error", re.message); }
  else if (rp?.idempotent_replay === true) { pass(`idempotent_replay=true (order ${rp.order_number})`); }
  else { fail("replay didn't return idempotent_replay=true", rp); }

  // ── TEST 7: Invalid intent UUID rejected ─────────────────────
  console.log("\n[7] Invalid intent UUID — rejection expected");
  const did2 = draftId(); const dtok2 = draftTok();
  const { data: bad, error: be } = await sb.rpc("finalize_order_with_intents", {
    p_order_payload: {
      order_number: `MEM-BAD-${Date.now()}`,
      customer_name: "Bad", customer_email: "bad@test.tn", customer_phone: "+21600000000",
      shipping_address: { address: "x", city: "Tunis", country: "TN", recipient: "Bad" },
      items: [{ id: "itm2", productId: "p1", format: "10x15", qty: 1, withFrame: false, videoDurationSec: 0 }],
      shipping_carrier: "aramex",
    },
    p_draft_id: did2, p_draft_token: dtok2,
    p_intent_mappings: [
      { item_id: "itm2", intent_id: "00000000-0000-0000-0000-000000000000", file_kind: "photo" },
      { item_id: "itm2", intent_id: "00000000-0000-0000-0000-000000000000", file_kind: "video" },
    ],
    p_idempotency_key: `idem_${did2}`,
  });
  if (be || !bad?.success) { pass(`Invalid intent correctly rejected: ${be?.message?.slice(0, 80) ?? "success=false"}`); }
  else { fail("Invalid intent was NOT rejected", bad); }

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed");
  console.log("=".repeat(60));
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
