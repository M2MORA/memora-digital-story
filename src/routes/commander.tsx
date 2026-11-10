import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Video,
  Image as ImageIcon,
  ShoppingBag,
  Truck,
  CreditCard,
  Banknote,
  CheckCircle2,
  Upload,
  Smartphone,
  Sparkles,
  RotateCw,
  Plus,
  Minus,
  Trash2,
  Copy,
  Users,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Maximize2,
  Tag,
  Gift,
  HelpCircle,
  ExternalLink,
  MessageCircle,
  Camera,
  Film,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cart, useStore, CartItem } from "@/lib/cart";
import { finalizeOrderWithIntents } from "@/lib/supabase";
import { putCachedMedia, getCachedMedia, clearDraftMedia, getMediaCacheKey } from "@/lib/media-cache";
import {
  cancelBackgroundUpload,
  forgetDraftUploads,
  startBackgroundUpload,
  useBackgroundUploads,
} from "@/lib/background-uploads";
import { clearDraftOrderNumber, getOrCreateDraftOrderNumber } from "@/lib/draft-manager";
import PhotoCustomizer, { type CropSettings } from "@/components/site/PhotoCustomizer";

const TUNISIAN_GOVERNORATES = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Nabeul",
  "Zaghouan",
  "Bizerte",
  "Béja",
  "Jendouba",
  "Le Kef",
  "Siliana",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Sfax",
  "Kairouan",
  "Kasserine",
  "Sidi Bouzid",
  "Gabès",
  "Médenine",
  "Tataouine",
  "Gafsa",
  "Tozeur",
  "Kébili",
];
import {
  Format,
  getUnitPrice,
  getVideoSurcharge,
  FRAME_PRICES,
  getShippingOptions,
  formatTND,
  FREE_SHIPPING_THRESHOLD_TND,
  INCLUDED_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
} from "@/lib/pricing";
import { PriceDrawer } from "@/components/site/PriceDrawer";
import { MobileUploadModal } from "@/components/site/MobileUploadModal";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { TapDemo } from "@/components/site/TapDemo";
import envelopeImg from "@/assets/product-envelope-v2.jpg";
import hero from "@/assets/hero-v2.jpg";
import moments from "@/assets/product-moments-v2.jpg";
import scan from "@/assets/scan-v2.jpg";

type CommanderSearch = {
  stage?: "picker" | "video" | "photo" | "preview" | "cart" | "delivery" | "payment" | "confirmation" | undefined;
  format?: Format | undefined;
  product?: string | undefined;
  withFrame?: boolean | undefined;
  support?: string | undefined;
  videoReady?: string | undefined;
};

// Format seconds into mm:ss
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
      stage: typeof rawStage === "string" ? (rawStage as any) : undefined,
      format: typeof rawFormat === "string" ? (rawFormat as any) : undefined,
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
          "Créez votre photo NFC en étapes simples : Vidéo, Photo, Aperçu interactif, Panier. Compatible iPhone et Android sans aucune application.",
      },
    ],
  }),
  component: CommanderPage,
});

function CommanderPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { items, discountPercent, promoCode, draftId, draftToken } = useStore();

  // Mode: "picker" (choix du produit) ou "funnel" (étapes de création)
  const [funnelStage, setFunnelStage] = useState<
    "picker" | "video" | "photo" | "preview" | "cart" | "delivery" | "payment" | "confirmation"
  >(() => {
    if (search.stage) return search.stage;
    if (search.format) return "video";
    return "picker";
  });

  // Clé d'article stable pour la création en cours dans commander.tsx
  const [currentItemKey, setCurrentItemKey] = useState(
    () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  // Selected format for the current creation
  const [selectedFormat, setSelectedFormat] = useState<Format>("10x15");
  const [selectedWithFrame, setSelectedWithFrame] = useState(search.withFrame ?? false);

  // Modals
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(false);

  // Step 1: Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoName, setVideoName] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoStatus, setVideoStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [videoErrorMessage, setVideoErrorMessage] = useState<string | null>(null);
  const [isDemoVideo, setIsDemoVideo] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Step 2: Photo & Message state (Live scrubber + frame extractor from original video)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(hero);
  const [photoName, setPhotoName] = useState<string>("photo_principale.jpg");
  const [photoSource, setPhotoSource] = useState<"upload" | "frame">("frame");
  const [photoSelectionMode, setPhotoSelectionMode] = useState<"extract" | "upload">("extract");
  const [videoScrubTime, setVideoScrubTime] = useState(5);
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | null>(null);
  const [isScrubPlaying, setIsScrubPlaying] = useState(false);
  const scrubVideoRef = useRef<HTMLVideoElement | null>(null);

  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [composedPhotoUrl, setComposedPhotoUrl] = useState<string>("");
  const [photoCropSettings, setPhotoCropSettings] = useState<CropSettings | null>(null);
  const [previewSide, setPreviewSide] = useState<"recto" | "verso">("recto");
  const [cardMessage, setCardMessage] = useState<string>("Pour toujours, je t'aime.");

  // Step 4: Delivery state
  const [customer, setCustomer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [shipping, setShipping] = useState({
    address: "",
    postalCode: "",
    city: "",
    country: "TN",
    carrier: "aramex" as any,
  });

  // Step 5: Payment & Checkout pipeline states
  const [legalConsent, setLegalConsent] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "cod">("cod");
  const [promoInput, setPromoInput] = useState("");
  const [giftCardInput, setGiftCardInput] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // États détaillés du cycle d'upload et de commande R2
  type CheckoutStep =
    | "idle"
    | "preparing"
    | "uploading_media"
    | "finalizing"
    | "confirmed"
    | "error";

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("idle");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
  const uploadReadyCount = mediaUploads.filter((upload) => upload.status === "ready").length;
  const isUploadingMedia = mediaUploads.some(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );
  const hasUploadError = mediaUploads.some((upload) => upload.status === "error");

  // Dès que l'article est au panier, ses médias partent sans attendre la confirmation
  useEffect(() => {
    if (!draftId || !["cart", "delivery", "payment"].includes(funnelStage)) return;

    let isCurrent = true;
    void (async () => {
      for (const item of items) {
        for (const kind of ["photo", "video"] as const) {
          const file = await getCachedMedia(getMediaCacheKey(draftId, item.key, kind));
          if (!isCurrent) return;
          if (file) {
            startBackgroundUpload({ draftId, draftToken, itemId: item.key, kind, file }).catch(() => {});
          }
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [draftId, draftToken, items, funnelStage]);

  // Video duration surcharge calculation
  const extraVideoMinutes =
    videoDuration > INCLUDED_VIDEO_SECONDS
      ? Math.ceil((videoDuration - INCLUDED_VIDEO_SECONDS) / 60)
      : 0;
  const videoSurchargeCurrent = getVideoSurcharge(videoDuration, 1);
  const currentOrderQuantity = items.reduce((quantity, item) => quantity + item.qty, 0);
  const selectedItemBasePrice =
    getUnitPrice(selectedFormat, currentOrderQuantity + 1) +
    (selectedWithFrame ? FRAME_PRICES[selectedFormat] : 0);
  const selectedItemEstimate =
    selectedItemBasePrice + (videoStatus === "ready" && !isDemoVideo ? videoSurchargeCurrent : 0);
  const canContinueWithVideo = videoStatus === "ready" && !isDemoVideo;

  const funnelSteps = [
    { id: "video", label: "Vidéo", num: 1 },
    { id: "photo", label: "Photo", num: 2 },
    { id: "preview", label: "Aperçu", num: 3 },
    { id: "cart", label: "Panier", num: 4 },
    { id: "delivery", label: "Livraison", num: 5 },
    { id: "payment", label: "Validation", num: 6 },
  ] as const;
  const activeStepIndex = funnelSteps.findIndex((step) => step.id === funnelStage);
  const activeStep = funnelSteps[activeStepIndex];

  // Overall quote calculation
  const quote = cart.getQuote(shipping.country, shipping.carrier);

  // Handle Video file upload
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    const rejectFile = (message: string) => {
      setVideoErrorMessage(
        videoStatus === "ready"
          ? `${message} Votre vidéo précédente reste sélectionnée.`
          : message,
      );
      toast.error(message);
    };

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["mp4", "mov", "webm"].includes(ext)) {
      rejectFile("Format vidéo non supporté (MP4, MOV ou WebM requis).");
      return;
    }
    const mimeType = file.type.trim().toLowerCase();
    if (mimeType && !mimeType.startsWith("video/") && mimeType !== "application/octet-stream") {
      rejectFile("Ce fichier n’est pas reconnu comme une vidéo.");
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

    if (videoUrl.startsWith("blob:")) {
      URL.revokeObjectURL(videoUrl);
    }
    // Le client change de vidéo : l'envoi de la précédente s'arrête immédiatement
    cancelBackgroundUpload(draftId, currentItemKey, "video");

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setVideoDuration(0);
    setIsDemoVideo(false);
    setVideoStatus("loading");
    setVideoErrorMessage(null);
    setVideoScrubTime(0);
    setCapturedTimestamp(null);

    try {
      const cacheKey = getMediaCacheKey(draftId, currentItemKey, "video");
      await putCachedMedia(cacheKey, file);
      toast.success("Vidéo chargée et prête à être vérifiée.");
    } catch {
      setVideoErrorMessage("La vidéo est chargée, mais sa sauvegarde locale a échoué. Gardez cette page ouverte jusqu’à la suite de la commande.");
      toast.error("La vidéo n’a pas pu être sauvegardée pour reprendre ce brouillon plus tard.");
    }
  };

  // Step time adjustment helpers for scrubber
  const handleScrubChange = (newTime: number) => {
    setVideoScrubTime(newTime);
    if (scrubVideoRef.current) {
      scrubVideoRef.current.currentTime = newTime;
    }
  };

  const stepScrubTime = (delta: number) => {
    const next = Math.max(0, Math.min(videoDuration, Number((videoScrubTime + delta).toFixed(2))));
    handleScrubChange(next);
  };

  const toggleScrubPlay = () => {
    if (!scrubVideoRef.current) return;
    if (isScrubPlaying) {
      scrubVideoRef.current.pause();
      setIsScrubPlaying(false);
    } else {
      void scrubVideoRef.current.play();
      setIsScrubPlaying(true);
    }
  };

  // Capture frame directly from user's original video onto a high-res canvas
  const handleCaptureFrame = async () => {
    const video = scrubVideoRef.current || videoRef.current;
    if (!video) {
      toast.error("Vidéo non disponible pour l'extraction");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossible de créer le contexte 2D");

      // drawImage will throw a SecurityError if video is cross-origin (CORS)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

      const currentSec = Math.floor(video.currentTime || videoScrubTime);
      const fileName = `capture_video_${currentSec}s.jpg`;

      // Convert dataUrl → Blob → File synchronously (no async gap before cache write)
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const photoFileObj = new File([blob], fileName, { type: "image/jpeg" });

      // Cache the file BEFORE updating React state so checkout validation always finds it
      try {
        const cacheKey = getMediaCacheKey(draftId, currentItemKey, "photo");
        await putCachedMedia(cacheKey, photoFileObj);
      } catch {
        // memoryStore fallback is handled inside putCachedMedia
      }

      setPhotoUrl(dataUrl);
      setPhotoSource("frame");
      setCapturedTimestamp(currentSec);
      setPhotoName(fileName);
      setPhotoFile(photoFileObj);

      toast.success(`Moment exact extrait à ${formatTime(currentSec)} !`);
    } catch (err) {
      // CORS or canvas taint — the frame cannot be exported as a File
      console.warn("Échec d'extraction canvas (restriction CORS sur vidéo distante) :", err);
      toast.error(
        "Impossible d'extraire le frame (restriction sécurité navigateur). Veuillez importer votre photo manuellement via le bouton \"Importer une photo\"."
      );
    }
  };

  // Handle Photo file upload (Mode B)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast.error("Format photo non supporté (JPG, JPEG, PNG, WEBP)");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type) && !f.type.startsWith("image/")) {
      toast.error("Type MIME photo invalide");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("La photo dépasse la taille maximale autorisée (25 Mo)");
      return;
    }
    if (f.size <= 0) {
      toast.error("Fichier photo vide");
      return;
    }

    try {
      const cacheKey = getMediaCacheKey(draftId, currentItemKey, "photo");
      await putCachedMedia(cacheKey, f);

      if (photoUrl && photoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(photoUrl);
      }
      const preview = URL.createObjectURL(f);
      setPhotoFile(f);
      setPhotoUrl(preview);
      setPhotoName(f.name);
      setPhotoSource("upload");
      setCapturedTimestamp(null);
      toast.success("Photo importée avec succès !");
    } catch {
      toast.error("Erreur d'enregistrement local de la photo");
    }
  };

  // Add created item to cart
  const handleValidatePhotoAndAddToCart = () => {
    const finalPhoto = composedPhotoUrl || photoUrl;
    cart.add("p1", {
      key: currentItemKey,
      format: "10x15",
      withFrame: selectedWithFrame,
      videoDurationSec: videoDuration,
      photoPreviewUrl: finalPhoto.startsWith("blob:") ? undefined : finalPhoto,
      videoPreviewUrl: videoUrl.startsWith("blob:") ? undefined : videoUrl,
      videoName: videoName,
      photoName: photoName,
      cardMessage,
      qty: 1,
      cropSettings: photoCropSettings ?? {
        zoom: photoZoom,
        rotation: photoRotation,
        aspect: selectedFormat,
      },
    });
    // Génère un nouvel identifiant d'article pour la création suivante
    setCurrentItemKey(`item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    toast.success("Création ajoutée à votre panier !");
    setFunnelStage("cart");
  };

  // Duplicate an item
  const handleDuplicate = (key: string, mode: "same_photo_new_video" | "same_video_new_photo") => {
    cart.duplicate(key, mode);
    toast.success(
      mode === "same_photo_new_video"
        ? "Dupliqué : même photo, nouvelle vidéo à lier"
        : "Dupliqué : même vidéo, nouvelle photo à lier",
    );
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
    setFunnelStage("photo");
  };

  // Final Checkout Submission — DIRECT CLOUDFLARE R2 PIPELINE
  const handleConfirmOrder = async () => {
    if (isSubmitting) return;
    if (!legalConsent) {
      toast.error("Veuillez accepter les conditions générales de vente pour finaliser");
      return;
    }
    if (items.length === 0) {
      toast.error("Votre panier est vide");
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);
    const newOrderNum = getOrCreateDraftOrderNumber(draftId);
    setOrderNumber(newOrderNum);

    try {
      // Step A — Récupération des médias depuis IndexedDB pour chaque article
      setCheckoutStep("preparing");
      setCheckoutMessage("Vérification des fichiers locaux...");

      const preparedMedia: Array<{
        item: CartItem;
        photoFile: File;
        videoFile: File;
      }> = [];

      for (const [i, it] of items.entries()) {
        const photoFile = await getCachedMedia(getMediaCacheKey(draftId, it.key, "photo"));
        const videoFile = await getCachedMedia(getMediaCacheKey(draftId, it.key, "video"));

        if (!photoFile) {
          const errMsg = `Fichier photo manquant pour l'article ${i + 1} (${it.photoName || "photo"}). Veuillez réimporter vos médias dans le Studio.`;
          setCheckoutStep("error");
          setCheckoutError(errMsg);
          toast.error(errMsg);
          setIsSubmitting(false);
          return;
        }

        if (!videoFile) {
          const errMsg = `Fichier vidéo manquant pour l'article ${i + 1} (${it.videoName || "vidéo"}). Veuillez réimporter vos médias dans le Studio.`;
          setCheckoutStep("error");
          setCheckoutError(errMsg);
          toast.error(errMsg);
          setIsSubmitting(false);
          return;
        }

        preparedMedia.push({ item: it, photoFile, videoFile });
      }

      // Les fichiers déjà envoyés sont réutilisés ; seul ce qui manque est attendu
      const resolveIntentMappings = async () => {
        setCheckoutStep("uploading_media");
        setCheckoutMessage("Envoi de vos fichiers...");

        const media = preparedMedia.flatMap(({ item, photoFile, videoFile }) => [
          { item_id: item.key, file_kind: "photo" as const, file: photoFile },
          { item_id: item.key, file_kind: "video" as const, file: videoFile },
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
        setCheckoutMessage("Enregistrement de votre commande...");

        return finalizeOrderWithIntents({
          orderPayload: {
            order_number: newOrderNum,
            customer_name: `${customer.firstName} ${customer.lastName}`.trim() || "Client Mémora",
            customer_email: customer.email || "client@memora.tn",
            customer_phone: customer.phone,
            shipping_address: {
              ...shipping,
              recipient: `${customer.firstName} ${customer.lastName}`.trim(),
            },
            items: normalizedItems,
            promo_code: promoInput.trim() || undefined,
            shipping_carrier: shipping.carrier || "aramex",
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

      forgetDraftUploads(draftId);
      clearDraftOrderNumber(draftId);

      // Cleanup policy : suppression des fichiers locaux UNIQUEMENT après succès
      await clearDraftMedia(draftId);
      cart.clear();

      setCheckoutStep("confirmed");
      setFunnelStage("confirmation");
      toast.success(`Commande #${newOrderNum} confirmée avec succès !`);
    } catch (err: any) {
      console.error("Erreur commande R2 / Finalisation:", err);
      const msg = err?.message || "Une erreur est survenue lors de l'enregistrement de votre commande.";
      // Numéro déjà attribué à une autre commande : en tirer un nouveau au prochain essai
      if (String(err?.message ?? "").includes("order_number")) {
        clearDraftOrderNumber(draftId);
      }
      setCheckoutStep("error");
      setCheckoutError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32 pt-28">

      {/* Stepper Progress Bar (visible once entered the funnel) */}
      {funnelStage !== "picker" && funnelStage !== "confirmation" && (
        <div className="container-x mt-6 max-w-4xl">
          <div className="rounded-2xl border border-border/70 bg-card/85 backdrop-blur-md px-4 sm:px-5 py-3.5 shadow-luxury flex items-center gap-4 text-xs font-medium min-w-0">
            <button
              onClick={() => {
                if (funnelStage === "video") setFunnelStage("picker");
                else if (funnelStage === "photo") setFunnelStage("video");
                else if (funnelStage === "preview") setFunnelStage("photo");
                else if (funnelStage === "cart") setFunnelStage("preview");
                else if (funnelStage === "delivery") setFunnelStage("cart");
                else if (funnelStage === "payment") setFunnelStage("delivery");
              }}
              className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground hover:text-charcoal transition-colors font-medium py-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Retour</span>
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:hidden">
              <div className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
                <span className="shrink-0 font-semibold uppercase tracking-wider text-deep-brown">
                  Étape {activeStepIndex + 1} sur {funnelSteps.length}
                </span>
                <span className="truncate text-right text-muted-foreground">{activeStep?.label}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Progression : étape ${activeStepIndex + 1} sur ${funnelSteps.length}`}
                aria-valuemin={1}
                aria-valuemax={funnelSteps.length}
                aria-valuenow={activeStepIndex + 1}
                className="h-1.5 overflow-hidden rounded-full bg-cream"
              >
                <div
                  className="h-full rounded-full bg-deep-brown transition-[width] duration-300"
                  style={{ width: `${((activeStepIndex + 1) / funnelSteps.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex xl:gap-5">
              {funnelSteps.map((step) => {
                const isActive = funnelStage === step.id;
                const isPassed =
                  (step.id === "video" && funnelStage !== "video") ||
                  (step.id === "photo" && !["video", "photo"].includes(funnelStage)) ||
                  (step.id === "preview" && !["video", "photo", "preview"].includes(funnelStage)) ||
                  (step.id === "cart" && ["delivery", "payment"].includes(funnelStage)) ||
                  (step.id === "delivery" && funnelStage === "payment");

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-1.5 ${isActive
                        ? "text-deep-brown font-semibold"
                        : isPassed
                          ? "text-charcoal font-medium"
                          : "text-muted-foreground/60"
                      }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] transition-all ${isActive
                          ? "bg-deep-brown text-ivory ring-2 ring-champagne/40 font-bold shadow-xs"
                          : isPassed
                            ? "bg-champagne/25 text-deep-brown border border-champagne/40 font-medium"
                            : "border border-border/80 text-muted-foreground"
                        }`}
                    >
                      {step.num}
                    </span>
                    <span className="hidden sm:inline uppercase tracking-[0.14em] text-[11px]">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          ENTRY SCREEN: PRODUCT PICKER (/commander entry)
         ======================================================== */}
      {funnelStage === "picker" && (
        <section className="container-x mt-8 max-w-6xl">
          <div className="text-center">
            <p className="eyebrow tracking-[0.25em] text-deep-brown font-semibold">La boutique MÉMORA</p>
            <h1 className="mt-3 font-serif text-4xl sm:text-6xl text-charcoal">Choisissez votre support</h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Chaque tirage intègre une puce NFC invisible programmée pour ouvrir instantanément votre vidéo sur smartphone.
            </p>

            {items.length > 0 && (
              <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-champagne/30 bg-cream/60 backdrop-blur-sm p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-luxury animate-in fade-in">
                <div className="text-center sm:text-left">
                  <p className="font-serif text-lg text-charcoal font-medium">
                    Vous avez {items.length} tirage{items.length > 1 ? "s" : ""} dans votre panier
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Finalisez votre commande ou choisissez un autre support pour en ajouter un.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setFunnelStage("cart")}
                    className="rounded-full bg-deep-brown px-5 py-2.5 text-xs uppercase tracking-wider font-semibold text-ivory hover:bg-charcoal transition-all shadow-xs"
                  >
                    Voir mon panier
                  </button>
                  <button
                    onClick={() => setFunnelStage("delivery")}
                    className="rounded-full border border-charcoal/80 px-4 py-2.5 text-xs uppercase tracking-wider font-semibold text-charcoal hover:bg-charcoal hover:text-ivory transition-all"
                  >
                    Commander
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Single product card */}
          <div className="mt-14 mx-auto max-w-2xl grid grid-cols-1 gap-8">
            {/* Card 1: Simple Enveloppe & Carte */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-luxury hover:border-champagne/60 hover:shadow-luxury-lg transition-all">
              <div>
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                  <img
                    src={envelopeImg}
                    alt="Mémora Simple (Enveloppe & Carte)"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-deep-brown/95 backdrop-blur-sm px-3.5 py-1 text-[10px] uppercase tracking-[0.2em] text-ivory font-semibold shadow-xs">
                    L'Essentiel
                  </span>
                </div>
                <h3 className="mt-5 font-serif text-2xl sm:text-3xl text-charcoal">Mémora Simple (Enveloppe & Carte)</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Tirage photo d'art avec puce NFC invisible, présenté dans son enveloppe d'art cachetée et accompagné d'une carte avec votre message personnalisé.
                </p>

                <div className="mt-4 rounded-xl bg-cream/50 p-4 text-xs text-charcoal border border-border/60">
                  <p className="font-semibold text-deep-brown mb-2 uppercase tracking-wider text-[10px]">
                    Contenu du pack :
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-champagne shrink-0" />
                      <span>1× Tirage photo d'art 10×15 cm avec puce NFC</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-champagne shrink-0" />
                      <span>1× Enveloppe d'art texturée élégante</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-champagne shrink-0" />
                      <span>1× Carte avec votre message simple personnalisé</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-serif text-charcoal font-normal">{formatTND(getUnitPrice("10x15", 1))}</span>
                  <span className="text-xs text-muted-foreground">/ pack (dès 20 DT en volume)</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => {
                    setSelectedFormat("10x15");
                    setSelectedWithFrame(false);
                    setFunnelStage("video");
                  }}
                  className="w-full rounded-full bg-deep-brown py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-xs min-h-[48px]"
                >
                  Choisir ce pack & Créer
                </button>
                <button
                  onClick={() => {
                    setSelectedFormat("10x15");
                    setIsPriceDrawerOpen(true);
                  }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-1.5 transition-colors"
                >
                  Voir les tarifs dégressifs
                </button>
              </div>
            </div>
          </div>
          {/* Flip card explanation section */}
          <div className="mt-28 rounded-3xl bg-cream/40 p-8 sm:p-14 border border-border/80 shadow-luxury">
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div>
                <p className="eyebrow tracking-[0.25em]">Et si le destinataire ne sait pas comment l'utiliser ?</p>
                <h2 className="mt-3 font-serif text-3xl sm:text-5xl text-charcoal">
                  Tout est imprimé au dos de chaque photo.
                </h2>
                <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
                  Quand votre proche reçoit son Mémora, il n'a besoin d'aucune explication de votre part. Les 3 étapes ultra-simples sont imprimées avec élégance au verso.
                </p>

                <div className="mt-8 space-y-3.5 text-sm text-charcoal">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-champagne shrink-0" />
                    <span>Fonctionne sur iPhone et Android</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-champagne shrink-0" />
                    <span>Aucune application à télécharger</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-champagne shrink-0" />
                    <span>Pas de QR code disgracieux au recto</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <FlipCardDemo />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 1: VIDEO SELECTION
         ======================================================== */}
      {funnelStage === "video" && (
        <section className="container-x mt-8 max-w-4xl">
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-luxury animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                  <Video className="h-4 w-4 text-champagne" />
                  <span>Étape 1 · Votre Vidéo</span>
                </div>
                <h2 className="mt-1 font-serif text-3xl sm:text-4xl text-charcoal">Ajoutez la vidéo de votre souvenir</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  8 premières minutes incluses (+1,50 DT / min supplémentaire, max 30 min).
                </p>
              </div>

              {/* EditEasy shortcut promo */}
              <button
                onClick={() => navigate({ to: "/editeasy" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-champagne/40 bg-sand/30 px-4 py-2 text-xs font-semibold text-deep-brown hover:bg-sand/60 transition-colors shrink-0 shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-champagne" />
                <span>Pas de montage ? Montage auto gratuit</span>
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border/70 bg-cream/45 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Votre tirage
                </p>
                <p className="mt-1 font-medium text-sm text-charcoal">
                  Mémora Simple · 10 × 15 cm · {selectedWithFrame ? "Avec cadre" : "Sans cadre"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Les 8 premières minutes de vidéo sont incluses.
                </p>
              </div>
              <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-border/60 pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                <span className="text-xs text-muted-foreground">Estimation · hors livraison</span>
                <strong className="font-serif text-2xl font-normal text-charcoal">
                  {formatTND(selectedItemEstimate)}
                </strong>
              </div>
            </div>

            {/* Video Input Options */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {/* Option A: From Computer / Local Gallery */}
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-champagne/50 bg-cream/25 p-8 text-center transition-all hover:bg-cream/60 hover:border-champagne shadow-xs">
                <Upload className="h-8 w-8 text-deep-brown/80" />
                <p className="mt-3 font-semibold text-sm text-charcoal">Depuis cet appareil</p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, MOV, WebM (jusqu'à 5 Go)</p>
                <input
                  type="file"
                  accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={handleVideoUpload}
                />
              </label>

              {/* Option B: Mobile Hand-Off QR Code */}
              <button
                type="button"
                onClick={() => setIsMobileUploadOpen(true)}
                className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-background p-8 text-center transition-all hover:bg-cream/40 hover:border-champagne/50 shadow-xs"
              >
                <Smartphone className="h-8 w-8 text-deep-brown/80" />
                <p className="mt-3 font-semibold text-sm text-charcoal">Scanner avec votre téléphone</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Flashez un QR code pour transférer depuis votre mobile
                </p>
              </button>

              {/* Option C: WhatsApp Direct Assistant */}
              <a
                href="https://wa.me/21698000000?text=Bonjour,%20je%20souhaite%20commander%20un%20tirage%20M%C3%A9mora%20et%20vous%20envoyer%20ma%20vid%C3%A9o%20et%20ma%20photo."
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-full flex items-center justify-between rounded-2xl border border-emerald-deep/20 bg-emerald-deep/[0.04] p-4 text-xs text-charcoal hover:bg-emerald-deep/[0.08] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xs">
                    <MessageCircle className="h-5 w-5 fill-current" />
                  </span>
                  <div>
                    <p className="font-semibold text-sm text-charcoal">Plus simple ? Commandez par WhatsApp</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Envoyez-nous directement votre photo et votre vidéo au +216 98 000 000 et on s'occupe de tout.
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline font-semibold text-deep-brown underline underline-offset-2 shrink-0">
                  Écrire sur WhatsApp →
                </span>
              </a>
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              La vidéo est préparée dans votre navigateur. Son envoi sécurisé commence à la validation de la commande.
            </p>

            {/* Video Player Preview */}
            {videoUrl ? (
              <div className="mt-8 rounded-2xl border border-border/80 bg-charcoal/5 p-6 shadow-luxury">
                <div className="flex flex-col gap-2 border-b border-border/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {videoStatus === "loading" && <RotateCw className="h-3 w-3 animate-spin text-deep-brown" />}
                      <span>
                        {isDemoVideo
                          ? "Vidéo de démonstration"
                          : videoStatus === "loading"
                            ? "Vérification de la vidéo"
                            : videoStatus === "ready"
                              ? "Vidéo prête"
                              : "Vidéo à vérifier"}
                      </span>
                    </div>
                    <p className="font-medium text-sm text-charcoal">{videoName}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-cream border border-border/60 px-3.5 py-1 text-xs font-semibold text-charcoal">
                      {videoStatus === "ready"
                        ? `Durée : ${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s`
                        : videoStatus === "loading"
                          ? "Lecture en cours de vérification…"
                          : "Lecture impossible"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 relative aspect-video max-h-[360px] mx-auto overflow-hidden rounded-xl bg-black shadow-lg">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                    onLoadedMetadata={(e) => {
                      const duration = e.currentTarget.duration;
                      if (!Number.isFinite(duration) || duration <= 0) {
                        setVideoStatus("error");
                        setVideoErrorMessage("La durée de cette vidéo n’a pas pu être vérifiée. Choisissez un autre fichier.");
                        return;
                      }

                      const roundedDuration = Math.ceil(duration);
                      setVideoDuration(roundedDuration);
                      if (roundedDuration > MAX_VIDEO_SECONDS) {
                        setVideoStatus("error");
                        setVideoErrorMessage("Cette vidéo dépasse la durée maximale de 30 minutes. Choisissez une vidéo plus courte.");
                        return;
                      }

                      setVideoErrorMessage(
                        isDemoVideo
                          ? "Cette vidéo d’exemple sert uniquement à la démonstration. Importez votre propre vidéo pour continuer."
                          : null,
                      );
                      setVideoStatus("ready");
                    }}
                    onError={() => {
                      setVideoStatus("error");
                      setVideoErrorMessage("Impossible de lire cette vidéo. Vérifiez le fichier ou choisissez une vidéo MP4, MOV ou WebM différente.");
                    }}
                  />
                </div>

                {videoStatus === "loading" && (
                  <p className="mt-3 text-xs text-muted-foreground" role="status">
                    Vérification de la lecture et de la durée de votre vidéo…
                  </p>
                )}
                {videoErrorMessage && (
                  <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-xs leading-relaxed text-destructive" role="alert">
                    {videoErrorMessage}
                  </p>
                )}

                {/* Surcharge breakdown if > 8 min */}
                <div className="mt-4 flex flex-col gap-2 rounded-xl bg-cream/70 border border-border/70 p-4 text-xs text-charcoal sm:flex-row sm:items-center sm:justify-between">
                  <span>8 premières minutes : <strong className="font-semibold text-charcoal">Incluses</strong></span>
                  {isDemoVideo ? (
                    <span className="font-medium text-muted-foreground">Exemple uniquement · non utilisable pour commander</span>
                  ) : videoStatus === "ready" && videoDuration > INCLUDED_VIDEO_SECONDS ? (
                    <span className="text-deep-brown font-semibold">
                      +{extraVideoMinutes} min supplémentaires = +{formatTND(videoSurchargeCurrent)}
                    </span>
                  ) : videoStatus === "ready" ? (
                    <span className="text-muted-foreground">Aucun supplément de durée</span>
                  ) : (
                    <span className="text-muted-foreground">Le coût sera confirmé après vérification.</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-cream/30 p-4 sm:p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-deep-brown">
                  <Video className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-charcoal">Aucune vidéo sélectionnée</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Choisissez une vidéo ci-dessus. Son aperçu et sa durée apparaîtront ici avant de continuer.
                  </p>
                  {videoErrorMessage && (
                    <p className="mt-2 text-xs text-destructive" role="alert">{videoErrorMessage}</p>
                  )}
                </div>
              </div>
            )}

            {/* Next step CTA */}
            <div className="mt-8 flex flex-col gap-3 border-t border-border/80 pt-6 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" role="status">
                {isDemoVideo
                  ? "Importez votre propre vidéo pour continuer."
                  : videoStatus === "ready"
                  ? "Votre vidéo est prête. Vous pourrez vérifier le recto à l’étape suivante."
                  : videoStatus === "loading"
                    ? "Patientez pendant la vérification de la vidéo."
                    : "Ajoutez une vidéo lisible pour continuer."}
              </p>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                En validant, votre vidéo est envoyée de façon sécurisée pour préparer votre commande. Elle est supprimée automatiquement si la commande n'est pas finalisée.
              </p>
              <button
                onClick={handleValidateVideo}
                disabled={!canContinueWithVideo}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-deep-brown px-8 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                <span>Valider la vidéo & Choisir la photo</span>
                <ArrowRight className="h-4 w-4 text-champagne" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 2: PHOTO SELECTION & CROP
         ======================================================== */}
      {funnelStage === "photo" && (
        <section className="container-x mt-8 max-w-4xl">
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-luxury animate-in fade-in">
            <div className="border-b border-border/80 pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                <ImageIcon className="h-4 w-4 text-champagne" />
                <span>Étape 2 · La Photo Imprimée</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl text-charcoal">Choisissez la photo au recto</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ce visuel sera imprimé en haute définition argentique sur votre tirage physique.
              </p>
            </div>

            {/* Photo Choice Tabs: Extract from Video (Live Scrubber) OR Upload file */}
            <div className="mt-8">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPhotoSelectionMode("extract")}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${photoSelectionMode === "extract"
                      ? "border-deep-brown bg-sand/20 shadow-luxury"
                      : "border-border/80 bg-background hover:bg-cream/40"
                    }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${photoSelectionMode === "extract" ? "bg-deep-brown text-ivory shadow-xs" : "bg-cream text-charcoal"
                    }`}>
                    <Film className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-charcoal">Extraire une image de la vidéo</p>
                      <span className="rounded-full bg-sand/60 px-2 py-0.5 text-[10px] font-semibold text-deep-brown">
                        Recommandé
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Choisissez le moment exact de votre vidéo originale pour en faire votre photo
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPhotoSelectionMode("upload")}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${photoSelectionMode === "upload"
                      ? "border-deep-brown bg-sand/20 shadow-luxury"
                      : "border-border/80 bg-background hover:bg-cream/40"
                    }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${photoSelectionMode === "upload" ? "bg-deep-brown text-ivory shadow-xs" : "bg-cream text-charcoal"
                    }`}>
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-charcoal">Importer depuis mes photos</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Utilisez une photo séparée déjà enregistrée dans votre appareil (JPG, PNG, HEIC)
                    </p>
                  </div>
                </button>
              </div>

              {/* Mode A: Real Video Frame Extractor Studio */}
              {photoSelectionMode === "extract" && (
                <div className="mt-6 rounded-2xl border border-champagne/40 bg-cream/25 p-5 sm:p-7 shadow-luxury animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-deep-brown">
                        Studio d'extraction vidéo
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vidéo source : <strong className="text-charcoal">{videoName}</strong>
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Curseur : <strong className="font-mono text-charcoal font-semibold">{formatTime(videoScrubTime)}</strong> / {formatTime(videoDuration)}
                    </div>
                  </div>

                  {/* Live Scrubber Video Screen */}
                  <div className="relative mt-4 aspect-video max-h-[320px] w-full overflow-hidden rounded-xl bg-black shadow-lg mx-auto flex items-center justify-center">
                    <video
                      ref={scrubVideoRef}
                      src={videoUrl}
                      playsInline
                      crossOrigin="anonymous"
                      muted
                      className="h-full w-full object-contain"
                      onLoadedMetadata={(e) => {
                        const d = Math.floor(e.currentTarget.duration);
                        if (d > 0) setVideoDuration(d);
                      }}
                      onTimeUpdate={(e) => {
                        if (isScrubPlaying) {
                          setVideoScrubTime(e.currentTarget.currentTime);
                        }
                      }}
                    />

                    {/* Timestamp overlay */}
                    <div className="absolute top-3 left-3 rounded-full bg-black/75 backdrop-blur-md px-3 py-1 text-xs font-mono text-ivory flex items-center gap-1.5 shadow">
                      <Film className="h-3.5 w-3.5 text-champagne" />
                      <span>{formatTime(videoScrubTime)} / {formatTime(videoDuration)}</span>
                    </div>

                    {capturedTimestamp !== null && (
                      <div className="absolute top-3 right-3 rounded-full bg-deep-brown/95 backdrop-blur-md px-3.5 py-1 text-[11px] text-ivory flex items-center gap-1.5 shadow">
                        <Check className="h-3.5 w-3.5 text-champagne" />
                        <span>Extrait à {formatTime(capturedTimestamp)}</span>
                      </div>
                    )}
                  </div>

                  {/* Scrubber slider track */}
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>00:00</span>
                      <span className="font-medium text-deep-brown">Déplacez le curseur pour explorer la vidéo image par image</span>
                      <span>{formatTime(videoDuration)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={videoDuration || 60}
                      step={0.1}
                      value={videoScrubTime}
                      onChange={(e) => handleScrubChange(Number(e.target.value))}
                      className="w-full accent-deep-brown cursor-pointer h-2 bg-sand/60 rounded-lg"
                    />

                    {/* Precision Buttons & Capture CTA */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-5)}
                          className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Reculer de 5 secondes"
                        >
                          -5s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-1)}
                          className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Reculer de 1 seconde"
                        >
                          -1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-0.1)}
                          className="rounded-lg border border-border/80 bg-background px-2 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Reculer d'une fraction de seconde"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={toggleScrubPlay}
                          className="rounded-lg border border-deep-brown/30 bg-sand/30 px-3.5 py-1.5 text-xs font-semibold text-deep-brown hover:bg-sand/60 transition-colors"
                        >
                          {isScrubPlaying ? "Pause" : "Lecture"}
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(0.1)}
                          className="rounded-lg border border-border/80 bg-background px-2 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Avancer d'une fraction de seconde"
                        >
                          +0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(1)}
                          className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Avancer de 1 seconde"
                        >
                          +1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(5)}
                          className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream/60 transition-colors"
                          title="Avancer de 5 secondes"
                        >
                          +5s
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCaptureFrame}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-deep-brown px-6 py-2.5 text-xs uppercase tracking-wider font-semibold text-ivory hover:bg-charcoal transition-all shadow-sm shrink-0 min-h-[40px]"
                      >
                        <Camera className="h-4 w-4 text-champagne" />
                        <span>Extraire cette image ({formatTime(videoScrubTime)})</span>
                      </button>
                    </div>

                    {photoSource === "frame" && capturedTimestamp !== null && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-sand/40 border border-sand/70 p-3 text-xs text-deep-brown font-medium">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-deep-brown" />
                        <span>Image extraite avec succès à <strong>{formatTime(capturedTimestamp)}</strong> depuis votre vidéo originale. Ce moment précis est configuré pour votre tirage ci-dessous.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mode B: Direct Image Upload */}
              {photoSelectionMode === "upload" && (
                <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-champagne/50 bg-cream/25 p-10 text-center transition-all hover:bg-cream/60 hover:border-champagne animate-in fade-in shadow-xs">
                  <Upload className="h-9 w-9 text-deep-brown/80" />
                  <p className="mt-3 text-sm font-semibold text-charcoal">Cliquez pour importer votre photo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Format JPG, PNG, WEBP jusqu'à 25 Mo</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handlePhotoUpload(e)}
                  />
                </label>
              )}
            </div>

            {/* Interactive Preview, Free Pan/Zoom, Rotate, and Templates Studio */}
            <div className="mt-8">
              <PhotoCustomizer
                rawPhotoUrl={photoUrl}
                format={selectedFormat}
                cardMessage={cardMessage}
                onComposedChange={(composedUrl, settings) => {
                  setComposedPhotoUrl(composedUrl);
                  setPhotoCropSettings(settings);
                  setPhotoZoom(settings.zoom);
                  setPhotoRotation(settings.rotation);
                }}
              />
            </div>

            {/* Step 2.5: Message on Card & Letter Customization */}
            <div className="mt-10 rounded-2xl border border-border/80 bg-cream/30 p-6 sm:p-8 space-y-6 shadow-luxury">
              <div className="border-b border-border/80 pb-4">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                  <Gift className="h-4 w-4 text-champagne" />
                  <span>
                    Personnalisation · Carte avec message
                  </span>
                </div>
                <h3 className="mt-1 font-serif text-2xl text-charcoal">Vos mots précieux</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Votre photo NFC est glissée dans son enveloppe d'art avec une carte portant votre message personnalisé.
                </p>
              </div>

              {/* Message on Card */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-charcoal flex justify-between">
                  <span>Message sur la carte *</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{cardMessage.length}/140 caractères</span>
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={cardMessage}
                  onChange={(e) => setCardMessage(e.target.value)}
                  placeholder="Ex: Pour toujours avec toi. Je t'aime..."
                  className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                />
              </div>

            </div>

            {/* Next step CTA */}
            <div className="mt-12 flex items-center justify-between border-t border-border/80 pt-6">
              <button
                onClick={() => setFunnelStage("video")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-charcoal transition-colors py-2"
              >
                Retour à la vidéo
              </button>
              <button
                onClick={() => setFunnelStage("preview")}
                className="inline-flex items-center gap-2 rounded-full bg-deep-brown px-8 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px]"
              >
                <span>Continuer vers l'Aperçu de mon MÉMORA</span>
                <ArrowRight className="h-4 w-4 text-champagne" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 3: INTERACTIVE SMARTPHONE DEMO & RECAP PREVIEW
         ======================================================== */}
      {funnelStage === "preview" && (
        <section className="container-x mt-8 max-w-5xl">
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-luxury animate-in fade-in">
            <div className="border-b border-border/80 pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                <Sparkles className="h-4 w-4 text-champagne" />
                <span>Étape 3 · Aperçu interactif de votre MÉMORA</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl text-charcoal">Aperçu de votre MÉMORA</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Voilà ce que vos proches verront : un simple contact du téléphone sur la photo, et votre vidéo s'ouvre.
              </p>
            </div>

            <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_1fr] items-start">
              {/* Smartphone Simulator */}
              <div>
                <TapDemo photoUrl={composedPhotoUrl || photoUrl} videoUrl={videoUrl} hideHeader={true} />
              </div>

              {/* Summary card */}
              <div className="space-y-6 rounded-2xl border border-border/80 bg-cream/35 p-6 sm:p-8 shadow-luxury">
                <div>
                  <p className="eyebrow tracking-[0.25em] text-deep-brown font-semibold">Votre Création Personnalisée</p>
                  <h3 className="font-serif text-2xl text-charcoal mt-1">
                    Mémora Simple (Enveloppe & Carte)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Photo NFC sous enveloppe d'art avec carte message
                  </p>
                </div>

                {/* Photo chosen */}
                <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                  <img
                    src={composedPhotoUrl || photoUrl}
                    alt="Photo sélectionnée"
                    className="h-16 w-14 rounded-md object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-charcoal">Photo au recto</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {photoSource === "frame"
                        ? `Extraite de la vidéo originale (${formatTime(capturedTimestamp ?? videoScrubTime)})`
                        : photoName}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-sand/50 px-2 py-0.5 text-[10px] font-medium text-deep-brown">
                      Tirage argentique HD
                    </span>
                  </div>
                </div>

                {/* Video linked */}
                <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-deep-brown text-ivory shadow-xs">
                    <Video className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-charcoal">Vidéo liée à la puce NFC</p>
                    <p className="text-[11px] text-muted-foreground truncate">{videoName}</p>
                    <p className="text-[11px] text-deep-brown font-medium mt-0.5">
                      Durée : {Math.floor(videoDuration / 60)}m {videoDuration % 60}s · Lecture sans application
                    </p>
                  </div>
                </div>

                {/* Card message */}
                <div className="rounded-xl border border-sand/70 bg-[#FAF8F5] p-4 shadow-xs">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Message sur la carte
                  </p>
                  <p className="mt-1 font-serif text-sm italic text-charcoal">
                    « {cardMessage || "Pour toujours, je t'aime."} »
                  </p>
                </div>

                {/* Reassurance points */}
                <div className="space-y-2 border-t border-border/80 pt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-champagne shrink-0" />
                    <span>Puce NFC invisible NTAG213 garantie à vie</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-champagne shrink-0" />
                    <span>Fonctionne sur iPhone et Android sans aucune application</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-champagne shrink-0" />
                    <span>Notice explicative imprimée avec élégance au verso</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Next step CTA */}
            <div className="mt-12 flex items-center justify-between border-t border-border/80 pt-6">
              <button
                onClick={() => setFunnelStage("photo")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-charcoal transition-colors py-2"
              >
                ← Modifier la photo ou le message
              </button>
              <button
                onClick={handleValidatePhotoAndAddToCart}
                className="inline-flex items-center gap-2 rounded-full bg-deep-brown px-8 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px]"
              >
                <span>Valider & Ajouter au Panier</span>
                <ArrowRight className="h-4 w-4 text-champagne" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 4: CART & OPTIONS
         ======================================================== */}
      {funnelStage === "cart" && (
        <section className="container-x mt-8 max-w-5xl">
          <div className="border-b border-border/80 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="eyebrow tracking-[0.25em] text-deep-brown font-semibold">Votre Commande MÉMORA</p>
              <h1 className="font-serif text-4xl sm:text-5xl text-charcoal">Mon Panier</h1>
            </div>
            <button
              onClick={() => {
                setSelectedFormat("10x15");
                setFunnelStage("video");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-cream px-4 py-2 text-xs uppercase tracking-wider font-semibold text-charcoal hover:bg-sand transition-all shrink-0 shadow-xs"
            >
              <Plus className="h-4 w-4 text-deep-brown" />
              <span>Créer une autre photo Mémora</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="py-20 text-center rounded-3xl border border-border/80 bg-card p-10 shadow-luxury mt-8">
              <p className="font-serif text-2xl text-charcoal">Votre panier est encore vide.</p>
              <p className="text-sm text-muted-foreground mt-2">Choisissez votre support pour débuter votre premier souvenir.</p>
              <button
                onClick={() => setFunnelStage("picker")}
                className="mt-6 inline-block rounded-full bg-deep-brown px-8 py-3.5 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-md"
              >
                Choisir un format
              </button>
            </div>
          ) : (
            <div className="mt-10 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
              {/* Items List */}
              <div className="space-y-6">
                {items.map((item, idx) => {
                  const unitPrice = getUnitPrice(item.format, quote.totalQuantity);
                  const itemDurationSurcharge = getVideoSurcharge(item.videoDurationSec, item.qty);

                  return (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-border/80 bg-card p-6 shadow-luxury transition-all hover:border-champagne/60"
                    >
                      <div className="flex gap-5">
                        <img
                          src={item.photoPreviewUrl || hero}
                          alt="Aperçu tirage"
                          className="h-28 w-24 rounded-lg object-cover border border-border/80 shrink-0 shadow-xs"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-serif text-2xl text-charcoal">
                                Mémora Simple (Enveloppe & Carte)
                              </h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Vidéo liée : {item.videoName || "video_souvenir.mp4"} ({Math.floor(item.videoDurationSec / 60)}m)
                              </p>
                              {item.cardMessage && (
                                <p className="mt-1 text-xs text-muted-foreground italic">
                                  Message carte : « {item.cardMessage} »
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-serif text-xl font-normal text-charcoal">{formatTND(unitPrice * item.qty)}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatTND(unitPrice)} /u
                              </p>
                            </div>
                          </div>

                          {/* Quantity and Actions */}
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">Quantité :</span>
                              <div className="flex items-center rounded-full border border-border/80 bg-cream/40 px-1 py-0.5 shadow-xs">
                                <button
                                  onClick={() => cart.setQty(item.key, item.qty - 1)}
                                  className="p-1.5 rounded-full hover:bg-cream transition-colors text-charcoal"
                                  aria-label="Diminuer quantité"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="px-3 font-semibold text-charcoal">{item.qty}</span>
                                <button
                                  onClick={() => cart.setQty(item.key, item.qty + 1)}
                                  className="p-1.5 rounded-full hover:bg-cream transition-colors text-charcoal"
                                  aria-label="Augmenter quantité"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Duplication Tools */}
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => handleDuplicate(item.key, "same_photo_new_video")}
                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-deep-brown transition-colors"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>Même photo, autre vidéo</span>
                              </button>
                              <button
                                onClick={() => {
                                  cancelBackgroundUpload(draftId, item.key);
                                  cart.remove(item.key);
                                }}
                                className="text-muted-foreground hover:text-destructive underline transition-colors"
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Promo Code & Gift Card Inputs */}
                <div className="rounded-2xl border border-border/80 bg-cream/30 p-6 space-y-4 shadow-xs">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Code promo (ex: MEMORA10)"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="flex-1 rounded-xl border border-border/80 bg-background px-4 py-2.5 text-xs uppercase outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30"
                    />
                    <button
                      onClick={() => {
                        const res = cart.applyPromoCode(promoInput);
                        if (res.success) toast.success(res.message);
                        else toast.error(res.message);
                      }}
                      className="rounded-xl bg-charcoal px-5 py-2.5 text-xs text-ivory font-medium hover:bg-deep-brown transition-colors"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Summary Sidebar */}
              <div className="h-fit rounded-2xl border border-border/80 bg-cream/40 p-6 sm:p-8 shadow-luxury sticky top-28">
                <h3 className="font-serif text-2xl text-charcoal border-b border-border/80 pb-4">Récapitulatif</h3>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tirages photos ({quote.totalQuantity} ex.)</span>
                    <span className="font-medium text-charcoal">{formatTND(quote.itemsSubtotal)}</span>
                  </div>

                  {quote.framesSubtotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Options cadres bois</span>
                      <span className="font-medium text-charcoal">+{formatTND(quote.framesSubtotal)}</span>
                    </div>
                  )}

                  {quote.videoSurcharges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Supplément vidéo (&gt;8 min)</span>
                      <span className="font-medium text-charcoal">+{formatTND(quote.videoSurcharges)}</span>
                    </div>
                  )}

                  {quote.discount > 0 && (
                    <div className="flex justify-between text-deep-brown font-medium">
                      <span>Réduction code promo</span>
                      <span>-{formatTND(quote.discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-border/80 pt-3">
                    <span className="text-muted-foreground">Livraison estimée</span>
                    <span>
                      {quote.isFreeShipping ? (
                        <strong className="text-deep-brown font-semibold">Offerte</strong>
                      ) : (
                        <span className="font-medium text-charcoal">{formatTND(quote.shippingCost)}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-border/80 pt-4 text-xl font-serif font-normal text-charcoal">
                    <span>Total TTC</span>
                    <span className="font-semibold">{formatTND(quote.total)}</span>
                  </div>
                </div>

                {/* Free shipping threshold progress */}
                {!quote.isFreeShipping && (
                  <div className="mt-5 rounded-xl bg-champagne/15 border border-champagne/30 p-3.5 text-xs text-charcoal">
                    Plus que {formatTND(FREE_SHIPPING_THRESHOLD_TND - quote.total)} pour profiter de la <strong>livraison offerte</strong> !
                  </div>
                )}

                <button
                  onClick={() => setFunnelStage("delivery")}
                  className="mt-8 w-full rounded-full bg-deep-brown py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px]"
                >
                  Passer à la livraison
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================
          STEP 5: DELIVERY & ADDRESS
         ======================================================== */}
      {funnelStage === "delivery" && (
        <section className="container-x mt-8 max-w-3xl">
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-luxury animate-in fade-in">
            <div className="border-b border-border/80 pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                <Truck className="h-4 w-4 text-champagne" />
                <span>Étape 5 · Coordonnées & Livraison</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl text-charcoal">Où devons-nous expédier vos Mémora ?</h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFunnelStage("payment");
              }}
              className="mt-8 space-y-6"
            >
              {/* Customer Names */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Prénom *
                  </label>
                  <input
                    required
                    type="text"
                    value={customer.firstName}
                    onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Nom *
                  </label>
                  <input
                    required
                    type="text"
                    value={customer.lastName}
                    onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Email pour le suivi *
                  </label>
                  <input
                    required
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Téléphone (pour le livreur) *
                  </label>
                  <input
                    required
                    type="tel"
                    placeholder="Ex: 20 123 456 ou 98 123 456"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Adresse de livraison *
                </label>
                <input
                  required
                  type="text"
                  value={shipping.address}
                  onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                  placeholder="Rue, quartier, résidence, n° d'appartement..."
                  className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                />
              </div>

              {/* City, Postal, Country */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Code postal
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 1001, 4000..."
                    value={shipping.postalCode}
                    onChange={(e) => setShipping({ ...shipping, postalCode: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Gouvernorat / Ville *
                  </label>
                  <input
                    required
                    type="text"
                    list="tunisian-cities"
                    placeholder="Choisir ou saisir la ville..."
                    value={shipping.city}
                    onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  />
                  <datalist id="tunisian-cities">
                    {TUNISIAN_GOVERNORATES.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Pays *
                  </label>
                  <select
                    value={shipping.country}
                    onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                  >
                    <option value="TN">Tunisie</option>
                  </select>
                </div>
              </div>

              {/* Carrier Selection */}
              <div className="pt-4 border-t border-border/80">
                <p className="text-xs font-semibold uppercase tracking-wider text-charcoal mb-3">
                  Mode de livraison
                </p>
                <div className="space-y-3">
                  {getShippingOptions(shipping.country, quote.total).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${shipping.carrier === opt.id
                          ? "border-deep-brown bg-sand/20 shadow-xs ring-1 ring-deep-brown/10"
                          : "border-border/80 hover:bg-cream/40"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="carrier"
                          checked={shipping.carrier === opt.id}
                          onChange={() => setShipping({ ...shipping, carrier: opt.id })}
                          className="accent-deep-brown"
                        />
                        <div>
                          <p className="font-semibold text-sm text-charcoal">{opt.name}</p>
                          <p className="text-xs text-muted-foreground">{opt.description} · Délai {opt.etaDays}</p>
                        </div>
                      </div>
                      <span className="font-serif text-base font-bold text-charcoal">
                        {opt.priceTND === 0 ? "Gratuit" : formatTND(opt.priceTND)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit to Payment */}
              <div className="mt-8 flex items-center justify-between border-t border-border/80 pt-6">
                <button
                  type="button"
                  onClick={() => setFunnelStage("cart")}
                  className="text-xs uppercase tracking-widest text-muted-foreground hover:text-charcoal transition-colors py-2"
                >
                  Retour au panier
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-deep-brown px-8 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px]"
                >
                  <span>Valider la commande ({formatTND(quote.total)})</span>
                  <ArrowRight className="h-4 w-4 text-champagne" />
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 6: VALIDATION & PAIEMENT À LA LIVRAISON
         ======================================================== */}
      {funnelStage === "payment" && (
        <section className="container-x mt-8 max-w-3xl">
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-luxury animate-in fade-in">
            <div className="border-b border-border/80 pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-semibold">
                <Banknote className="h-4 w-4 text-champagne" />
                <span>Étape 6 · Validation de votre commande</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl text-charcoal">Paiement à la livraison</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Réglez en toute sérénité en espèces auprès du livreur à la réception de votre colis.
              </p>
            </div>

            {/* Exclusive Payment Method: Cash On Delivery */}
            <div className="mt-8 rounded-2xl border-2 border-deep-brown bg-sand/15 p-6 sm:p-8 shadow-luxury">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-deep-brown text-ivory shadow-xs">
                  <Banknote className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-base text-charcoal">Paiement en espèces à la livraison (COD)</h3>
                    <span className="rounded-full bg-sand/80 px-2.5 py-0.5 text-[11px] font-semibold text-deep-brown">
                      100% Sécurisé · Zéro carte requise
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Votre commande est mise en fabrication dès validation. Vous ne payez rien sur le site : vous remettez simplement la somme de <strong className="text-charcoal font-semibold text-sm">{formatTND(quote.total)}</strong> en espèces au livreur lors de la remise en main propre de votre colis.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3 border-t border-deep-brown/15 pt-4 text-xs text-charcoal">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-champagne shrink-0" />
                      <span>Aucune carte bancaire requise</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-champagne shrink-0" />
                      <span>Livraison suivie par transporteur</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-champagne shrink-0" />
                      <span>Paiement après réception</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Recap Card */}
            <div className="mt-6 rounded-xl border border-border/80 bg-cream/40 p-4 text-xs text-charcoal flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <p className="font-semibold text-deep-brown uppercase tracking-wider text-[10px]">
                  Adresse de livraison enregistrée :
                </p>
                <p className="mt-0.5 text-xs text-charcoal font-medium">
                  {customer.firstName} {customer.lastName} · {shipping.address}, {shipping.postalCode} {shipping.city}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Tél : {customer.phone || "Non renseigné"}</p>
              </div>
              <button
                type="button"
                onClick={() => setFunnelStage("delivery")}
                className="text-deep-brown hover:underline text-[11px] font-semibold self-start sm:self-auto shrink-0"
              >
                Modifier l'adresse
              </button>
            </div>

            {/* Legal consent check */}
            <div className="mt-8 border-t border-border/80 pt-6">
              <label className="flex items-start gap-3 text-xs text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={legalConsent}
                  onChange={(e) => setLegalConsent(e.target.checked)}
                  className="mt-0.5 accent-deep-brown h-4 w-4"
                />
                <span>
                  J'accepte expressément les <strong>Conditions Générales de Vente</strong> et m'engage à régler la somme de <strong>{formatTND(quote.total)}</strong> en espèces au livreur à la réception de mon colis.
                </span>
              </label>
            </div>

            {/* Progression des envois en arrière-plan */}
            {!isSubmitting && isUploadingMedia && (
              <div className="mt-6 rounded-2xl border border-champagne/40 bg-cream/60 p-5 shadow-luxury">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-deep-brown">
                  <span>Envoi de vos fichiers en cours…</span>
                  <span>{uploadPercent} %</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Progression de l'envoi de vos fichiers"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadPercent}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream"
                >
                  <div
                    className="h-full rounded-full bg-deep-brown transition-[width] duration-300"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-charcoal">
                  {uploadReadyCount}/{mediaUploads.length} fichiers prêts. Vous pouvez déjà confirmer votre commande.
                </p>
              </div>
            )}

            {!isSubmitting && !isUploadingMedia && hasUploadError && checkoutStep !== "error" && (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-xs text-charcoal">
                Un fichier n'a pas pu être envoyé. Vérifiez votre connexion : il sera renvoyé lorsque vous confirmerez votre commande.
              </div>
            )}

            {/* Status Feedback and Progress Indicator */}
            {isSubmitting && (
              <div className="mt-6 rounded-2xl border border-champagne/40 bg-cream/60 p-5 shadow-luxury animate-in fade-in">
                <div className="flex items-center gap-3">
                  <RotateCw className="h-5 w-5 text-deep-brown animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-deep-brown">
                      {checkoutStep === "preparing" && "1/3 · Préparation des fichiers"}
                      {checkoutStep === "uploading_media" && `2/3 · Envoi de vos fichiers · ${uploadPercent} %`}
                      {checkoutStep === "finalizing" && "3/3 · Enregistrement de la commande"}
                    </p>
                    <p className="mt-0.5 text-xs text-charcoal">{checkoutMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error & Retry Banner */}
            {checkoutStep === "error" && checkoutError && !isSubmitting && (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 shadow-xs animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-destructive/20 p-1 text-destructive shrink-0 mt-0.5">
                    <RotateCw className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                      Échec de la validation de la commande
                    </p>
                    <p className="mt-1 text-xs text-charcoal leading-relaxed">{checkoutError}</p>
                    <button
                      type="button"
                      onClick={handleConfirmOrder}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-destructive px-5 py-2 text-xs font-semibold uppercase tracking-wider text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-xs"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Réessayer l'envoi et la commande</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm Order CTA */}
            <div className="mt-8 flex items-center justify-between border-t border-border/80 pt-6">
              <button
                type="button"
                onClick={() => setFunnelStage("delivery")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-charcoal transition-colors py-2"
              >
                Retour
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-deep-brown px-8 sm:px-10 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury disabled:opacity-60 disabled:cursor-wait min-h-[48px]"
              >
                {isSubmitting ? (
                  <RotateCw className="h-4 w-4 text-champagne animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-champagne" />
                )}
                <span>
                  {isSubmitting
                    ? checkoutMessage || "Traitement en cours…"
                    : checkoutStep === "error"
                      ? `Réessayer (${formatTND(quote.total)})`
                      : `Confirmer ma commande (${formatTND(quote.total)})`}
                </span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          STEP 6: CONFIRMATION & ORDER SUCCESS
         ======================================================== */}
      {funnelStage === "confirmation" && (
        <section className="container-x mt-10 max-w-2xl text-center">
          <div className="rounded-3xl border border-border/80 bg-card p-8 sm:p-14 shadow-luxury-lg animate-in zoom-in-95">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-champagne/20 text-deep-brown shadow-xs">
              <CheckCircle2 className="h-8 w-8 text-deep-brown" />
            </div>

            <p className="eyebrow mt-6 tracking-[0.25em] text-deep-brown font-semibold">Commande validée</p>
            <h1 className="mt-2 font-serif text-4xl sm:text-5xl text-charcoal">Merci pour votre confiance !</h1>
            <p className="mt-3 text-sm font-semibold text-deep-brown font-mono bg-cream inline-block px-4 py-1.5 rounded-full border border-border/80 shadow-xs">
              Numéro de commande : {orderNumber}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Un email de confirmation récapitulatif a été envoyé à <strong>{customer.email || "votre adresse email"}</strong>.
            </p>

            {/* COD Reminder Badge */}
            <div className="mt-6 rounded-2xl border border-sand/80 bg-sand/20 p-5 text-xs text-charcoal shadow-xs">
              <p className="font-semibold text-deep-brown flex items-center justify-center gap-1.5 text-sm">
                <Banknote className="h-4.5 w-4.5 text-deep-brown" />
                <span>Règlement : En espèces à la livraison</span>
              </p>
              <p className="mt-1 text-muted-foreground">
                Montant exact à remettre au livreur lors de la réception : <strong className="text-charcoal font-semibold text-sm">{formatTND(quote.total)}</strong>
              </p>
            </div>

            {/* Fulfilment Timeline Stepper as specified in section 11 of plan.md */}
            <div className="mt-10 rounded-2xl border border-border/80 bg-cream/40 p-6 text-left shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Cycle de fabrication & livraison
              </p>
              <div className="space-y-3.5 text-xs text-charcoal">
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold shadow-xs">1</span>
                  <span><strong>Tirage d'art en cours :</strong> Impression argentique haute résolution.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold shadow-xs">2</span>
                  <span><strong>Programmation NFC :</strong> Intégration et verrouillage de votre puce unique.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold shadow-xs">3</span>
                  <span><strong>Contrôle qualité :</strong> Test de scan avant emballage soigné.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-champagne text-[10px] text-charcoal font-bold shadow-xs">4</span>
                  <span><strong>Expédition suivie :</strong> Réception sous 3 à 5 jours ouvrés.</span>
                </div>
              </div>
            </div>

            {/* Post-purchase feedback widget */}
            <div className="mt-8 rounded-2xl border border-border/80 p-5 text-left bg-background shadow-xs">
              <p className="text-xs font-medium text-charcoal">
                Votre avis nous est précieux : qu'est-ce qui a failli vous empêcher de commander aujourd'hui ?
              </p>
              <input
                type="text"
                placeholder="Un détail sur les prix, la livraison, le fonctionnement..."
                className="mt-2 w-full rounded-xl border border-border/80 bg-transparent p-3 text-xs outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30"
              />
              <button
                type="button"
                onClick={() => toast.success("Merci pour votre retour !")}
                className="mt-3 rounded-full bg-cream px-4 py-1.5 text-[11px] font-semibold text-charcoal hover:bg-sand transition-colors"
              >
                Envoyer mon avis
              </button>
            </div>

            <div className="mt-10">
              <button
                onClick={() => {
                  cart.clear();
                  navigate({ to: "/" });
                }}
                className="rounded-full bg-deep-brown px-8 py-4 text-xs uppercase tracking-widest font-semibold text-ivory hover:bg-charcoal transition-all shadow-luxury min-h-[48px]"
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Price Drawer Modal */}
      <PriceDrawer
        isOpen={isPriceDrawerOpen}
        onClose={() => setIsPriceDrawerOpen(false)}
      />

      {/* Mobile Upload Hand-off QR Modal */}
      <MobileUploadModal
        isOpen={isMobileUploadOpen}
        onClose={() => setIsMobileUploadOpen(false)}
        onVideoReceived={(data) => {
          setVideoUrl(data.url);
          setVideoName(data.name);
          setVideoDuration(data.durationSec);
          setIsDemoVideo(Boolean(data.isDemo));
          setVideoStatus("loading");
          setVideoErrorMessage(
            data.isDemo
              ? "Cette vidéo d’exemple sert uniquement à la démonstration. Importez votre propre vidéo pour continuer."
              : null,
          );
        }}
      />
    </div>
  );
}
