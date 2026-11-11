/**
 * Coordonnées publiques de MÉMORA, en un seul endroit.
 *
 * À FAIRE avant le lancement : remplacer WHATSAPP_NUMBER par le vrai numéro
 * (format international sans « + », ex. 216XXXXXXXX).
 */
export const WHATSAPP_NUMBER = "21698000000";
export const CONTACT_EMAIL = "bonjour@memora.tn";
export const INSTAGRAM_URL = "https://instagram.com/memora.tn";

/** Lien wa.me avec un message pré-rempli */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Lien mailto avec sujet et corps pré-remplis */
export function mailtoLink(subject: string, body: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
