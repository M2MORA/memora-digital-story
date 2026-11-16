/**
 * MÉMORA — Envoi de la commande (Checkout)
 *
 * Le tunnel (commander.tsx) appelle submitOrder et n'affiche que le résultat.
 * Les dépendances (finalisation, envois, cache média, brouillon, panier) sont
 * passées en paramètre pour pouvoir tester le parcours sans la page.
 */
import type { BackgroundUploadInput, UploadKind } from "./background-uploads";
import type { CartItem } from "./cart";
import type { Customer } from "./customer";
import { getMediaCacheKey } from "./media-cache";
import { calculateQuote, type Pricing } from "./pricing";
import type { FinalizeOrderParams, FinalizeOrderResponse } from "./supabase";

export type CheckoutStep = "preparing" | "uploading_media" | "finalizing";

export type CheckoutDeps = {
  finalizeOrder: (params: FinalizeOrderParams) => Promise<FinalizeOrderResponse>;
  /** Intent prêt pour ce fichier : réutilise l'envoi en arrière-plan ou attend celui qui manque. */
  resolveUploadIntent: (input: BackgroundUploadInput) => Promise<string>;
  /** File d'envois : oublie les intents du brouillon (expirés, ou commande enregistrée). */
  forgetUploads: (draftId: string) => void;
  media: {
    get: (key: string) => Promise<File | null>;
    clearDraft: (draftId: string) => Promise<void>;
  };
  draft: {
    getOrderNumber: (draftId: string) => string;
    clearOrderNumber: (draftId: string) => void;
  };
  clearCart: () => void;
};

export type CheckoutInput = {
  items: CartItem[];
  /** Tarifs (get_pricing) : servent seulement au total de repli si le serveur n'en renvoie pas. */
  pricing: Pricing;
  promoCode?: string | undefined;
  /** Pourcentage du code promo (check_promo_code) : sert seulement au total de repli. */
  promoPercent?: number | undefined;
  draftId: string;
  draftToken: string;
  /** Client déjà passé par validateCustomer (règles partagées avec WhatsApp). */
  customer: Customer;
  onStep?: (step: CheckoutStep) => void;
};

export type CheckoutError =
  | { type: "missing_media"; kind: UploadKind; index: number }
  | {
      type: "uploads_expired" | "order_number_clash" | "network" | "rejected";
      /** Message brut (serveur ou exception) ; vide → message générique côté page. */
      message: string;
    };

export type CheckoutResult =
  { ok: true; orderNumber: string; total: number } | { ok: false; error: CheckoutError };

export type ResumeUploadsDeps = Pick<CheckoutDeps, "resolveUploadIntent"> & {
  media: Pick<CheckoutDeps["media"], "get">;
};

/**
 * Dès que l'article est au panier (ou à la livraison), ses médias en cache partent
 * sans attendre la confirmation — y compris après fermeture de l'onglet.
 * La file d'envois ignore un fichier déjà en cours. Renvoie l'annulation (articles retirés).
 */
export function resumeUploads(
  input: { stage: string; items: CartItem[]; draftId: string; draftToken: string },
  deps: ResumeUploadsDeps,
): () => void {
  const { stage, items, draftId, draftToken } = input;
  let isCurrent = true;
  if (!draftId || !["cart", "delivery"].includes(stage)) return () => {};

  void (async () => {
    for (const item of items) {
      for (const kind of ["photo", "video"] as const) {
        const file = await deps.media.get(getMediaCacheKey(draftId, item.key, kind));
        if (!isCurrent) return;
        if (file) {
          deps
            .resolveUploadIntent({ draftId, draftToken, itemId: item.key, kind, file })
            .catch(() => {});
        }
      }
    }
  })();

  return () => {
    isCurrent = false;
  };
}

const NETWORK_ERROR = /failed to fetch|networkerror|load failed/i;
const EXPIRED = /expir/i;

export async function submitOrder(
  input: CheckoutInput,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  const { items, pricing, promoCode, promoPercent, draftId, draftToken, customer, onStep } = input;
  const orderNumber = deps.draft.getOrderNumber(draftId);

  try {
    // Étape A — Récupération des médias depuis IndexedDB pour chaque article
    onStep?.("preparing");
    const media: Array<{ item_id: string; file_kind: UploadKind; file: File }> = [];
    for (const [i, it] of items.entries()) {
      const photoFile = await deps.media.get(getMediaCacheKey(draftId, it.key, "photo"));
      const videoFile = await deps.media.get(getMediaCacheKey(draftId, it.key, "video"));
      if (!photoFile || !videoFile) {
        return {
          ok: false,
          error: { type: "missing_media", kind: !photoFile ? "photo" : "video", index: i + 1 },
        };
      }
      media.push(
        { item_id: it.key, file_kind: "photo", file: photoFile },
        { item_id: it.key, file_kind: "video", file: videoFile },
      );
    }

    // Les fichiers déjà envoyés sont réutilisés ; seul ce qui manque est attendu
    const resolveIntentMappings = () => {
      onStep?.("uploading_media");
      return Promise.all(
        media.map(async ({ item_id, file_kind, file }) => ({
          item_id,
          file_kind,
          intent_id: await deps.resolveUploadIntent({
            draftId,
            draftToken,
            itemId: item_id,
            kind: file_kind,
            file,
          }),
        })),
      );
    };

    // Clé stable par panier : une nouvelle tentative est reconnue par le serveur
    const idempotencyKey = `idem_${draftId}`;
    const normalizedItems = items.map((it) => ({
      id: it.key,
      productId: it.productId,
      format: it.format,
      withFrame: it.withFrame ?? false,
      videoDurationSec: it.videoDurationSec,
      cardMessage: it.cardMessage,
      personalization: it.personalization,
      qty: it.qty,
    }));

    // Finalisation atomique & idempotente de la commande
    const finalize = (intentMappings: FinalizeOrderParams["intentMappings"]) => {
      onStep?.("finalizing");
      return deps.finalizeOrder({
        orderPayload: {
          order_number: orderNumber,
          customer_name: customer.name,
          customer_email: "client@memora.tn",
          customer_phone: customer.phone,
          shipping_address: {
            address: customer.address,
            postalCode: "",
            city: customer.governorate,
            country: "TN",
            carrier: "aramex",
            recipient: customer.name,
          },
          items: normalizedItems,
          promo_code: promoCode || undefined,
          shipping_carrier: "aramex",
        },
        draftId,
        draftToken,
        intentMappings,
        idempotencyKey,
      });
    };

    let result = await finalize(await resolveIntentMappings());

    // Fichiers devenus trop anciens côté serveur : un seul renvoi complet
    if (!result.success && EXPIRED.test(result.error ?? "")) {
      deps.forgetUploads(draftId);
      result = await finalize(await resolveIntentMappings());
    }

    if (!result.success) throw new Error(result.error || "");

    // Le total vient du serveur (recalculé) ; à défaut, le devis local, calculé avant de vider le panier
    const total =
      typeof result.total === "number"
        ? result.total
        : calculateQuote(
            items.map((i) => ({
              format: i.format,
              quantity: i.qty,
              withFrame: i.withFrame,
              videoDurationSec: i.videoDurationSec,
            })),
            pricing,
            promoPercent ?? 0,
            "aramex",
          ).total;

    deps.forgetUploads(draftId);
    deps.draft.clearOrderNumber(draftId);
    // Cleanup policy : suppression des fichiers locaux UNIQUEMENT après succès.
    // Non attendue : effacer une grosse vidéo ne doit pas retarder la confirmation.
    void deps.media.clearDraft(draftId);
    deps.clearCart();

    return { ok: true, orderNumber, total };
  } catch (err: unknown) {
    console.error("Erreur commande R2 / Finalisation:", err);
    const message = err instanceof Error ? err.message : "";
    // Coupure réseau : la page affiche un message clair plutôt que « Failed to fetch »
    const isNetwork = err instanceof TypeError || NETWORK_ERROR.test(message);
    const isClash = message.includes("order_number");
    // Numéro déjà attribué à une autre commande : en tirer un nouveau au prochain essai
    if (isClash) deps.draft.clearOrderNumber(draftId);
    const type = isNetwork
      ? "network"
      : isClash
        ? "order_number_clash"
        : EXPIRED.test(message)
          ? "uploads_expired"
          : "rejected";
    return { ok: false, error: { type, message } };
  }
}
