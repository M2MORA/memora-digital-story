/**
 * MÉMORA — Quote parity: the TS quote (display) vs the SQL quote (charged).
 * Skipped unless LOCAL_DB_TEST is set. Usage:
 *   npx supabase start && LOCAL_DB_TEST=1 npx vitest run src/test/quote-parity-db.test.ts
 * Each cart is sent in the shape the checkout sends (src/routes/commander.tsx,
 * normalizedItems) to calculate_order_quote, and compared with calculateQuote fed
 * with get_pricing() and the percent check_promo_code() gives for the cart's code. The raw SQL answers are also compared with
 * quote-parity-snapshot.json, recorded from the SQL Quote before prices moved to the
 * database (20261116120000): same bytes, lines included. To record it again on purpose:
 *   WRITE_QUOTE_SNAPSHOT=1 LOCAL_DB_TEST=1 npx vitest run src/test/quote-parity-db.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  checkPromoCode,
  fetchPricing,
  getFramePrice,
  getTiers,
  getUnitPrice,
  SHIPPING_MODES,
  type Format,
  type QuoteLine,
  type ShippingMode,
} from "@/lib/pricing";
import { TODAY_PRICING } from "./pricing-fixture";

const LOCAL_URL = "http://127.0.0.1:54321";
// Default service key of every local Supabase stack (public demo value, not a secret).
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const service = createClient(LOCAL_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SNAPSHOT = "src/test/quote-parity-snapshot.json"; // vitest runs from the repo root
const FORMATS = TODAY_PRICING.formats.map((f) => f.code);

// Same mapping as the checkout's normalizedItems (cardMessage/personalization do not affect price).
const toPayloadItems = (lines: QuoteLine[]) =>
  lines.map((line, i) => ({
    id: `item_${i}`,
    productId: "p1",
    format: line.format,
    withFrame: line.withFrame ?? false,
    videoDurationSec: line.videoDurationSec,
    qty: line.quantity,
  }));

interface Case {
  name: string;
  lines: QuoteLine[];
  promo?: string;
  shipping: ShippingMode;
}

function buildMatrix(): Case[] {
  const cases: Case[] = [];
  // Every format x every tier boundary (and one below it) x frame on/off, both carriers.
  for (const format of FORMATS) {
    const qtys = new Set(
      getTiers(TODAY_PRICING, format).flatMap((t) => [t.min_qty, Math.max(1, t.min_qty - 1)]),
    );
    for (const quantity of qtys) {
      for (const withFrame of [false, true]) {
        for (const shipping of SHIPPING_MODES) {
          cases.push({
            name: `${format} x${quantity}${withFrame ? " +frame" : ""} ${shipping}`,
            lines: [{ format, quantity, withFrame }],
            shipping,
          });
        }
      }
    }
  }
  // Video surcharge around the included 8 minutes and at the 30 min cap.
  for (const videoDurationSec of [0, 480, 481, 540, 541, 1800]) {
    cases.push({
      name: `video ${videoDurationSec}s x2`,
      lines: [{ format: "10x15", quantity: 2, videoDurationSec }],
      shipping: "aramex",
    });
  }
  // Each promo code (plus messy casing, unknown and empty), below and above free shipping.
  // The codes seeded by 20261118120000 (hardcoded until then).
  const promos = ["MEMORA10", "BIENVENUE", "VIP20", " vip20 ", "bienvenue", "NOPE", ""];
  for (const promo of promos) {
    for (const quantity of [1, 3]) {
      for (const shipping of SHIPPING_MODES) {
        cases.push({
          name: `promo "${promo}" box x${quantity} ${shipping}`,
          lines: [{ format: "box", quantity }],
          promo,
          shipping,
        });
      }
    }
  }
  // Around the free-shipping threshold (250 TND after discount).
  cases.push(
    {
      name: "249 TND (just below free)",
      lines: [
        { format: "box", quantity: 1 },
        { format: "magnet", quantity: 1, videoDurationSec: 1680 },
        { format: "magnet", quantity: 1 },
      ],
      shipping: "aramex",
    },
    {
      name: "250 TND exactly (free)",
      lines: [
        { format: "10x15", quantity: 1, withFrame: true, videoDurationSec: 1320 },
        { format: "magnet", quantity: 2 },
      ],
      shipping: "mondial_relay",
    },
    {
      name: "264 TND, VIP20 drops below free",
      lines: [
        { format: "30x45", quantity: 1 },
        { format: "magnet", quantity: 1 },
      ],
      promo: "VIP20",
      shipping: "aramex",
    },
  );
  // Mixed carts: tier picked from the total quantity across lines.
  cases.push(
    {
      name: "mixed 3 lines x5 total",
      lines: [
        { format: "10x15", quantity: 2, withFrame: true },
        { format: "magnet", quantity: 2 },
        { format: "30x45", quantity: 1, withFrame: true, videoDurationSec: 900 },
      ],
      promo: "MEMORA10",
      shipping: "mondial_relay",
    },
    {
      name: "mixed all formats x100 total",
      lines: FORMATS.map((format) => ({
        format,
        quantity: 20,
        withFrame: true,
        videoDurationSec: 1000,
      })),
      promo: "VIP20",
      shipping: "aramex",
    },
  );
  return cases;
}

const quoteArgs = (c: Case) => ({
  p_items: toPayloadItems(c.lines),
  p_promo_code: c.promo ?? null,
  p_shipping_carrier: c.shipping,
});

async function sqlQuote(c: Case) {
  const { data, error } = await service.rpc("calculate_order_quote", quoteArgs(c));
  if (error) throw new Error(`${c.name}: ${error.message}`);
  return data as Record<string, number | unknown[]>;
}

/** The SQL answer exactly as the database writes it (numeric scale included, e.g. 49.00). */
async function sqlQuoteText(c: Case): Promise<string> {
  const res = await fetch(`${LOCAL_URL}/rest/v1/rpc/calculate_order_quote`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(quoteArgs(c)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${c.name}: ${text}`);
  return text;
}

async function setTierPrice(format: Format, minQty: number, unitPrice: number) {
  const { error } = await service
    .from("price_tiers")
    .update({ unit_price: unitPrice })
    .eq("format", format)
    .eq("min_qty", minQty);
  if (error) throw error;
}

describe.skipIf(!process.env["LOCAL_DB_TEST"])("Quote parity TS vs SQL (local Supabase)", () => {
  const matrix = buildMatrix();

  it("get_pricing() returns exactly the grid hardcoded before the migration", async () => {
    expect(await fetchPricing(service)).toEqual(TODAY_PRICING);
  });

  it(`answers byte for byte as before the migration for ${matrix.length} carts`, async () => {
    const actual: Record<string, string> = {};
    for (const c of matrix) actual[c.name] = await sqlQuoteText(c);
    expect(Object.keys(actual)).toHaveLength(matrix.length);
    if (process.env["WRITE_QUOTE_SNAPSHOT"])
      writeFileSync(
        SNAPSHOT,
        `${JSON.stringify(actual, null, 2)}
`,
      );
    expect(actual).toEqual(JSON.parse(readFileSync(SNAPSHOT, "utf8")));
  });

  it(`agrees on subtotal, discount, shipping fee and total for ${matrix.length} carts`, async () => {
    const pricing = await fetchPricing(service);
    const mismatches: string[] = [];
    for (const c of matrix) {
      const percent = await checkPromoCode(service, c.promo ?? "");
      const ts = calculateQuote(c.lines, pricing, percent, c.shipping);
      const sql = await sqlQuote(c);
      const pairs: [string, number, unknown][] = [
        ["itemsSubtotal", ts.itemsSubtotal, sql["items_subtotal"]],
        ["framesSubtotal", ts.framesSubtotal, sql["frames_subtotal"]],
        ["videoSurcharges", ts.videoSurcharges, sql["video_surcharges"]],
        ["subtotal", ts.subtotal, sql["subtotal"]],
        ["discount", ts.discount, sql["discount"]],
        ["shippingFee", ts.shippingFee, sql["shipping_fee"]],
        ["total", ts.total, sql["total"]],
        ["totalQuantity", ts.totalQuantity, sql["total_quantity"]],
      ];
      for (const [key, tsValue, sqlValue] of pairs) {
        if (tsValue !== Number(sqlValue))
          mismatches.push(`${c.name}: ${key} TS=${tsValue} SQL=${String(sqlValue)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("finalization charges the SQL quote and stores its item prices", async () => {
    const draftId = `dft_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const draftToken = `tok_${crypto.randomUUID().replace(/-/g, "")}`;
    const lines: QuoteLine[] = [
      { format: "20x30", quantity: 3, withFrame: true, videoDurationSec: 700 },
      { format: "magnet", quantity: 3 },
    ];
    const items = toPayloadItems(lines);

    const mappings = [];
    for (const item of items) {
      for (const [kind, mime, ext] of [
        ["photo", "image/jpeg", "jpg"],
        ["video", "video/mp4", "mp4"],
      ] as const) {
        const { data, error } = await service.rpc("create_upload_intent", {
          p_draft_id: draftId,
          p_draft_token: draftToken,
          p_file_kind: kind,
          p_file_name: `test.${ext}`,
          p_mime_type: mime,
          p_file_size_bytes: 1024,
          p_file_extension: ext,
          p_item_id: item.id,
        });
        if (error) throw error;
        const intentId = (data as { intent_id: string }).intent_id;
        const { error: readyError } = await service
          .from("upload_intents")
          .update({ status: "ready" })
          .eq("id", intentId);
        if (readyError) throw readyError;
        mappings.push({ item_id: item.id, intent_id: intentId, file_kind: kind });
      }
    }

    const { data, error } = await service.rpc("finalize_order_with_intents", {
      p_order_payload: {
        order_number: `MEM-QP-${crypto.randomUUID().slice(0, 12)}`,
        customer_name: "Quote Parity",
        customer_email: "quote@test.local",
        customer_phone: "+21612345678",
        shipping_address: {
          address: "1 Rue Test",
          city: "Tunis",
          country: "TN",
          recipient: "Quote Parity",
        },
        items,
        promo_code: "MEMORA10",
        shipping_carrier: "aramex",
      },
      p_draft_id: draftId,
      p_draft_token: draftToken,
      p_intent_mappings: mappings,
      p_idempotency_key: `idem_${draftId}`,
    });
    if (error) throw error;

    const pricing = await fetchPricing(service);
    const ts = calculateQuote(lines, pricing, await checkPromoCode(service, "MEMORA10"), "aramex");
    const { data: order, error: orderError } = await service
      .from("orders")
      .select("subtotal, shipping_fee, total, items")
      .eq("id", (data as { order_id: string }).order_id)
      .single();
    if (orderError) throw orderError;

    expect(Number(order.subtotal)).toBe(ts.subtotal);
    expect(Number(order.shipping_fee)).toBe(ts.shippingFee);
    expect(Number(order.total)).toBe(ts.total);
    const stored = (
      order.items as { format: Format; unit_price: number; frame_price: number }[]
    ).map((it) => ({
      format: it.format,
      unit: Number(it.unit_price),
      frame: Number(it.frame_price),
    }));
    expect(stored).toEqual(
      lines.map((l) => ({
        format: l.format,
        unit: getUnitPrice(pricing, l.format, ts.totalQuantity),
        frame: l.withFrame ? getFramePrice(pricing, l.format) : 0,
      })),
    );
  });

  it("a tier price changed in the table shows in the SQL Quote and in the TS Quote fed with get_pricing()", async () => {
    const cart: Case = {
      name: "10x15 x5",
      lines: [{ format: "10x15", quantity: 5 }],
      shipping: "aramex",
    };
    await setTierPrice("10x15", 5, 45);
    try {
      const changed = await fetchPricing(service);
      expect(getUnitPrice(changed, "10x15", 5)).toBe(45);
      const ts = calculateQuote(cart.lines, changed, 0, cart.shipping);
      const sql = await sqlQuote(cart);
      expect(ts.itemsSubtotal).toBe(225);
      expect(Number(sql["items_subtotal"])).toBe(225);
      expect(Number(sql["total"])).toBe(ts.total);
    } finally {
      await setTierPrice("10x15", 5, 42);
    }
    expect(Number((await sqlQuote(cart))["items_subtotal"])).toBe(210);
  });
});
