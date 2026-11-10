import { createClient } from "@supabase/supabase-js";

// Normaliser l'URL Supabase en supprimant d'éventuels suffixes comme /rest/v1 ou des slashs finaux
const rawUrl = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").trim();
export const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
export const supabaseAnonKey = String(import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "").trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project-id") &&
    !supabaseAnonKey.includes("your-anon-or-publishable-key"),
);

// Client Supabase connecté à votre projet
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export type MemoryRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  has_photo: boolean;
};

/**
 * Récupère un souvenir depuis Supabase par son slug (utilisé lors du scan NFC /m/:slug)
 */
export async function getMemoryBySlug(slug: string): Promise<MemoryRecord | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .rpc("get_memory_by_slug", { p_slug: slug })
      .maybeSingle();

    if (error) {
      console.warn("Erreur lecture souvenir Supabase:", error.message);
      return null;
    }

    // Incrémenter le compteur de scans/vues de manière discrète
    if (data) {
      void supabase.rpc("increment_memory_views", { memory_id: (data as MemoryRecord).id });
    }

    return data as MemoryRecord | null;
  } catch (err) {
    console.error("Exception lecture souvenir:", err);
    return null;
  }
}

export interface FinalizeOrderParams {
  orderPayload: Record<string, unknown>;
  draftId: string;
  draftToken: string;
  intentMappings: Array<{
    item_id: string;
    intent_id: string;
    file_kind: "photo" | "video";
  }>;
  idempotencyKey: string;
}

export interface FinalizeOrderResponse {
  success: boolean;
  order_id?: string;
  order_number?: string;
  total?: number;
  idempotent_replay?: boolean;
  error?: string;
}

/**
 * Finalise atomiquement la commande avec ses upload intents validés sur Cloudflare R2
 */
export async function finalizeOrderWithIntents(
  params: FinalizeOrderParams
): Promise<FinalizeOrderResponse> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Supabase non configuré" };
  }

  try {
    const { data, error } = await supabase.rpc("finalize_order_with_intents", {
      p_order_payload: params.orderPayload,
      p_draft_id: params.draftId,
      p_draft_token: params.draftToken,
      p_intent_mappings: params.intentMappings,
      p_idempotency_key: params.idempotencyKey,
    });

    if (error) {
      console.error("Erreur finalisation commande Supabase RPC:", error);
      return { success: false, error: error.message };
    }

    if (!data || data.success === false) {
      return {
        success: false,
        error: data?.message || data?.reason || "Échec de finalisation de la commande",
      };
    }

    return {
      success: true,
      order_id: data.order_id,
      order_number: data.order_number,
      total: data.total,
      idempotent_replay: Boolean(data.idempotent_replay),
    };
  } catch (err: any) {
    console.error("Exception finalisation commande:", err);
    return { success: false, error: err?.message || "Erreur interne de finalisation" };
  }
}
