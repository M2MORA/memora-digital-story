import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type WaConversation, type WaMessage } from "./supabase";
import { publicSiteUrl } from "./useAdminData";

const CONVERSATIONS_POLL_MS = 10_000;
const MESSAGES_POLL_MS = 5_000;

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Session expirée, reconnecte-toi.");
  return data.session.access_token;
}

async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${publicSiteUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Serveur injoignable.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error || `Erreur serveur (code ${res.status}).`);
  return data as T;
}

/** Lien signé (1 h) vers un média WhatsApp ; gardé 50 min pour éviter de re-signer. */
const mediaUrlCache = new Map<string, { url: string; at: number }>();
export async function whatsappMediaUrl(storageKey: string): Promise<string> {
  const cached = mediaUrlCache.get(storageKey);
  if (cached && Date.now() - cached.at < 50 * 60 * 1000) return cached.url;
  const { url } = await callApi<{ url: string }>(
    `/api/admin/whatsapp/media?key=${encodeURIComponent(storageKey)}`,
  );
  mediaUrlCache.set(storageKey, { url, at: Date.now() });
  return url;
}

/** Repasse la fonction tant que l'onglet est visible. */
function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") saved.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

export function useWhatsApp(options: { inboxOpen: boolean }) {
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadConversations = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("wa_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (err) setError(`Conversations WhatsApp non chargées : ${err.message}`);
    else {
      setConversations(data as WaConversation[]);
      setError("");
    }
    setLoaded(true);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: err } = await supabase
      .from("wa_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) return setError(`Messages non chargés : ${err.message}`);
    setMessages(((data ?? []) as WaMessage[]).reverse());
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);
  usePolling(() => void loadConversations(), CONVERSATIONS_POLL_MS, true);
  usePolling(() => selectedId && void loadMessages(selectedId), MESSAGES_POLL_MS, options.inboxOpen && !!selectedId);

  const markRead = useCallback(async (conversation: WaConversation) => {
    if (!conversation.unread_count) return;
    setConversations((prev) => prev.map((c) => (c.id === conversation.id ? { ...c, unread_count: 0 } : c)));
    await supabase.from("wa_conversations").update({ unread_count: 0 }).eq("id", conversation.id);
  }, []);

  const select = useCallback(
    async (id: string | null) => {
      setSelectedId(id);
      setMessages([]);
      if (!id) return;
      await loadMessages(id);
      const conversation = conversations.find((c) => c.id === id);
      if (conversation) await markRead(conversation);
    },
    [conversations, loadMessages, markRead],
  );

  // Les messages qui arrivent pendant que la conversation est ouverte sont déjà lus.
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (options.inboxOpen && selected && selected.unread_count > 0) void markRead(selected);
  }, [options.inboxOpen, selected, markRead]);

  const setMode = async (id: string, mode: WaConversation["mode"]) => {
    const patch =
      mode === "human"
        ? { mode, handoff_reason: "Prise en main par l'équipe", handoff_at: new Date().toISOString() }
        : { mode, handoff_reason: null, handoff_at: null };
    const { error: err } = await supabase.from("wa_conversations").update(patch).eq("id", id);
    if (err) return setError(err.message);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const send = async (id: string, text: string): Promise<boolean> => {
    try {
      await callApi("/api/admin/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: id, text }),
      });
      await Promise.all([loadMessages(id), loadConversations()]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  /** Conversations où le client attend l'équipe (mode humain, non lues). */
  const waitingCount = conversations.filter((c) => c.mode === "human" && c.unread_count > 0).length;

  return {
    conversations,
    selected,
    selectedId,
    messages,
    error,
    setError,
    loaded,
    waitingCount,
    select,
    setMode,
    send,
    reload: loadConversations,
  };
}

export type WhatsAppData = ReturnType<typeof useWhatsApp>;
