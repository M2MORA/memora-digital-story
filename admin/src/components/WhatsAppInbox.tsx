import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, MessageCircle, Package, Search, Send, UserRound } from "lucide-react";
import type { Order, WaConversation, WaMessage } from "../lib/supabase";
import { fmtDate } from "../lib/format";
import { whatsappWindowClosed } from "../lib/rules";
import type { WhatsAppData } from "../lib/useWhatsApp";
import WaMediaView from "./WaMediaView";

const AUTHOR_LABEL: Record<WaMessage["author"], string> = {
  customer: "Client",
  bot: "Ballech",
  admin: "Équipe",
};

const MEDIA_LABEL: Record<WaMessage["type"], string> = {
  text: "",
  image: "Photo",
  video: "Vidéo",
  audio: "Message vocal",
  document: "Document",
  other: "Message non pris en charge (sticker, position…)",
};

const displayName = (c: WaConversation) => c.customer_name || `+${c.wa_phone}`;

function ModeBadge({ mode }: { mode: WaConversation["mode"] }) {
  return mode === "human" ? (
    <span className="badge s-pending"><UserRound size={12} aria-hidden /> Équipe</span>
  ) : (
    <span className="badge s-printing"><Bot size={12} aria-hidden /> Ballech</span>
  );
}

function MessageBubble({ m, onOpenOrder }: { m: WaMessage; onOpenOrder: (orderId: string) => void }) {
  const media = m.payload?.media;
  return (
    <li className={`bubble from-${m.author}`}>
      <span className="bubble-meta">
        {AUTHOR_LABEL[m.author]} · {fmtDate(m.created_at)}
      </span>
      {m.type !== "text" && (
        <div className="bubble-media">
          {media ? (
            <WaMediaView media={media} label={`${MEDIA_LABEL[m.type]} du client`} />
          ) : (
            <span className="wa-media-missing">
              {MEDIA_LABEL[m.type]}
              {m.payload?.media_error ? " : non récupéré (redemande-le au client)" : m.type === "other" ? "" : " en cours de récupération…"}
            </span>
          )}
        </div>
      )}
      {m.body && <p className="bubble-text">{m.body}</p>}
      {m.order_id && (
        <button type="button" className="link" onClick={() => onOpenOrder(m.order_id!)}>
          <Package size={14} aria-hidden /> Voir la commande
        </button>
      )}
    </li>
  );
}

export default function WhatsAppInbox({
  wa,
  orders,
  onOpenOrder,
}: {
  wa: WhatsAppData;
  orders: Order[];
  onOpenOrder: (orderId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadEnd = useRef<HTMLLIElement>(null);
  const c = wa.selected;

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [wa.messages.length, wa.selectedId]);

  useEffect(() => setDraft(""), [wa.selectedId]);

  const q = search.trim().toLowerCase();
  const shown = wa.conversations
    .filter((x) => !q || `${x.customer_name ?? ""} ${x.wa_phone}`.toLowerCase().includes(q))
    // Les clients qui attendent l'équipe d'abord, puis le plus récent.
    .sort((a, b) => Number(b.mode === "human") - Number(a.mode === "human"));

  const windowClosed = c ? whatsappWindowClosed(c.last_inbound_at) : false;
  const linkedOrders = c ? orders.filter((o) => o.wa_conversation_id === c.id) : [];

  const submit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    if (!c || !draft.trim() || sending) return;
    setSending(true);
    if (await wa.send(c.id, draft.trim())) setDraft("");
    setSending(false);
  };

  return (
    <div className={`orders-layout ${c ? "has-detail" : ""}`}>
      <section className="list-pane" aria-label="Conversations WhatsApp">
        <label className="search">
          <Search size={18} aria-hidden />
          <span className="sr-only">Chercher une conversation</span>
          <input
            type="search"
            placeholder="Nom ou numéro"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {wa.error && (
          <div className="banner" role="alert">
            <span>{wa.error}</span>
            <button type="button" className="link" onClick={() => wa.setError("")}>Fermer</button>
          </div>
        )}

        {!wa.loaded ? (
          <ul className="rows" aria-busy="true">
            {[0, 1, 2].map((i) => <li key={i} className="row skeleton" />)}
          </ul>
        ) : shown.length === 0 ? (
          <p className="empty">
            {wa.conversations.length === 0
              ? "Aucune conversation. Les messages WhatsApp reçus par Ballech apparaissent ici."
              : "Aucune conversation ne correspond à la recherche."}
          </p>
        ) : (
          <ul className="rows">
            {shown.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className={`row ${wa.selectedId === x.id ? "selected" : ""}`}
                  onClick={() => void wa.select(x.id)}
                >
                  <span className="row-main">
                    <span className="row-title">{displayName(x)}</span>
                    <span className="row-sub">
                      {x.mode === "human" && x.handoff_reason ? x.handoff_reason : fmtDate(x.last_message_at)}
                    </span>
                  </span>
                  <span className="row-side">
                    {x.unread_count > 0 && <span className="nav-count">{x.unread_count}</span>}
                    <ModeBadge mode={x.mode} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {c ? (
        <article className="detail wa-thread">
          <button type="button" className="back only-narrow" onClick={() => void wa.select(null)}>
            <ChevronLeft size={18} aria-hidden /> Conversations
          </button>

          <header className="detail-head">
            <div>
              <h2>{displayName(c)}</h2>
              <p className="muted">+{c.wa_phone}</p>
            </div>
            <div className="detail-head-side">
              <ModeBadge mode={c.mode} />
            </div>
          </header>

          <section className="panel">
            {c.mode === "human" ? (
              <>
                <p className="hint">
                  Ballech ne répond plus à ce client{c.handoff_reason ? ` (${c.handoff_reason})` : ""}. Rends-lui la main quand c'est réglé.
                </p>
                <button type="button" className="btn" onClick={() => void wa.setMode(c.id, "bot")}>
                  <Bot size={16} aria-hidden /> Rendre à Ballech
                </button>
              </>
            ) : (
              <>
                <p className="hint">Ballech répond automatiquement. Prends la main pour répondre toi-même.</p>
                <button type="button" className="btn" onClick={() => void wa.setMode(c.id, "human")}>
                  <UserRound size={16} aria-hidden /> Prendre la main
                </button>
              </>
            )}
            {linkedOrders.length > 0 && (
              <div className="actions-row">
                {linkedOrders.map((o) => (
                  <button key={o.id} type="button" className="btn" onClick={() => onOpenOrder(o.id)}>
                    <Package size={16} aria-hidden /> {o.order_number}
                  </button>
                ))}
              </div>
            )}
          </section>

          <ol className="thread" aria-label="Messages">
            {wa.messages.map((m) => (
              <MessageBubble key={m.id} m={m} onOpenOrder={onOpenOrder} />
            ))}
            <li ref={threadEnd} aria-hidden className="thread-end" />
          </ol>

          <form className="composer" onSubmit={submit}>
            {windowClosed ? (
              <p className="note is-error">
                Plus de 24 h depuis le dernier message du client : WhatsApp bloque la réponse libre. Attends qu'il réécrive.
              </p>
            ) : (
              <>
                <label className="sr-only" htmlFor="wa-reply">Réponse au client</label>
                <textarea
                  id="wa-reply"
                  rows={2}
                  placeholder="Écrire au client… (Ballech passera en pause)"
                  value={draft}
                  maxLength={4096}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(e);
                  }}
                />
                <button type="submit" className="btn primary" disabled={!draft.trim() || sending}>
                  <Send size={16} aria-hidden /> {sending ? "Envoi…" : "Envoyer"}
                </button>
              </>
            )}
          </form>
        </article>
      ) : (
        <div className="detail-placeholder">
          <MessageCircle size={28} strokeWidth={1.5} aria-hidden />
          <p>Choisis une conversation pour lire les messages et répondre.</p>
        </div>
      )}
    </div>
  );
}
