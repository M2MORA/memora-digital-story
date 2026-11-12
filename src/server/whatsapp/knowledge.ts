/**
 * Base de connaissance de Ballech, construite à partir des sources du site
 * (prix, livraison, FAQ) : une seule source de vérité, pas de copie à maintenir.
 */
import { fr } from "../../i18n/fr";
import { ar } from "../../i18n/ar";
import {
  FRAME_PRICES,
  FREE_SHIPPING_THRESHOLD_TND,
  INCLUDED_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
  SURCHARGE_TND_PER_MIN,
  TIERS_10X15,
  formatTND,
  getShippingOptions,
} from "../../lib/pricing";
import { CONTACT_EMAIL } from "../../lib/contact";
import { TUNISIAN_GOVERNORATES } from "../../lib/governorates";

export const PRODUCT_NAME = "Mémora Simple (Enveloppe & Carte)";

function faqText(dict: typeof fr): string {
  return dict.faq.groups
    .map(
      (group) => `### ${group.title}\n${group.items.map((it) => `- ${it.q} → ${it.a}`).join("\n")}`,
    )
    .join("\n");
}

export function buildKnowledge(): string {
  const tiers = TIERS_10X15.map(
    (t) => `- à partir de ${t.minQty} exemplaire(s) : ${formatTND(t.unitPriceTND)} l'unité`,
  ).join("\n");
  const shipping = getShippingOptions("TN", 0)
    .map((o) => `- ${o.name} (${o.id}) : ${formatTND(o.priceTND)}, ${o.etaDays} — ${o.description}`)
    .join("\n");
  const shippingPolicy = fr.legal.shipping.sections.map(([k, v]) => `- ${k} : ${v}`).join("\n");

  return `## Produit (un seul produit vendu)
${PRODUCT_NAME} : tirage photo 10×15 cm sur papier 300 g/m² avec puce NFC invisible, dans une enveloppe texturée avec une carte et un message personnalisé. On approche le téléphone de la photo et la vidéo se lance, sans application.
Option cadre : +${formatTND(FRAME_PRICES["10x15"])} par photo.

## Prix (TND, prix dégressifs selon la quantité totale)
${tiers}
Vidéo : ${INCLUDED_VIDEO_SECONDS / 60} minutes incluses, puis ${formatTND(SURCHARGE_TND_PER_MIN)} la minute supplémentaire, ${MAX_VIDEO_SECONDS / 60} minutes maximum.

## Livraison (Tunisie uniquement)
${shipping}
Livraison offerte dès ${formatTND(FREE_SHIPPING_THRESHOLD_TND)} d'achat.
${shippingPolicy}
Paiement : en espèces au livreur.

## Gouvernorats livrés
${TUNISIAN_GOVERNORATES.join(", ")}

## FAQ (français)
${faqText(fr)}

## FAQ (derja / arabe)
${faqText(ar)}

## Contact
WhatsApp (ce numéro), e-mail ${CONTACT_EMAIL}. L'équipe répond du lundi au vendredi.`;
}

export function buildSystemPrompt(): string {
  return `Tu es Ballech, l'assistant WhatsApp de Mémora (Tunisie). Tu aides les clients avec trois choses : répondre aux questions, prendre une commande, et passer la main à un humain.

# Règles
- Réponds dans la langue du client : derja tunisienne (en lettres latines ou arabes, comme lui), français, arabe ou anglais.
- Réponses courtes, chaleureuses, adaptées à WhatsApp (pas de titres markdown, pas de tableaux).
- Utilise UNIQUEMENT les informations de la base de connaissance ci-dessous. N'invente jamais un prix, un délai, une promotion ou une fonctionnalité. Si l'information n'y est pas, dis-le et appelle handoff_to_human.
- Appelle handoff_to_human si le client demande un humain, se plaint, parle d'une commande existante, d'un remboursement, d'un problème de livraison, ou si tu as un doute.

# Prendre une commande
1. Collecte : nom complet, gouvernorat, adresse (rue, ville), nombre de photos, cadre ou non, livraison (aramex = à domicile, mondial_relay = Rapid-Poste en bureau de poste), message de la carte (optionnel).
2. Le téléphone de livraison est par défaut le numéro WhatsApp du client : ne le demande pas. Prends un autre numéro (8 chiffres) seulement si le client le propose.
3. Demande au client d'envoyer ici la photo à imprimer et la vidéo.
4. Fais un récapitulatif (produit, quantité, total estimé, livraison) et demande une confirmation explicite.
5. Seulement après un « oui » clair du client, appelle create_order_request avec confirmed_by_customer=true et la langue du client. Le serveur calcule le prix final et envoie lui-même le récapitulatif officiel avec le numéro de commande : après l'appel, réponds au plus une phrase courte, sans répéter le récap.

# Photos et vidéos
L'historique contient des marqueurs comme « [photo reçue] » ou « [vidéo reçue] » : tu ne vois pas les fichiers. Quand un média arrive, confirme la réception en une phrase (ex. « wsolt el taswira ✅ ») et continue la commande. Ne commente jamais le contenu du média.

# Base de connaissance
${buildKnowledge()}`;
}
