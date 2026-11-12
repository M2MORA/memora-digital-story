/** Accès base de données de Ballech (client Supabase service role : contourne le RLS). */

export type ConversationMode = "bot" | "human";
export type MessageType = "text" | "image" | "video" | "audio" | "document" | "other";

export type Conversation = {
  id: string;
  wa_phone: string;
  customer_name: string | null;
  mode: ConversationMode;
  last_inbound_at: string | null;
  unread_count: number;
};

export type MediaInfo = {
  storage_key: string;
  mime: string;
  size: number;
  sha256?: string;
  caption?: string;
};

export type StoredMessage = {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: "in" | "out";
  author: "customer" | "bot" | "admin";
  type: MessageType;
  body: string | null;
  payload: { media?: MediaInfo; media_id?: string; media_error?: string; [k: string]: unknown };
  order_id: string | null;
  created_at: string;
};

export type OrderRow = {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  subtotal: number;
  shipping_fee: number;
  total: number;
  currency: "TND";
  status: "pending";
  source: "whatsapp";
  wa_conversation_id: string;
};

export interface BallechStore {
  /** Retrouve ou crée la conversation d'un numéro WhatsApp. */
  ensureConversation(waPhone: string, customerName: string | null): Promise<Conversation>;
  /** Note un message entrant : non lu +1, fenêtre 24 h relancée. */
  markInbound(conversation: Conversation, at: Date): Promise<void>;
  /** false si ce wa_message_id existe déjà (nouvel envoi du webhook par Meta). */
  insertMessage(
    message: Omit<StoredMessage, "id" | "created_at" | "order_id"> & { order_id?: string | null },
  ): Promise<{ inserted: boolean; id: string | null }>;
  updateMessage(
    id: string,
    patch: Partial<Pick<StoredMessage, "payload" | "order_id" | "body">>,
  ): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  recentMessages(conversationId: string, limit: number): Promise<StoredMessage[]>;
  setMode(conversationId: string, mode: ConversationMode, reason: string | null): Promise<void>;
  touchOutbound(conversationId: string, at: Date): Promise<void>;
  createOrder(row: OrderRow): Promise<{ id: string; order_number: string }>;
  /** Commande WhatsApp encore en attente pour cette conversation, créée après `since`. */
  latestPendingOrder(
    conversationId: string,
    since: Date,
  ): Promise<{ id: string; items: Array<Record<string, unknown>> } | null>;
  updateOrderItems(orderId: string, items: Array<Record<string, unknown>>): Promise<void>;
  /** Médias reçus dans la conversation et pas encore rattachés à une commande. */
  unlinkedMedia(conversationId: string): Promise<StoredMessage[]>;
}

const MEDIA_TYPES: MessageType[] = ["image", "video", "audio", "document"];

// Client Supabase volontairement peu typé (pas de types générés dans le projet).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export function createSupabaseStore(supabase: SupabaseLike): BallechStore {
  const must = <T>(result: { data: T; error: { message: string } | null }, what: string): T => {
    if (result.error) throw new Error(`${what} : ${result.error.message}`);
    return result.data;
  };

  return {
    async ensureConversation(waPhone, customerName) {
      const existing = must(
        await supabase.from("wa_conversations").select("*").eq("wa_phone", waPhone).maybeSingle(),
        "Lecture conversation",
      ) as Conversation | null;
      if (existing) return existing;

      const { data, error } = await supabase
        .from("wa_conversations")
        .insert({ wa_phone: waPhone, customer_name: customerName })
        .select("*")
        .single();
      if (!error) return data as Conversation;
      // Deux messages simultanés du même numéro : l'autre insertion a gagné.
      if (error.code === "23505") {
        return must(
          await supabase.from("wa_conversations").select("*").eq("wa_phone", waPhone).single(),
          "Lecture conversation",
        ) as Conversation;
      }
      throw new Error(`Création conversation : ${error.message}`);
    },

    async markInbound(conversation, at) {
      must(
        await supabase
          .from("wa_conversations")
          .update({
            customer_name: conversation.customer_name,
            last_inbound_at: at.toISOString(),
            last_message_at: at.toISOString(),
            unread_count: (conversation.unread_count ?? 0) + 1,
          })
          .eq("id", conversation.id),
        "Mise à jour conversation",
      );
    },

    async insertMessage(message) {
      const { data, error } = await supabase
        .from("wa_messages")
        .insert(message)
        .select("id")
        .single();
      if (error) {
        // 23505 = violation d'unicité sur wa_message_id : message déjà reçu.
        if (error.code === "23505") return { inserted: false, id: null };
        throw new Error(`Enregistrement message : ${error.message}`);
      }
      return { inserted: true, id: data.id as string };
    },

    async updateMessage(id, patch) {
      must(await supabase.from("wa_messages").update(patch).eq("id", id), "Mise à jour message");
    },

    async getConversation(id) {
      return must(
        await supabase.from("wa_conversations").select("*").eq("id", id).maybeSingle(),
        "Lecture conversation",
      ) as Conversation | null;
    },

    async recentMessages(conversationId, limit) {
      const rows = must(
        await supabase
          .from("wa_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(limit),
        "Lecture historique",
      ) as StoredMessage[];
      return rows.reverse();
    },

    async setMode(conversationId, mode, reason) {
      must(
        await supabase
          .from("wa_conversations")
          .update({
            mode,
            handoff_reason: mode === "human" ? reason : null,
            handoff_at: mode === "human" ? new Date().toISOString() : null,
          })
          .eq("id", conversationId),
        "Changement de mode",
      );
    },

    async touchOutbound(conversationId, at) {
      must(
        await supabase
          .from("wa_conversations")
          .update({ last_message_at: at.toISOString() })
          .eq("id", conversationId),
        "Mise à jour conversation",
      );
    },

    async createOrder(row) {
      return must(
        await supabase.from("orders").insert(row).select("id, order_number").single(),
        "Création commande",
      ) as { id: string; order_number: string };
    },

    async latestPendingOrder(conversationId, since) {
      return must(
        await supabase
          .from("orders")
          .select("id, items")
          .eq("wa_conversation_id", conversationId)
          .eq("status", "pending")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "Lecture commande",
      ) as { id: string; items: Array<Record<string, unknown>> } | null;
    },

    async updateOrderItems(orderId, items) {
      must(
        await supabase.from("orders").update({ items }).eq("id", orderId),
        "Mise à jour commande",
      );
    },

    async unlinkedMedia(conversationId) {
      return must(
        await supabase
          .from("wa_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .eq("direction", "in")
          .in("type", MEDIA_TYPES)
          .is("order_id", null)
          .order("created_at", { ascending: true }),
        "Lecture médias",
      ) as StoredMessage[];
    },
  };
}
