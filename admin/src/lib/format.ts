import { STATUSES, type OrderStatus } from "./supabase";

export const fmt = (n: number, cur = "TND") =>
  `${Number(n).toFixed(2)} ${cur === "TND" ? "DT" : cur}`;

export const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export const statusLabel = (s: OrderStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

/**
 * Changements de statut autorisés. Copie du graphe de la fonction SQL set_order_status
 * (qui décide) : paiement en espèces à la livraison, « Payée » verrouille la commande.
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["printing", "cancelled"],
  printing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["paid"],
  paid: [],
  cancelled: [],
};

/** Étape suivante du parcours normal (null = fin). */
export const nextStatus = (s: OrderStatus): OrderStatus | null =>
  TRANSITIONS[s].find((x) => x !== "cancelled") ?? null;

/** Message affiché quand set_order_status refuse le changement. */
export const refusalMessage = (reason: string, from?: string, to?: string) => {
  const label = (s?: string) => (s ? statusLabel(s as OrderStatus) : "?");
  switch (reason) {
    case "paid_locked":
      return "Cette commande a été marquée comme 'Payée'. Elle est définitivement verrouillée et ne peut plus être modifiée ou supprimée.";
    case "transition_not_allowed":
      return `Changement refusé : une commande « ${label(from)} » ne peut pas passer à « ${label(to)} ».`;
    case "not_found":
      return "Commande introuvable (supprimée ou accès refusé). Actualise la page.";
    default:
      return `Changement de statut refusé (${reason}).`;
  }
};

export const getFilename = (url: string, prefix: string, defaultExt: string) => {
  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      if (["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"].includes(ext)) {
        return `${prefix}.${ext}`;
      }
    }
  } catch {
    // ignore
  }
  return `${prefix}.${defaultExt}`;
};

/** Numéro tunisien → lien WhatsApp (8 chiffres locaux → +216). */
export const whatsappLink = (phone: string) => {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `216${digits}`;
  return `https://wa.me/${digits}`;
};

export const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export const addressOf = (a: Record<string, string> | null | undefined) =>
  [a?.["address"], [a?.["postalCode"], a?.["city"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
