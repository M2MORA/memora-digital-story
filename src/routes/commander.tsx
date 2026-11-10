import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  ChevronDown,
  Clapperboard,
  Images,
  Loader2,
  Minus,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cart, useStore, type CartItem } from "@/lib/cart";
import { finalizeOrderWithIntents } from "@/lib/supabase";
import {
  putCachedMedia,
  getCachedMedia,
  clearDraftMedia,
  getMediaCacheKey,
} from "@/lib/media-cache";
import {
  cancelBackgroundUpload,
  forgetDraftUploads,
  startBackgroundUpload,
  useBackgroundUploads,
} from "@/lib/background-uploads";
import { clearDraftOrderNumber, getOrCreateDraftOrderNumber } from "@/lib/draft-manager";
import {
  type Format,
  formatTND,
  FREE_SHIPPING_THRESHOLD_TND,
  getVideoSurcharge,
  INCLUDED_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
} from "@/lib/pricing";
import {
  defaultCrop,
  loadImage,
  renderCroppedPhoto,
  type PhotoCrop,
  type Size,
} from "@/lib/photo-crop";
import {
  CroppedPhoto,
  OrderCta,
  OrderFooter,
  OrderHeader,
  OrderStepper,
} from "@/components/order/OrderChrome";
import { CropSheet } from "@/components/order/CropSheet";
import { FrameSheet } from "@/components/order/FrameSheet";
import { TapPreview } from "@/components/order/TapPreview";
import hero from "@/assets/hero-v2.jpg";

const TUNISIAN_GOVERNORATES = [
  "Ariana",
  "Béja",
  "Ben Arous",
  "Bizerte",
  "Gabès",
  "Gafsa",
  "Jendouba",
  "Kairouan",
  "Kasserine",
  "Kébili",
  "Le Kef",
  "Mahdia",
  "La Manouba",
  "Médenine",
  "Monastir",
  "Nabeul",
  "Sfax",
  "Sidi Bouzid",
  "Siliana",
  "Sousse",
  "Tataouine",
  "Tozeur",
  "Tunis",
  "Zaghouan",
];

const WHATSAPP_URL =
  "https://wa.me/21698000000?text=Bonjour,%20je%20souhaite%20commander%20un%20tirage%20M%C3%A9mora%20et%20vous%20envoyer%20ma%20vid%C3%A9o%20et%20ma%20photo.";
const VIDEO_ACCEPT = ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

type CommanderSearch = {
  stage?:
    | "picker"
    | "video"
    | "photo"
    | "preview"
    | "cart"
    | "delivery"
    | "payment"
    | "confirmation"
    | undefined;
  format?: Format | undefined;
  product?: string | undefined;
  withFrame?: boolean | undefined;
  support?: string | undefined;
  videoReady?: string | undefined;
};

type Stage = "video" | "photo" | "preview" | "cart" | "delivery" | "confirmation";

// L'aperçu fait partie de l'étape « Photo » ; la confirmation n'a plus de stepper
const STAGE_STEP: Record<Stage, number> = {
  video: 0,
  photo: 1,
  preview: 1,
  cart: 2,
  delivery: 3,
  confirmation: 4,
};

// Cadre de la carte à l'écran Photo (réduit sur les très petits téléphones)
const STAGE_BOX: Record<PhotoCrop["orientation"], Size> = {
  landscape: { width: 270, height: 180 },
  portrait: { width: 160, height: 240 },
};
const STAGE_BOX_NARROW: Record<PhotoCrop["orientation"], Size> = {
  landscape: { width: 234, height: 156 },
  portrait: { width: 140, height: 210 },
};

const H1 = "font-serif text-[34px] font-semibold leading-[1.05] tracking-normal text-m-ink";
const SUB = "mt-2 text-[15px] leading-relaxed text-m-muted";
const CHIP =
  "h-10 rounded-full bg-m-paper px-[18px] text-[15px] font-semibold text-m-ink transition-colors hover:bg-m-blush";
const OPTION =
  "flex min-h-[100px] w-full cursor-pointer items-center gap-4 rounded-[22px] border border-m-line bg-m-paper p-[18px] text-left text-m-ink transition-colors hover:border-m-rose focus-within:outline focus-within:outline-2 focus-within:outline-m-wine disabled:cursor-not-allowed disabled:opacity-50";
const OPTION_ICON =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-m-blush text-m-wine";
const FIELD_LABEL = "mb-1.5 block text-[13px] font-bold tracking-[0.06em] text-m-muted";
const FIELD =
  "h-[54px] w-full appearance-none rounded-2xl border border-m-line-strong bg-m-paper px-4 text-[17px] text-m-ink outline-none placeholder:text-m-step/70 focus:outline-2 focus:outline-offset-1 focus:outline-m-wine";
const BOX = "rounded-[20px] border border-m-line bg-m-paper p-4";
const QTY_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-full border border-m-line bg-m-linen text-m-ink transition-colors hover:bg-m-blush";

function newItemKey() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 8 chiffres tunisiens, avec ou sans l'indicatif 216 tapé par le client */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
}

function formatPhone(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function cropSettingsOf(crop: PhotoCrop): CartItem["cropSettings"] {
  return {
    zoom: crop.zoom,
    rotation: 0,
    aspect: crop.orientation,
    pan: { x: crop.offsetX, y: crop.offsetY },
  };
}

function initialStage(stage: CommanderSearch["stage"]): Stage {
  // Les médias ne survivent pas à un rechargement : on ne reprend qu'au panier ou à la livraison
  if (stage === "cart") return "cart";
  if (stage === "delivery" || stage === "payment") return "delivery";
  return "video";
}

function useIsNarrowScreen() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 359px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export const Route = createFileRoute("/commander")({
  validateSearch: (search: Record<string, unknown>): CommanderSearch => {
    const rawStage = search["stage"];
    const rawFormat =
      search["format"] ??
      (search["support"] === "magnet" ? "magnet" : search["support"] ? "10x15" : undefined);
    const rawProduct = search["product"];
    const rawWithFrame = search["withFrame"];
    const rawSupport = search["support"];
    const rawVideoReady = search["videoReady"];

    return {
      stage: typeof rawStage === "string" ? (rawStage as CommanderSearch["stage"]) : undefined,
      format: typeof rawFormat === "string" ? (rawFormat as Format) : undefined,
      product: typeof rawProduct === "string" ? rawProduct : undefined,
      withFrame: rawWithFrame === "true" || rawWithFrame === true,
      support: typeof rawSupport === "string" ? rawSupport : undefined,
      videoReady: typeof rawVideoReady === "string" ? rawVideoReady : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Commander votre Mémora — Photo Connectée NFC" },
      {
        name: "description",
        content:
          "Crée ton MÉMORA en 4 étapes : ta vidéo, ta photo, ton panier, la livraison. Paiement à la livraison partout en Tunisie, sans application.",
      },
    ],
  }),
  component: CommanderPage,
});

function CommanderPage() {
  const search = Route.useSearch();
  const { items, promoCode, draftId, draftToken } = useStore();
  const isNarrow = useIsNarrowScreen();

  const [stage, setStage] = useState<Stage>(() => initialStage(search.stage));
  // Clé stable de la création en cours : elle relie la vidéo, la photo et l'article du panier
  const [currentItemKey, setCurrentItemKey] = useState(newItemKey);
  const withFrame = search.withFrame ?? false;

  // Vidéo
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoStatus, setVideoStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Photo
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoNatural, setPhotoNatural] = useState<Size | null>(null);
  const [crop, setCrop] = useState<PhotoCrop | null>(null);
  const [photoThumbUrl, setPhotoThumbUrl] = useState("");
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [sheet, setSheet] = useState<"crop" | "frame" | null>(null);

  // Livraison
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [shipping, setShipping] = useState({ city: "", address: "" });

  // Commande
  type CheckoutStep =
    "idle" | "preparing" | "uploading_media" | "finalizing" | "confirmed" | "error";
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("idle");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [confirmed, setConfirmed] = useState<{
    total: number;
    firstName: string;
    phone: string;
  } | null>(null);

  // Progression des envois en arrière-plan pour les articles du panier
  const backgroundUploads = useBackgroundUploads();
  const mediaUploads = backgroundUploads.filter(
    (upload) => upload.draftId === draftId && items.some((item) => item.key === upload.itemId),
  );
  const uploadTotalBytes = mediaUploads.reduce((sum, upload) => sum + upload.total, 0);
  const uploadLoadedBytes = mediaUploads.reduce(
    (sum, upload) => sum + (upload.status === "ready" ? upload.total : upload.loaded),
    0,
  );
  const uploadPercent =
    uploadTotalBytes > 0
      ? Math.min(100, Math.round((uploadLoadedBytes / uploadTotalBytes) * 100))
      : 0;
  const isUploadingMedia = mediaUploads.some(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );
  const hasUploadError = mediaUploads.some((upload) => upload.status === "error");

  // Dès que l'article est au panier, ses médias partent sans attendre la confirmation
  useEffect(() => {
    if (!draftId || !["cart", "delivery"].includes(stage)) return;

    let isCurrent = true;
    void (async () => {
      for (const item of items) {
        for (const kind of ["photo", "video"] as const) {
          const file = await getCachedMedia(getMediaCacheKey(draftId, item.key, kind));
          if (!isCurrent) return;
          if (file) {
            startBackgroundUpload({ draftId, draftToken, itemId: item.key, kind, file }).catch(
              () => {},
            );
          }
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [draftId, draftToken, items, stage]);

  // Chaque écran commence en haut de page
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const quote = cart.getQuote("TN", "aramex");
  const count = quote.totalQuantity;
  const merchandiseTotal = Number((quote.total - quote.shippingCost).toFixed(2));
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD_TND - merchandiseTotal);
  const freeShippingProgress = Math.min(
    100,
    Math.round((merchandiseTotal / FREE_SHIPPING_THRESHOLD_TND) * 100),
  );
  const isInCart = items.some((item) => item.key === currentItemKey);
  const videoSurcharge = getVideoSurcharge(videoDuration, 1);
  const stageBox = isNarrow ? STAGE_BOX_NARROW : STAGE_BOX;

  const phoneDigits = normalizePhone(customer.phone);
  const formOk =
    customer.name.trim().length >= 2 &&
    /^\d{8}$/.test(phoneDigits) &&
    Boolean(shipping.city) &&
    shipping.address.trim().length >= 4;

  // ---------- Vidéo ----------
  const handleVideoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    const rejectFile = (message: string) => {
      setVideoError(
        videoStatus === "ready" ? `${message} Ta vidéo précédente reste choisie.` : message,
      );
      toast.error(message);
    };

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["mp4", "mov", "webm"].includes(ext)) {
      rejectFile("Format non supporté : choisis une vidéo MP4, MOV ou WebM.");
      return;
    }
    const mimeType = file.type.trim().toLowerCase();
    if (mimeType && !mimeType.startsWith("video/") && mimeType !== "application/octet-stream") {
      rejectFile("Ce fichier n'est pas une vidéo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024 * 1024) {
      rejectFile("La vidéo dépasse la taille maximale de 5 Go.");
      return;
    }
    if (file.size <= 0) {
      rejectFile("Ce fichier vidéo est vide.");
      return;
    }

    if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    // Le client change de vidéo : l'envoi de la précédente s'arrête immédiatement
    cancelBackgroundUpload(draftId, currentItemKey, "video");

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setVideoDuration(0);
    setVideoStatus("loading");
    setVideoError(null);
    setIsVideoPlaying(false);

    try {
      await putCachedMedia(getMediaCacheKey(draftId, currentItemKey, "video"), file);
    } catch {
      setVideoError(
        "La vidéo est chargée, mais n'a pas pu être gardée sur cet appareil. Garde cette page ouverte jusqu'à la fin de la commande.",
      );
    }
  };

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  // L'envoi commence quand le client a validé sa vidéo, pas à la simple sélection
  const handleValidateVideo = () => {
    if (videoFile) {
      startBackgroundUpload({
        draftId,
        draftToken,
        itemId: currentItemKey,
        kind: "video",
        file: videoFile,
      }).catch(() => {});
    }
    videoRef.current?.pause();
    setStage("photo");
  };

  // ---------- Photo ----------
  const applyPhotoFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const natural = { width: img.naturalWidth, height: img.naturalHeight };
      if (photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(url);
      setPhotoName(file.name);
      setPhotoNatural(natural);
      setCrop(defaultCrop(natural));
      setPhotoThumbUrl("");
    } catch {
      URL.revokeObjectURL(url);
      toast.error("Cette photo ne peut pas être lue. Choisis-en une autre (JPG, PNG ou WEBP).");
    }
  };

  const handlePhotoInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (
      !["jpg", "jpeg", "png", "webp"].includes(ext) ||
      (file.type && !file.type.startsWith("image/"))
    ) {
      toast.error("Format non supporté : choisis une photo JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("La photo dépasse la taille maximale de 25 Mo.");
      return;
    }
    if (file.size <= 0) {
      toast.error("Ce fichier photo est vide.");
      return;
    }
    await applyPhotoFile(file);
  };

  const handleFrameCapture = async (file: File) => {
    await applyPhotoFile(file);
    setSheet(null);
  };

  const clearPhoto = () => {
    if (photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    setPhotoUrl("");
    setPhotoName("");
    setPhotoNatural(null);
    setCrop(null);
    setPhotoThumbUrl("");
  };

  // La carte est imprimée exactement comme le client l'a cadrée
  const handleValidatePhoto = async () => {
    if (!photoUrl || !crop) return;
    setIsPreparingPhoto(true);
    try {
      const { file, thumbUrl } = await renderCroppedPhoto(
        photoUrl,
        crop,
        `memora_${currentItemKey}.jpg`,
      );
      await putCachedMedia(getMediaCacheKey(draftId, currentItemKey, "photo"), file);
      setPhotoThumbUrl(thumbUrl);
      if (isInCart) {
        cart.update(currentItemKey, {
          photoPreviewUrl: thumbUrl,
          photoName,
          cropSettings: cropSettingsOf(crop),
        });
      }
      setStage("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La photo n'a pas pu être préparée.");
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  // ---------- Panier ----------
  const handleAddToCart = () => {
    if (!crop) return;
    const data = {
      format: "10x15" as Format,
      withFrame,
      videoDurationSec: videoDuration,
      photoPreviewUrl: photoThumbUrl || undefined,
      videoName,
      photoName,
      cropSettings: cropSettingsOf(crop),
    };
    // Revenir en arrière puis rajouter ne crée pas de doublon : on met à jour la même création
    if (isInCart) cart.update(currentItemKey, data);
    else cart.add("p1", { key: currentItemKey, qty: 1, ...data });
    setStage("cart");
  };

  const removeItem = (key: string) => {
    cancelBackgroundUpload(draftId, key);
    cart.remove(key);
  };

  const startNewMemora = () => {
    if (!isInCart) cancelBackgroundUpload(draftId, currentItemKey);
    if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    if (photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    setVideoUrl("");
    setVideoFile(null);
    setVideoName("");
    setVideoDuration(0);
    setVideoStatus("empty");
    setVideoError(null);
    setIsVideoPlaying(false);
    setPhotoUrl("");
    setPhotoName("");
    setPhotoNatural(null);
    setCrop(null);
    setPhotoThumbUrl("");
    setSheet(null);
    setCheckoutStep("idle");
    setCheckoutError(null);
    setCurrentItemKey(newItemKey());
    setStage("video");
  };

  // ---------- Commande : pipeline direct Cloudflare R2 ----------
  const handleConfirmOrder = async () => {
    if (isSubmitting) return;
    if (items.length === 0) {
      toast.error("Ton panier est vide");
      return;
    }
    const fullName = customer.name.trim();
    if (fullName.length < 2) {
      toast.error("Indique ton nom et prénom");
      return;
    }
    if (!/^\d{8}$/.test(phoneDigits)) {
      toast.error("Le téléphone doit avoir 8 chiffres, par exemple 20 123 456");
      return;
    }
    const customerPhone = `+216 ${phoneDigits}`;
    if (!shipping.city || shipping.address.trim().length < 4) {
      toast.error("Indique ton gouvernorat et ton adresse");
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);
    const newOrderNum = getOrCreateDraftOrderNumber(draftId);
    setOrderNumber(newOrderNum);

    try {
      // Étape A — Récupération des médias depuis IndexedDB pour chaque article
      setCheckoutStep("preparing");
      setCheckoutMessage("Vérification des fichiers sur ton appareil…");

      const preparedMedia: Array<{ item: CartItem; photoFile: File; videoFile: File }> = [];

      for (const [i, it] of items.entries()) {
        const photoFile = await getCachedMedia(getMediaCacheKey(draftId, it.key, "photo"));
        const itemVideoFile = await getCachedMedia(getMediaCacheKey(draftId, it.key, "video"));

        if (!photoFile || !itemVideoFile) {
          const what = !photoFile ? "La photo" : "La vidéo";
          const errMsg = `${what} du MÉMORA n° ${i + 1} n'est plus sur cet appareil. Supprime-le du panier puis recrée-le.`;
          setCheckoutStep("error");
          setCheckoutError(errMsg);
          toast.error(errMsg);
          setIsSubmitting(false);
          return;
        }

        preparedMedia.push({ item: it, photoFile, videoFile: itemVideoFile });
      }

      // Les fichiers déjà envoyés sont réutilisés ; seul ce qui manque est attendu
      const resolveIntentMappings = async () => {
        setCheckoutStep("uploading_media");
        setCheckoutMessage("Envoi de tes fichiers…");

        const media = preparedMedia.flatMap(({ item, photoFile, videoFile: itemVideoFile }) => [
          { item_id: item.key, file_kind: "photo" as const, file: photoFile },
          { item_id: item.key, file_kind: "video" as const, file: itemVideoFile },
        ]);

        return Promise.all(
          media.map(async ({ item_id, file_kind, file }) => ({
            item_id,
            file_kind,
            intent_id: await startBackgroundUpload({
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
      const finalizeOrder = async (
        intentMappings: Awaited<ReturnType<typeof resolveIntentMappings>>,
      ) => {
        setCheckoutStep("finalizing");
        setCheckoutMessage("Enregistrement de ta commande…");

        return finalizeOrderWithIntents({
          orderPayload: {
            order_number: newOrderNum,
            customer_name: fullName,
            customer_email: "client@memora.tn",
            customer_phone: customerPhone,
            shipping_address: {
              address: shipping.address.trim(),
              postalCode: "",
              city: shipping.city,
              country: "TN",
              carrier: "aramex",
              recipient: fullName,
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

      let finalizeResult = await finalizeOrder(await resolveIntentMappings());

      // Fichiers devenus trop anciens côté serveur : un seul renvoi complet
      if (!finalizeResult.success && /expir/i.test(finalizeResult.error ?? "")) {
        forgetDraftUploads(draftId);
        finalizeResult = await finalizeOrder(await resolveIntentMappings());
      }

      if (!finalizeResult.success) {
        throw new Error(finalizeResult.error || "Échec de finalisation de la commande");
      }

      // Le total vient du serveur (recalculé), avant de vider le panier
      setConfirmed({
        total: typeof finalizeResult.total === "number" ? finalizeResult.total : quote.total,
        firstName: fullName.split(/\s+/)[0] ?? fullName,
        phone: phoneDigits,
      });

      forgetDraftUploads(draftId);
      clearDraftOrderNumber(draftId);

      // Cleanup policy : suppression des fichiers locaux UNIQUEMENT après succès.
      // Non attendue : effacer une grosse vidéo ne doit pas retarder la confirmation.
      void clearDraftMedia(draftId);
      cart.clear();

      setCheckoutStep("confirmed");
      setStage("confirmation");
    } catch (err: unknown) {
      console.error("Erreur commande R2 / Finalisation:", err);
      const rawMessage = err instanceof Error ? err.message : "";
      // Coupure réseau : un message clair plutôt que « Failed to fetch »
      const isNetworkError =
        err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(rawMessage);
      const msg = isNetworkError
        ? "Connexion impossible. Vérifie ta connexion internet puis réessaie : rien n'a été perdu."
        : rawMessage || "Une erreur est survenue pendant l'enregistrement de ta commande.";
      // Numéro déjà attribué à une autre commande : en tirer un nouveau au prochain essai
      if (rawMessage.includes("order_number")) {
        clearDraftOrderNumber(draftId);
      }
      setCheckoutStep("error");
      setCheckoutError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Navigation ----------
  const hasCreation = videoStatus === "ready" && Boolean(photoThumbUrl);
  const goBack: Record<Stage, (() => void) | undefined> = {
    video: undefined,
    photo: () => setStage("video"),
    preview: () => setStage("photo"),
    cart: () => setStage(hasCreation ? "preview" : "video"),
    delivery: () => setStage("cart"),
    confirmation: undefined,
  };

  let cta: Parameters<typeof OrderCta>[0];
  switch (stage) {
    case "video":
      cta = {
        label: "Suivant · Ta photo",
        onClick: handleValidateVideo,
        disabled: videoStatus !== "ready",
      };
      break;
    case "photo":
      cta = {
        label: "Valider la photo",
        onClick: () => void handleValidatePhoto(),
        disabled: !photoUrl || !crop,
        busy: isPreparingPhoto,
      };
      break;
    case "preview":
      cta = {
        label: "Ajouter au panier",
        onClick: handleAddToCart,
        disabled: !photoThumbUrl || videoStatus !== "ready",
      };
      break;
    case "cart":
      cta = {
        label: "Suivant · Livraison",
        onClick: () => setStage("delivery"),
        disabled: count === 0,
      };
      break;
    case "delivery":
      cta = {
        label: isSubmitting
          ? "Envoi en cours…"
          : count === 0
            ? "Confirmer"
            : `${checkoutStep === "error" ? "Réessayer" : "Confirmer"} · ${formatTND(quote.total)}`,
        type: "submit",
        form: "delivery-form",
        disabled: !formOk || count === 0,
        busy: isSubmitting,
      };
      break;
    default:
      cta = { label: "Créer un autre MÉMORA", onClick: startNewMemora };
  }

  return (
    <div className="min-h-dvh bg-m-backdrop font-sans text-m-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-m-linen">
        <OrderHeader
          onBack={isSubmitting ? undefined : goBack[stage]}
          cartCount={count}
          onOpenCart={() => setStage("cart")}
        />
        {stage !== "confirmation" && <OrderStepper current={STAGE_STEP[stage]} />}

        <div className="flex-1 px-5 pb-5 pt-[22px]">
          {/* ============ 1 · VIDÉO ============ */}
          {stage === "video" && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={H1}>Ta vidéo</h1>
                <p className={SUB}>Elle s'ouvre quand on approche un téléphone de la carte.</p>
              </div>

              {videoUrl ? (
                <>
                  <div className="relative flex h-[300px] items-center justify-center overflow-hidden rounded-3xl bg-m-night">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                      onClick={toggleVideo}
                      onPlay={() => setIsVideoPlaying(true)}
                      onPause={() => setIsVideoPlaying(false)}
                      onEnded={() => setIsVideoPlaying(false)}
                      onLoadedMetadata={(e) => {
                        const duration = e.currentTarget.duration;
                        if (!Number.isFinite(duration) || duration <= 0) {
                          setVideoStatus("error");
                          setVideoError(
                            "La durée de cette vidéo n'a pas pu être vérifiée. Choisis un autre fichier.",
                          );
                          return;
                        }
                        const rounded = Math.ceil(duration);
                        setVideoDuration(rounded);
                        if (rounded > MAX_VIDEO_SECONDS) {
                          setVideoStatus("error");
                          setVideoError(
                            "Cette vidéo dépasse 30 minutes. Choisis une vidéo plus courte.",
                          );
                          return;
                        }
                        setVideoStatus("ready");
                      }}
                      onError={() => {
                        setVideoStatus("error");
                        setVideoError(
                          "Impossible de lire cette vidéo. Essaie un autre fichier (MP4, MOV ou WebM).",
                        );
                      }}
                    />
                    {videoStatus === "ready" && !isVideoPlaying && (
                      <button
                        type="button"
                        onClick={toggleVideo}
                        aria-label="Lire la vidéo"
                        className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-m-linen/90 text-m-wine"
                      >
                        <Play className="ml-1 h-[26px] w-[26px] fill-current" />
                      </button>
                    )}
                    {videoStatus === "loading" && (
                      <Loader2
                        className="absolute h-8 w-8 animate-spin text-m-linen"
                        aria-hidden="true"
                      />
                    )}
                    {videoStatus === "ready" && !isVideoPlaying && (
                      <span className="absolute bottom-4 left-4 text-[13px] font-semibold tabular-nums text-m-linen">
                        {formatClock(videoDuration)}
                      </span>
                    )}
                    <label
                      className={`${CHIP} absolute bottom-2.5 right-3 flex cursor-pointer items-center focus-within:outline focus-within:outline-2 focus-within:outline-m-linen`}
                    >
                      Remplacer
                      <input
                        type="file"
                        accept={VIDEO_ACCEPT}
                        className="sr-only"
                        onChange={(e) => void handleVideoUpload(e)}
                      />
                    </label>
                  </div>

                  <div role="status" className="flex flex-col gap-2">
                    {videoStatus === "ready" && (
                      <p className="flex items-center gap-2 text-sm font-semibold text-m-sage">
                        <Check className="h-[18px] w-[18px]" strokeWidth={2.6} /> Vidéo prête
                      </p>
                    )}
                    {videoStatus === "loading" && (
                      <p className="text-sm text-m-muted">Vérification de la vidéo…</p>
                    )}
                    {videoStatus === "ready" && videoDuration > INCLUDED_VIDEO_SECONDS && (
                      <p className="text-sm text-m-muted">
                        Ta vidéo dépasse 8 minutes : +{formatTND(videoSurcharge)} (1,50 DT par
                        minute en plus).
                      </p>
                    )}
                  </div>
                  {videoError && (
                    <p
                      role="alert"
                      className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-m-ink"
                    >
                      {videoError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="flex h-[300px] w-full cursor-pointer flex-col items-center justify-center gap-3.5 rounded-3xl border-2 border-dashed border-m-rose bg-m-paper text-m-ink transition-colors hover:bg-m-blush/40 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-m-wine">
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-m-wine text-m-linen">
                      <Plus className="h-[30px] w-[30px]" strokeWidth={2.4} />
                    </span>
                    <span className="text-lg font-bold">Choisir une vidéo</span>
                    <span className="text-sm text-m-muted">Depuis ta galerie, en un tap</span>
                    <input
                      type="file"
                      accept={VIDEO_ACCEPT}
                      className="sr-only"
                      onChange={(e) => void handleVideoUpload(e)}
                    />
                  </label>
                  {videoError && (
                    <p
                      role="alert"
                      className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-m-ink"
                    >
                      {videoError}
                    </p>
                  )}
                  <p className="text-center text-sm text-m-muted">
                    Ta vidéo est sur un PC ?{" "}
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-m-wine underline-offset-2 hover:underline"
                    >
                      Envoie-la sur WhatsApp
                    </a>
                  </p>
                </>
              )}
            </div>
          )}

          {/* ============ 2 · PHOTO ============ */}
          {stage === "photo" && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={H1}>Ta photo</h1>
                <p className={SUB}>Celle qui sera imprimée sur la carte.</p>
              </div>

              {photoUrl && crop && photoNatural ? (
                <div className="flex flex-col items-center gap-[18px] rounded-3xl bg-m-stage px-5 pb-4 pt-7">
                  <CroppedPhoto
                    photoUrl={photoUrl}
                    natural={photoNatural}
                    crop={crop}
                    box={stageBox[crop.orientation]}
                    className="rounded-md bg-m-paper shadow-[0_16px_34px_rgba(42,26,31,0.18)]"
                  />
                  <div className="flex gap-2.5 self-stretch justify-end">
                    <button type="button" className={CHIP} onClick={() => setSheet("crop")}>
                      Recadrer
                    </button>
                    <button type="button" className={CHIP} onClick={clearPhoto}>
                      Remplacer
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className={OPTION}>
                    <span className={OPTION_ICON}>
                      <Images className="h-[26px] w-[26px]" strokeWidth={1.8} />
                    </span>
                    <span>
                      <span className="block text-[17px] font-bold">Depuis ta galerie</span>
                      <span className="text-sm text-m-muted">Choisis une photo</span>
                    </span>
                    <input
                      type="file"
                      accept={PHOTO_ACCEPT}
                      className="sr-only"
                      onChange={(e) => void handlePhotoInput(e)}
                    />
                  </label>
                  <button
                    type="button"
                    className={OPTION}
                    onClick={() => setSheet("frame")}
                    disabled={videoStatus !== "ready"}
                  >
                    <span className={OPTION_ICON}>
                      <Clapperboard className="h-[26px] w-[26px]" strokeWidth={1.8} />
                    </span>
                    <span>
                      <span className="block text-[17px] font-bold">Une image de ta vidéo</span>
                      <span className="text-sm text-m-muted">Fais glisser, on capture</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ============ 2 bis · APERÇU ============ */}
          {stage === "preview" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-xs font-bold tracking-[0.16em] text-[#8a5a55]">APERÇU</p>
                <h1 className={`${H1} mt-1.5`}>Voilà ton MÉMORA</h1>
              </div>
              <TapPreview
                photoUrl={photoThumbUrl}
                orientation={crop?.orientation ?? "landscape"}
                videoUrl={videoUrl}
              />
              <p className="text-center text-[15px] leading-relaxed text-m-muted">
                On approche le téléphone de la carte, et ta vidéo se lance. Sans application.
              </p>
            </div>
          )}

          {/* ============ 3 · PANIER ============ */}
          {stage === "cart" && (
            <div className="flex flex-col gap-4">
              <h1 className={H1}>Ton panier</h1>
              {count === 0 && (
                <p className="text-[15px] text-m-muted">Ton panier est vide pour l'instant.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {items.map((item, index) => (
                  <div
                    key={item.key}
                    className="overflow-hidden rounded-[20px] border border-m-line bg-m-paper"
                  >
                    <div className="flex h-[120px] items-center justify-center bg-m-stage">
                      <img
                        src={item.photoPreviewUrl || hero}
                        alt={`MÉMORA n° ${index + 1}`}
                        className="max-h-[92px] max-w-[120px] rounded-[4px] object-cover shadow-[0_8px_18px_rgba(42,26,31,0.15)]"
                      />
                    </div>
                    <div className="flex items-center justify-between p-2.5">
                      <button
                        type="button"
                        className={QTY_BUTTON}
                        aria-label={
                          item.qty === 1
                            ? `Supprimer le MÉMORA n° ${index + 1}`
                            : "Retirer un exemplaire"
                        }
                        onClick={() =>
                          item.qty === 1
                            ? removeItem(item.key)
                            : cart.setQty(item.key, item.qty - 1)
                        }
                      >
                        {item.qty === 1 ? (
                          <Trash2 className="h-[18px] w-[18px]" />
                        ) : (
                          <Minus className="h-[18px] w-[18px]" />
                        )}
                      </button>
                      <span
                        className="text-[17px] font-bold tabular-nums"
                        aria-label={`Quantité : ${item.qty}`}
                      >
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        className={QTY_BUTTON}
                        aria-label="Ajouter un exemplaire"
                        onClick={() => cart.setQty(item.key, item.qty + 1)}
                      >
                        <Plus className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={startNewMemora}
                  className="flex min-h-[186px] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-m-rose bg-m-paper text-[15px] font-bold text-m-wine transition-colors hover:bg-m-blush/40"
                >
                  <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-m-wine text-m-linen">
                    <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />
                  </span>
                  Nouveau MÉMORA
                </button>
              </div>

              {count > 0 && (
                <div className={BOX}>
                  <p className="text-sm text-m-muted">
                    {quote.isFreeShipping
                      ? "Livraison offerte"
                      : `Encore ${formatTND(remainingForFreeShipping)} pour la livraison offerte`}
                  </p>
                  <div className="my-3 h-1.5 overflow-hidden rounded-full bg-m-line">
                    <i
                      className={`block h-1.5 rounded-full ${quote.isFreeShipping ? "bg-m-sage" : "bg-m-wine"}`}
                      style={{ width: `${freeShippingProgress}%` }}
                    />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <b className="text-[28px]">{formatTND(merchandiseTotal)}</b>
                    <span className="text-sm text-m-muted">{count} MÉMORA</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ 4 · LIVRAISON ============ */}
          {stage === "delivery" &&
            (count === 0 ? (
              <div className="flex flex-col gap-4">
                <h1 className={H1}>On livre où ?</h1>
                <p className="text-[15px] text-m-muted">
                  Ton panier est vide : crée d'abord ton MÉMORA.
                </p>
                <button
                  type="button"
                  onClick={startNewMemora}
                  className={`${CHIP} self-start border border-m-line`}
                >
                  Créer mon MÉMORA
                </button>
              </div>
            ) : (
              <form
                id="delivery-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleConfirmOrder();
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <h1 className={H1}>On livre où ?</h1>
                  <p className={SUB}>Tu paies à la livraison. On t'appelle pour confirmer.</p>
                </div>

                <div>
                  <label htmlFor="cmd-name" className={FIELD_LABEL}>
                    NOM ET PRÉNOM
                  </label>
                  <input
                    id="cmd-name"
                    required
                    minLength={2}
                    autoComplete="name"
                    placeholder="Sarra Ben Ali"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="cmd-phone" className={FIELD_LABEL}>
                    TÉLÉPHONE
                  </label>
                  <div className="flex h-[54px] overflow-hidden rounded-2xl border border-m-line-strong bg-m-paper focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-m-wine">
                    <span className="flex items-center border-r border-m-line pl-4 pr-3 text-[17px] font-semibold text-m-muted">
                      +216
                    </span>
                    <input
                      id="cmd-phone"
                      required
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      pattern="\s*(216\s*)?(\d\s*){8}"
                      title="8 chiffres, par exemple 20 123 456"
                      placeholder="20 123 456"
                      value={customer.phone}
                      onChange={(e) =>
                        setCustomer({
                          ...customer,
                          phone: e.target.value.replace(/[^\d ]/g, "").slice(0, 16),
                        })
                      }
                      className="min-w-0 flex-1 bg-transparent px-3.5 text-[17px] text-m-ink outline-none placeholder:text-m-step/70"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cmd-gov" className={FIELD_LABEL}>
                    GOUVERNORAT
                  </label>
                  <div className="relative">
                    <select
                      id="cmd-gov"
                      required
                      value={shipping.city}
                      onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                      className={`${FIELD} pr-11 ${shipping.city ? "" : "text-m-step"}`}
                    >
                      <option value="">Choisir…</option>
                      {TUNISIAN_GOVERNORATES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-m-muted"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cmd-address" className={FIELD_LABEL}>
                    ADRESSE
                  </label>
                  <input
                    id="cmd-address"
                    required
                    minLength={4}
                    autoComplete="street-address"
                    placeholder="Rue, quartier, ville"
                    value={shipping.address}
                    onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                    className={FIELD}
                  />
                </div>

                <div className={`${BOX} text-[15px]`}>
                  <div className="flex justify-between py-1">
                    <span className="text-m-muted">{count} MÉMORA</span>
                    <span>
                      {formatTND(
                        quote.itemsSubtotal + quote.framesSubtotal + quote.videoSurcharges,
                      )}
                    </span>
                  </div>
                  {quote.discount > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-m-muted">Réduction</span>
                      <span>-{formatTND(quote.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-m-muted">Livraison</span>
                    <span>
                      {quote.shippingCost > 0 ? formatTND(quote.shippingCost) : "Offerte"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex justify-between border-t border-m-line pt-2.5 text-[17px] font-bold">
                    <span>Total à payer</span>
                    <span>{formatTND(quote.total)}</span>
                  </div>
                </div>

                <p className="text-center text-[13px] leading-relaxed text-m-muted">
                  En confirmant, tu acceptes les{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-m-wine underline underline-offset-2"
                  >
                    conditions générales de vente
                  </a>
                  .
                </p>

                {!isSubmitting && isUploadingMedia && (
                  <div className={BOX}>
                    <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-m-wine">
                      <span>Envoi de tes fichiers…</span>
                      <span className="tabular-nums">{uploadPercent} %</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Progression de l'envoi de tes fichiers"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadPercent}
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-m-line"
                    >
                      <div
                        className="h-full rounded-full bg-m-wine transition-[width] duration-300"
                        style={{ width: `${uploadPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[13px] text-m-muted">
                      Tu peux déjà confirmer ta commande.
                    </p>
                  </div>
                )}

                {!isSubmitting &&
                  !isUploadingMedia &&
                  hasUploadError &&
                  checkoutStep !== "error" && (
                    <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-m-ink">
                      Un fichier n'a pas pu être envoyé. Vérifie ta connexion : il sera renvoyé
                      quand tu confirmeras.
                    </p>
                  )}

                {isSubmitting && (
                  <div role="status" className={`${BOX} flex items-center gap-3`}>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-m-wine" />
                    <div>
                      <p className="text-[13px] font-bold text-m-wine">
                        {checkoutStep === "preparing" && "1/3 · Préparation des fichiers"}
                        {checkoutStep === "uploading_media" &&
                          `2/3 · Envoi de tes fichiers · ${uploadPercent} %`}
                        {checkoutStep === "finalizing" && "3/3 · Enregistrement de la commande"}
                      </p>
                      <p className="text-[13px] text-m-muted">{checkoutMessage}</p>
                    </div>
                  </div>
                )}

                {checkoutStep === "error" && checkoutError && !isSubmitting && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-[13px] text-m-ink"
                  >
                    <p className="font-bold text-destructive">La commande n'est pas passée</p>
                    <p className="mt-1 leading-relaxed">{checkoutError}</p>
                  </div>
                )}
              </form>
            ))}

          {/* ============ MERCI ============ */}
          {stage === "confirmation" && (
            <div className="flex flex-col items-center gap-4 pt-[50px] text-center">
              <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-m-wine text-m-linen">
                <Check className="h-10 w-10" strokeWidth={2.6} />
              </span>
              <h1 className={H1}>Merci{confirmed?.firstName ? ` ${confirmed.firstName}` : ""} !</h1>
              <p className="max-w-[300px] text-[15px] leading-relaxed text-m-muted">
                Ta commande est reçue.{" "}
                {confirmed
                  ? `On t'appelle au +216 ${formatPhone(confirmed.phone)} pour la confirmer.`
                  : "On t'appelle pour la confirmer."}
              </p>
              {confirmed && (
                <div className={`${BOX} text-[15px]`}>
                  Total à payer à la livraison : <b>{formatTND(confirmed.total)}</b>
                </div>
              )}
              {orderNumber && <p className="text-sm text-m-muted">Commande n° {orderNumber}</p>}
            </div>
          )}
        </div>

        <OrderFooter>
          <OrderCta {...cta} />
        </OrderFooter>
      </div>

      {sheet === "crop" && photoUrl && crop && photoNatural && (
        <CropSheet
          photoUrl={photoUrl}
          natural={photoNatural}
          crop={crop}
          onChange={(update) => setCrop((current) => (current ? update(current) : current))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "frame" && videoUrl && (
        <FrameSheet
          videoUrl={videoUrl}
          duration={videoDuration}
          onCapture={handleFrameCapture}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
