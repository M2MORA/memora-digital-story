import { createClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const url = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type OrderStatus = "pending" | "paid" | "printing" | "shipped" | "delivered" | "cancelled";

export const STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "paid", label: "Payée" },
  { value: "printing", label: "Tirage en cours" },
  { value: "shipped", label: "Expédiée" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
];

export type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: Record<string, string>;
  items: Array<Record<string, unknown>>;
  total: number;
  currency: string;
  status: OrderStatus;
  draft_id?: string | null;
  source?: "web" | "whatsapp";
  wa_conversation_id?: string | null;
  created_at: string;
};

export type WaConversation = {
  id: string;
  wa_phone: string;
  customer_name: string | null;
  mode: "bot" | "human";
  handoff_reason: string | null;
  handoff_at: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
  unread_count: number;
  created_at: string;
};

export type WaMedia = { storage_key: string; mime: string; size: number; caption?: string };

export type WaMessage = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  author: "customer" | "bot" | "admin";
  type: "text" | "image" | "video" | "audio" | "document" | "other";
  body: string | null;
  payload: { media?: WaMedia; media_error?: string; media_id?: string };
  order_id: string | null;
  created_at: string;
};

export type Memory = {
  id: string;
  slug: string;
  title: string;
  video_url: string;
  photo_url: string | null;
  view_count: number;
  status: "active" | "draft" | "archived";
  order_id?: string | null;
  created_at: string;
};

export const isAdmin = (user: { app_metadata?: Record<string, unknown> } | null | undefined) =>
  user?.app_metadata?.["role"] === "admin";
