import { STATUSES, type OrderStatus } from "./supabase";

export const fmt = (n: number, cur = "TND") =>
  `${Number(n).toFixed(2)} ${cur === "TND" ? "DT" : cur}`;

export const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export const statusLabel = (s: OrderStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

/**
 * Étape suivante du parcours normal (null = fin). Paiement en espèces à la livraison,
 * et « Payée » verrouille la commande : c'est donc la dernière étape.
 */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "printing",
  printing: "shipped",
  shipped: "delivered",
  delivered: "paid",
  paid: null,
  cancelled: null,
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
