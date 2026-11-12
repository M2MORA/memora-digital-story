import { z } from "zod";
import { TUNISIAN_GOVERNORATES } from "../../lib/governorates";
import { calculateQuote, formatTND, type QuoteResult } from "../../lib/pricing";
import { PRODUCT_NAME } from "./knowledge";
import type { ToolDefinition } from "./llm/types";

export const LANGUAGES = ["derja", "fr", "ar", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const CARRIERS = ["aramex", "mondial_relay"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "create_order_request",
    description:
      "Enregistre la commande du client. À appeler UNIQUEMENT après un récapitulatif et une confirmation explicite du client.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Nom complet du client" },
        phone: {
          type: "string",
          description:
            "Seulement si le client donne un AUTRE numéro que son WhatsApp : 8 chiffres tunisiens. Sinon ne pas remplir.",
        },
        governorate: { type: "string", enum: [...TUNISIAN_GOVERNORATES] },
        address: { type: "string", description: "Adresse de livraison (rue, ville)" },
        quantity: { type: "integer", minimum: 1, maximum: 500, description: "Nombre de photos" },
        with_frame: { type: "boolean", description: "Cadre en option" },
        carrier: {
          type: "string",
          enum: [...CARRIERS],
          description: "aramex = à domicile, mondial_relay = Rapid-Poste (bureau de poste)",
        },
        card_message: { type: "string", description: "Message de la carte (optionnel)" },
        notes: { type: "string", description: "Remarques utiles pour l'équipe (optionnel)" },
        language: { type: "string", enum: [...LANGUAGES], description: "Langue du client" },
        confirmed_by_customer: {
          type: "boolean",
          description: "true seulement si le client a confirmé le récapitulatif",
        },
      },
      required: [
        "customer_name",
        "governorate",
        "address",
        "quantity",
        "carrier",
        "language",
        "confirmed_by_customer",
      ],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Passe la conversation à un membre de l'équipe Mémora : Ballech arrête de répondre jusqu'à ce que l'équipe lui rende la main.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Pourquoi le client a besoin d'un humain (court)" },
      },
      required: ["reason"],
    },
  },
];

/** Numéro tunisien : 8 chiffres, enregistré au format du site « +216 XXXXXXXX ». */
export function normalizeTunisianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("216")) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith("00216")) digits = digits.slice(5);
  return /^\d{8}$/.test(digits) ? `+216 ${digits}` : null;
}

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));

// Mêmes règles que le formulaire du site (commander.tsx) : nom ≥ 2, adresse ≥ 4, 8 chiffres.
export const orderRequestSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  phone: optionalText,
  governorate: z.enum(TUNISIAN_GOVERNORATES),
  address: z.string().trim().min(4).max(300),
  quantity: z.coerce.number().int().min(1).max(500),
  with_frame: z.boolean().optional().default(false),
  carrier: z.enum(CARRIERS),
  card_message: optionalText,
  notes: optionalText,
  language: z.enum(LANGUAGES).catch("fr"),
  confirmed_by_customer: z.literal(true),
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;

export type ValidatedOrder = OrderRequest & { customer_phone: string; quote: QuoteResult };

export type OrderValidation = { ok: true; order: ValidatedOrder } | { ok: false; error: string };

/**
 * Valide les arguments de l'outil et calcule le prix côté serveur.
 * Le téléphone de livraison est le numéro WhatsApp, sauf si le client en a donné un autre.
 */
export function validateOrderRequest(
  args: Record<string, unknown>,
  waPhone: string,
): OrderValidation {
  const parsed = orderRequestSchema.safeParse(args);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".") || "commande").join(", ");
    return {
      ok: false,
      error: `Champs invalides ou manquants : ${fields}. Redemande-les au client.`,
    };
  }
  const data = parsed.data;

  const phone = data.phone ? normalizeTunisianPhone(data.phone) : normalizeTunisianPhone(waPhone);
  if (!phone) {
    if (data.phone) {
      return {
        ok: false,
        error: "Le numéro donné doit avoir 8 chiffres tunisiens. Redemande-le au client.",
      };
    }
    // Numéro WhatsApp étranger : on le garde tel quel, l'équipe vérifiera.
  }

  const quote = calculateQuote(
    [{ format: "10x15", quantity: data.quantity, withFrame: data.with_frame }],
    "TN",
    data.carrier,
  );
  return {
    ok: true,
    order: { ...data, customer_phone: phone ?? `+${waPhone.replace(/\D/g, "")}`, quote },
  };
}

const CARRIER_LABEL: Record<Language, Record<Carrier, string>> = {
  derja: { aramex: "Aramex (lel dar)", mondial_relay: "Rapid-Poste (fil bousta)" },
  fr: { aramex: "Aramex (à domicile)", mondial_relay: "Rapid-Poste (bureau de poste)" },
  ar: { aramex: "أرامكس (للدار)", mondial_relay: "البريد السريع (مكتب البريد)" },
  en: { aramex: "Aramex (home delivery)", mondial_relay: "Rapid-Poste (post office)" },
};

/** Récapitulatif officiel envoyé au client après l'enregistrement, dans sa langue. */
export function orderRecap(order: ValidatedOrder, orderNumber: string, hasPhoto: boolean): string {
  const { quote, language } = order;
  const shipping =
    quote.shippingCost === 0
      ? { derja: "ballech", fr: "offerte", ar: "مجانية", en: "free" }[language]
      : formatTND(quote.shippingCost);
  const carrier = CARRIER_LABEL[language][order.carrier];
  const frame = order.with_frame
    ? { derja: " + cadre", fr: " + cadre", ar: " + إطار", en: " + frame" }[language]
    : "";
  const media = hasPhoto
    ? ""
    : {
        derja: "\n📸 Ab3athli el taswira w el video hna bech nkamlou.",
        fr: "\n📸 Envoyez-nous ici la photo et la vidéo pour finaliser.",
        ar: "\n📸 ابعثلنا هنا الصورة والفيديو باش نكملو.",
        en: "\n📸 Please send the photo and the video here to finalize.",
      }[language];

  switch (language) {
    case "derja":
      return `✅ Commande ${orderNumber} tsajlet!\n• ${PRODUCT_NAME} × ${order.quantity}${frame}\n• Livraison : ${carrier}, ${shipping}\n• Total : ${formatTND(quote.total)} (tkhalsou lel livreur)\nEl équipe bech tconfirmi m3ak 9rib.${media}`;
    case "ar":
      return `✅ تسجّلت الطلبية ${orderNumber}!\n• ${PRODUCT_NAME} × ${order.quantity}${frame}\n• التوصيل: ${carrier}، ${shipping}\n• المجموع: ${formatTND(quote.total)} (الخلاص للموزّع)\nالفريق باش يأكّد معاك قريب.${media}`;
    case "en":
      return `✅ Order ${orderNumber} registered!\n• ${PRODUCT_NAME} × ${order.quantity}${frame}\n• Delivery: ${carrier}, ${shipping}\n• Total: ${formatTND(quote.total)} (cash on delivery)\nOur team will confirm with you shortly.${media}`;
    default:
      return `✅ Commande ${orderNumber} enregistrée !\n• ${PRODUCT_NAME} × ${order.quantity}${frame}\n• Livraison : ${carrier}, ${shipping}\n• Total : ${formatTND(quote.total)} (paiement au livreur)\nL'équipe vous confirme très vite.${media}`;
  }
}
