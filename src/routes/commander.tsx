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
import { uploadMediaWithR2Intent } from "@/lib/r2-upload-client";
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
  getShippingOptions,
  formatTND,
  FREE_SHIPPING_THRESHOLD_TND,
  INCLUDED_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
} from "@/lib/pricing";
import { PRODUCTS, Product } from "@/lib/products";
import { PriceDrawer } from "@/components/site/PriceDrawer";
import { MobileUploadModal } from "@/components/site/MobileUploadModal";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { TapDemo } from "@/components/site/TapDemo";
import envelopeImg from "@/assets/product-envelope.jpg";
import boxLetterImg from "@/assets/product-box-letter.jpg";
import hero from "@/assets/hero.jpg";
import moments from "@/assets/product-moments.jpg";
import scan from "@/assets/scan.jpg";
import box from "@/assets/product-box.jpg";

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
  const [selectedFormat, setSelectedFormat] = useState<Format>(search.format ?? "10x15");
  const [selectedWithFrame, setSelectedWithFrame] = useState(search.withFrame ?? false);

  // Modals
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(false);

  // Step 1: Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>(
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  );
  const [videoName, setVideoName] = useState<string>("video_souvenir.mp4");
  const [videoDuration, setVideoDuration] = useState<number>(120); // 2 min default
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
  const [letterContent, setLetterContent] = useState<string>("");

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
  const [uploadPct, setUploadPct] = useState(0);

  // États détaillés du cycle d'upload et de commande R2
  type CheckoutStep =
    | "idle"
    | "preparing"
    | "uploading_photo"
    | "uploading_video"
    | "verifying"
    | "finalizing"
    | "confirmed"
    | "error";

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("idle");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutProgressIndex, setCheckoutProgressIndex] = useState(0);

  // Video duration surcharge calculation
  const extraVideoMinutes =
    videoDuration > INCLUDED_VIDEO_SECONDS
      ? Math.ceil((videoDuration - INCLUDED_VIDEO_SECONDS) / 60)
      : 0;
  const videoSurchargeCurrent = getVideoSurcharge(videoDuration, 1);

  // Overall quote calculation
  const quote = cart.getQuote(shipping.country, shipping.carrier);

  // Handle Video file upload
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["mp4", "mov", "webm"].includes(ext)) {
      toast.error("Format vidéo non supporté (MP4, MOV, WEBM requis)");
      return;
    }
    if (!file.type.startsWith("video/") && file.type !== "application/octet-stream") {
      toast.error("Type MIME vidéo invalide");
      return;
    }
    if (file.size > 5 * 1024 * 1024 * 1024) {
      toast.error("Le fichier dépasse la taille maximale autorisée (5 Go)");
      return;
    }
    if (file.size <= 0) {
      toast.error("Fichier vidéo vide");
      return;
    }

    try {
      const cacheKey = getMediaCacheKey(draftId, currentItemKey, "video");
      await putCachedMedia(cacheKey, file);

      if (videoUrl && videoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(videoUrl);
      }
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setVideoName(file.name);
      setVideoScrubTime(0);
      setCapturedTimestamp(null);
      toast.success("Vidéo chargée et mise en cache avec succès !");
    } catch {
      toast.error("Erreur d'enregistrement local de la vidéo");
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
  const handleCaptureFrame = () => {
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

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

      setPhotoUrl(dataUrl);
      setPhotoSource("frame");
      const currentSec = Math.floor(video.currentTime || videoScrubTime);
      setCapturedTimestamp(currentSec);
      const fileName = `capture_video_${currentSec}s.jpg`;
      setPhotoName(fileName);

      canvas.toBlob(async (blob) => {
        if (blob) {
          const photoFileObj = new File([blob], fileName, { type: "image/jpeg" });
          setPhotoFile(photoFileObj);
          try {
            const cacheKey = getMediaCacheKey(draftId, currentItemKey, "photo");
            await putCachedMedia(cacheKey, photoFileObj);
          } catch {
            // Fallback mémoire interne
          }
        }
      }, "image/jpeg", 0.95);

      toast.success(`Moment exact extrait à ${formatTime(currentSec)} !`);
    } catch (err) {
      console.warn("Échec d'extraction canvas (restriction CORS sur vidéo distante) :", err);
      setPhotoUrl(scan);
      setPhotoSource("frame");
      setCapturedTimestamp(Math.floor(videoScrubTime));
      setPhotoName(`capture_video_${Math.floor(videoScrubTime)}s.jpg`);
      toast.success(`Image extraite à ${formatTime(videoScrubTime)} !`);
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
    cart.add(selectedFormat === "box" ? "p2" : "p1", {
      key: currentItemKey,
      format: selectedFormat === "box" ? "box" : "10x15",
      withFrame: selectedWithFrame,
      videoDurationSec: videoDuration,
      photoPreviewUrl: finalPhoto.startsWith("blob:") ? undefined : finalPhoto,
      videoPreviewUrl: videoUrl.startsWith("blob:") ? undefined : videoUrl,
      videoName: videoName,
      photoName: photoName,
      cardMessage,
      letterContent,
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
    const newOrderNum = `MEM-${Math.floor(100000 + Math.random() * 900000)}`;
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
        setCheckoutProgressIndex(i + 1);

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

      // Steps B, C, D — Upload direct vers R2 & Vérification backend pour chaque fichier
      const intentMappings: Array<{
        item_id: string;
        intent_id: string;
        file_kind: "photo" | "video";
      }> = [];

      for (const [i, media] of preparedMedia.entries()) {
        const { item, photoFile, videoFile } = media;
        setCheckoutProgressIndex(i + 1);

        // Upload Photo
        setCheckoutStep("uploading_photo");
        setCheckoutMessage(`Envoi direct de la photo (${i + 1}/${items.length}) vers Cloudflare R2...`);
        const photoIntentId = await uploadMediaWithR2Intent({
          draftId,
          draftToken,
          itemId: item.key,
          fileKind: "photo",
          file: photoFile,
        });
        intentMappings.push({
          item_id: item.key,
          intent_id: photoIntentId,
          file_kind: "photo",
        });

        // Upload Video
        setCheckoutStep("uploading_video");
        setCheckoutMessage(`Envoi direct de la vidéo (${i + 1}/${items.length}) vers Cloudflare R2...`);
        const videoIntentId = await uploadMediaWithR2Intent({
          draftId,
          draftToken,
          itemId: item.key,
          fileKind: "video",
          file: videoFile,
        });
        intentMappings.push({
          item_id: item.key,
          intent_id: videoIntentId,
          file_kind: "video",
        });
      }

      // Step E — Finalisation atomique & idempotente de la commande
      setCheckoutStep("finalizing");
      setCheckoutMessage("Finalisation et enregistrement de votre commande...");

      const idempotencyKey = `idem_${draftId}_${newOrderNum}`;
      const normalizedItems = items.map((it) => ({
        id: it.key,
        productId: it.productId,
        format: it.format,
        withFrame: it.withFrame ?? false,
        videoDurationSec: it.videoDurationSec,
        cardMessage: it.cardMessage,
        letterContent: it.letterContent,
        personalization: it.personalization,
        qty: it.qty,
      }));

      const finalizeResult = await finalizeOrderWithIntents({
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

      if (!finalizeResult.success) {
        throw new Error(finalizeResult.error || "Échec de finalisation de la commande");
      }

      // Cleanup policy : suppression des fichiers locaux UNIQUEMENT après succès
      await clearDraftMedia(draftId);
      cart.clear();

      setCheckoutStep("confirmed");
      setFunnelStage("confirmation");
      toast.success(`Commande #${newOrderNum} confirmée avec succès !`);
    } catch (err: any) {
      console.error("Erreur commande R2 / Finalisation:", err);
      const msg = err?.message || "Une erreur est survenue lors de l'enregistrement de votre commande.";
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
          <div className="flex items-center justify-between border-b border-border pb-4 text-xs font-medium">
            <button
              onClick={() => {
                if (funnelStage === "video") setFunnelStage("picker");
                else if (funnelStage === "photo") setFunnelStage("video");
                else if (funnelStage === "preview") setFunnelStage("photo");
                else if (funnelStage === "cart") setFunnelStage("preview");
                else if (funnelStage === "delivery") setFunnelStage("cart");
                else if (funnelStage === "payment") setFunnelStage("delivery");
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Retour</span>
            </button>

            <div className="flex items-center gap-2 sm:gap-6">
              {[
                { id: "video", label: "1. Vidéo", num: 1 },
                { id: "photo", label: "2. Photo", num: 2 },
                { id: "preview", label: "3. Aperçu", num: 3 },
                { id: "cart", label: "4. Panier", num: 4 },
                { id: "delivery", label: "5. Livraison", num: 5 },
                { id: "payment", label: "6. Validation", num: 6 },
              ].map((step) => {
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
                    className={`flex items-center gap-1.5 ${
                      isActive
                        ? "text-deep-brown font-semibold"
                        : isPassed
                        ? "text-charcoal"
                        : "text-muted-foreground opacity-50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                        isActive
                          ? "bg-deep-brown text-ivory"
                          : isPassed
                          ? "bg-sand text-charcoal"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      {step.num}
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
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
            <p className="eyebrow">La boutique MÉMORA</p>
            <h1 className="mt-3 font-serif text-4xl sm:text-6xl">Choisissez votre support</h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Chaque tirage intègre une puce NFC invisible programmée pour ouvrir instantanément votre vidéo sur smartphone.
            </p>

            {items.length > 0 && (
              <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-deep-brown/30 bg-cream/70 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in">
                <div className="text-center sm:text-left">
                  <p className="font-serif text-lg text-charcoal font-medium">
                    Vous avez {items.length} tirage{items.length > 1 ? "s" : ""} dans votre panier
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Finalisez votre commande ou choisissez un autre support pour en ajouter un.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setFunnelStage("cart")}
                    className="rounded-sm bg-primary px-5 py-2.5 text-xs uppercase tracking-wider font-semibold text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                  >
                    Voir mon panier
                  </button>
                  <button
                    onClick={() => setFunnelStage("delivery")}
                    className="rounded-sm border border-foreground px-4 py-2.5 text-xs uppercase tracking-wider font-semibold text-charcoal hover:bg-foreground hover:text-background transition-colors"
                  >
                    Commander
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Product Cards Grid - 2 Products */}
          <div className="mt-14 mx-auto max-w-4xl grid gap-8 sm:grid-cols-2">
            {/* Card 1: Simple Enveloppe & Carte */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-background p-6 sm:p-8 shadow-xs hover:border-deep-brown hover:shadow-lg transition-all">
              <div>
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                  <img
                    src={envelopeImg}
                    alt="Mémora Simple (Enveloppe & Carte)"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-deep-brown px-3 py-1 text-[11px] uppercase tracking-wider text-ivory font-medium">
                    L'Essentiel
                  </span>
                </div>
                <h3 className="mt-5 font-serif text-2xl sm:text-3xl">Mémora Simple (Enveloppe & Carte)</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Tirage photo d'art avec puce NFC invisible, présenté dans son enveloppe d'art cachetée et accompagné d'une carte avec votre message personnalisé.
                </p>

                <div className="mt-4 rounded-xl bg-cream/50 p-3.5 text-xs text-charcoal border border-border/60">
                  <p className="font-semibold text-deep-brown mb-1.5 uppercase tracking-wider text-[10px]">
                    Contenu du pack :
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Tirage photo d'art 10×15 cm avec puce NFC</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Enveloppe d'art texturée élégante</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Carte avec votre message simple personnalisé</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-serif text-charcoal">{formatTND(49)}</span>
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
                  className="w-full rounded-sm bg-primary py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                >
                  Choisir ce pack & Créer
                </button>
                <button
                  onClick={() => {
                    setSelectedFormat("10x15");
                    setIsPriceDrawerOpen(true);
                  }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-1"
                >
                  Voir les tarifs dégressifs
                </button>
              </div>
            </div>

            {/* Card 2: Coffret Box, Carte & Lettre */}
            <div className="group flex flex-col justify-between rounded-2xl border border-border bg-background p-6 sm:p-8 shadow-xs hover:border-deep-brown hover:shadow-lg transition-all">
              <div>
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                  <img
                    src={boxLetterImg}
                    alt="Mémora Coffret (Box, Carte & Lettre)"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-sand px-3 py-1 text-[11px] uppercase tracking-wider text-charcoal font-medium">
                    Coffret Cadeau Prestige
                  </span>
                </div>
                <h3 className="mt-5 font-serif text-2xl sm:text-3xl">Mémora Coffret (Box, Carte & Lettre)</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  L'expérience cadeau prestige complète : une boîte coffret rigide luxueuse, votre tirage photo connecté NFC, une carte souvenir et une véritable lettre personnalisée.
                </p>

                <div className="mt-4 rounded-xl bg-cream/50 p-3.5 text-xs text-charcoal border border-border/60">
                  <p className="font-semibold text-deep-brown mb-1.5 uppercase tracking-wider text-[10px]">
                    Contenu du pack :
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Coffret rigide luxe de présentation (La Box)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Tirage photo d'art 10×15 cm avec puce NFC</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Carte souvenir personnalisée</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                      <span>1× Véritable lettre d'émotion sur papier d'art</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-serif text-charcoal">{formatTND(89)}</span>
                  <span className="text-xs text-muted-foreground">/ coffret complet (dès 49 DT en volume)</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => {
                    setSelectedFormat("box");
                    setSelectedWithFrame(false);
                    setFunnelStage("video");
                  }}
                  className="w-full rounded-sm bg-primary py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                >
                  Choisir le coffret & Créer
                </button>
                <button
                  onClick={() => {
                    setSelectedFormat("box");
                    setIsPriceDrawerOpen(true);
                  }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-1"
                >
                  Voir les tarifs dégressifs
                </button>
              </div>
            </div>
          </div>

          {/* Flip card explanation section */}
          <div className="mt-28 rounded-3xl bg-cream/50 p-8 sm:p-14 border border-border">
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div>
                <p className="eyebrow">Et si le destinataire ne sait pas comment l'utiliser ?</p>
                <h2 className="mt-3 font-serif text-3xl sm:text-5xl">
                  Tout est imprimé au dos de chaque photo.
                </h2>
                <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
                  Quand votre proche reçoit son Mémora, il n'a besoin d'aucune explication de votre part. Les 3 étapes ultra-simples sont imprimées avec élégance au verso.
                </p>

                <div className="mt-8 space-y-3 text-sm text-charcoal">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-deep-brown" />
                    <span>Fonctionne sur iPhone et Android</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-deep-brown" />
                    <span>Aucune application à télécharger</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-deep-brown" />
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
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                  <Video className="h-4 w-4" />
                  <span>Étape 1 · Votre Vidéo</span>
                </div>
                <h2 className="mt-1 font-serif text-3xl sm:text-4xl">Ajoutez la vidéo de votre souvenir</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  8 premières minutes incluses (+1,50 DT / min supplémentaire, max 30 min).
                </p>
              </div>

              {/* EditEasy shortcut promo */}
              <button
                onClick={() => navigate({ to: "/editeasy" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-sand/30 px-3.5 py-1.5 text-xs text-deep-brown hover:bg-sand/60 transition-colors shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Pas de montage ? Montage auto gratuit</span>
              </button>
            </div>

            {/* Video Input Options */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {/* Option A: From Computer / Local Gallery */}
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-taupe/40 bg-cream/30 p-8 text-center transition-colors hover:bg-cream/70">
                <Upload className="h-8 w-8 text-deep-brown/80" />
                <p className="mt-3 font-medium text-sm">Depuis cet appareil</p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, MOV, WebM (jusqu'à 5 Go)</p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoUpload}
                />
              </label>

              {/* Option B: Mobile Hand-Off QR Code */}
              <button
                type="button"
                onClick={() => setIsMobileUploadOpen(true)}
                className="flex flex-col items-center justify-center rounded-2xl border border-border bg-background p-8 text-center transition-colors hover:bg-cream/40"
              >
                <Smartphone className="h-8 w-8 text-deep-brown/80" />
                <p className="mt-3 font-medium text-sm">Scanner avec votre téléphone</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Flashez un QR code pour transférer depuis votre mobile
                </p>
              </button>

              {/* Option C: WhatsApp Direct Assistant */}
              <a
                href="https://wa.me/21698000000?text=Bonjour,%20je%20souhaite%20commander%20un%20tirage%20M%C3%A9mora%20et%20vous%20envoyer%20ma%20vid%C3%A9o%20et%20ma%20photo."
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-full flex items-center justify-between rounded-xl border border-sand/80 bg-sand/20 p-4 text-xs text-charcoal hover:bg-sand/35 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
                    <MessageCircle className="h-4 w-4 fill-current" />
                  </span>
                  <div>
                    <p className="font-semibold text-sm">Plus simple ? Commandez par WhatsApp</p>
                    <p className="text-muted-foreground text-xs">
                      Envoyez-nous directement votre photo et votre vidéo au +216 98 000 000 et on s'occupe de tout.
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline font-semibold text-deep-brown underline shrink-0">
                  Écrire sur WhatsApp →
                </span>
              </a>
            </div>

            {/* Video Player Preview */}
            {videoUrl && (
              <div className="mt-8 rounded-2xl border border-border bg-charcoal/5 p-6">
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Vidéo sélectionnée
                    </p>
                    <p className="font-medium text-sm text-charcoal">{videoName}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-charcoal">
                      Durée : {Math.floor(videoDuration / 60)}m {videoDuration % 60}s
                    </span>
                  </div>
                </div>

                <div className="mt-4 relative aspect-video max-h-[360px] mx-auto overflow-hidden rounded-xl bg-black shadow-lg">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="h-full w-full object-contain"
                    onLoadedMetadata={(e) => {
                      const d = Math.floor(e.currentTarget.duration);
                      if (d > 0) setVideoDuration(d);
                    }}
                  />
                </div>

                {/* Surcharge breakdown if > 8 min */}
                <div className="mt-4 rounded-xl bg-cream/60 p-3.5 text-xs text-charcoal flex items-center justify-between">
                  <span>8 premières minutes : <strong>Incluses</strong></span>
                  {videoDuration > INCLUDED_VIDEO_SECONDS ? (
                    <span className="text-deep-brown font-semibold">
                      +{extraVideoMinutes} min supplémentaires = +{formatTND(videoSurchargeCurrent)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Aucun supplément de durée</span>
                  )}
                </div>
              </div>
            )}

            {/* Next step CTA */}
            <div className="mt-10 flex justify-end border-t border-border pt-6">
              <button
                onClick={() => setFunnelStage("photo")}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <span>Valider la vidéo & Choisir la photo</span>
                <ArrowRight className="h-4 w-4" />
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
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                <ImageIcon className="h-4 w-4" />
                <span>Étape 2 · La Photo Imprimée</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl">Choisissez la photo au recto</h2>
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
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                    photoSelectionMode === "extract"
                      ? "border-deep-brown bg-sand/20 shadow-xs"
                      : "border-border bg-background hover:bg-cream/40"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    photoSelectionMode === "extract" ? "bg-deep-brown text-ivory" : "bg-cream text-charcoal"
                  }`}>
                    <Film className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">Extraire une image de la vidéo</p>
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
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                    photoSelectionMode === "upload"
                      ? "border-deep-brown bg-sand/20 shadow-xs"
                      : "border-border bg-background hover:bg-cream/40"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    photoSelectionMode === "upload" ? "bg-deep-brown text-ivory" : "bg-cream text-charcoal"
                  }`}>
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Importer depuis mes photos</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Utilisez une photo séparée déjà enregistrée dans votre appareil (JPG, PNG, HEIC)
                    </p>
                  </div>
                </button>
              </div>

              {/* Mode A: Real Video Frame Extractor Studio */}
              {photoSelectionMode === "extract" && (
                <div className="mt-6 rounded-2xl border border-sand bg-cream/30 p-5 sm:p-7 animate-in fade-in">
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
                      Curseur : <strong className="font-mono text-charcoal">{formatTime(videoScrubTime)}</strong> / {formatTime(videoDuration)}
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
                    <div className="absolute top-3 left-3 rounded-full bg-black/70 backdrop-blur px-3 py-1 text-xs font-mono text-ivory flex items-center gap-1.5 shadow">
                      <Film className="h-3.5 w-3.5 text-sand" />
                      <span>{formatTime(videoScrubTime)} / {formatTime(videoDuration)}</span>
                    </div>

                    {capturedTimestamp !== null && (
                      <div className="absolute top-3 right-3 rounded-full bg-deep-brown/90 backdrop-blur px-3 py-1 text-[11px] text-ivory flex items-center gap-1 shadow">
                        <Check className="h-3.5 w-3.5 text-sand" />
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
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-5)}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Reculer de 5 secondes"
                        >
                          -5s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-1)}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Reculer de 1 seconde"
                        >
                          -1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(-0.1)}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Reculer d'une fraction de seconde"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={toggleScrubPlay}
                          className="rounded-md border border-deep-brown/30 bg-sand/30 px-3.5 py-1.5 text-xs font-semibold text-deep-brown hover:bg-sand/60 transition-colors"
                        >
                          {isScrubPlaying ? "Pause" : "Lecture"}
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(0.1)}
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Avancer d'une fraction de seconde"
                        >
                          +0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(1)}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Avancer de 1 seconde"
                        >
                          +1s
                        </button>
                        <button
                          type="button"
                          onClick={() => stepScrubTime(5)}
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-charcoal hover:bg-cream transition-colors"
                          title="Avancer de 5 secondes"
                        >
                          +5s
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCaptureFrame}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-deep-brown px-5 py-2.5 text-xs uppercase tracking-wider font-semibold text-ivory hover:bg-charcoal transition-all shadow-sm shrink-0"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Extraire cette image ({formatTime(videoScrubTime)})</span>
                      </button>
                    </div>

                    {photoSource === "frame" && capturedTimestamp !== null && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-sand/40 border border-sand p-3 text-xs text-deep-brown font-medium">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-deep-brown" />
                        <span>Image extraite avec succès à <strong>{formatTime(capturedTimestamp)}</strong> depuis votre vidéo originale. Ce moment précis est configuré pour votre tirage ci-dessous.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mode B: Direct Image Upload */}
              {photoSelectionMode === "upload" && (
                <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-taupe/40 bg-cream/30 p-10 text-center transition-colors hover:bg-cream/70 animate-in fade-in">
                  <Upload className="h-9 w-9 text-deep-brown/80" />
                  <p className="mt-3 text-sm font-semibold">Cliquez pour importer votre photo</p>
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
            <div className="mt-10 rounded-2xl border border-sand bg-cream/30 p-6 sm:p-8 space-y-6">
              <div className="border-b border-border/80 pb-4">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                  <Gift className="h-4 w-4" />
                  <span>
                    {selectedFormat === "box"
                      ? "Personnalisation · Carte & Lettre d'émotion"
                      : "Personnalisation · Carte avec message"}
                  </span>
                </div>
                <h3 className="mt-1 font-serif text-2xl">Vos mots précieux</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedFormat === "box"
                    ? "Rédigez le mot court pour la carte, ainsi que votre lettre qui sera imprimée sur papier d'art et glissée dans le coffret."
                    : "Votre photo NFC est glissée dans son enveloppe d'art avec une carte portant votre message personnalisé."}
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
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-hidden focus:border-deep-brown"
                />
              </div>

              {/* Letter for Box */}
              {selectedFormat === "box" && (
                <div className="animate-in fade-in">
                  <label className="text-xs font-semibold uppercase tracking-wider text-charcoal flex items-center justify-between">
                    <span>Votre lettre d'émotion pour le coffret</span>
                    <span className="text-[11px] font-normal text-deep-brown font-serif italic">Papier vergé d'art</span>
                  </label>
                  <textarea
                    rows={5}
                    value={letterContent}
                    onChange={(e) => setLetterContent(e.target.value)}
                    placeholder="Chère maman, mon amour, cher ami... Rédigez ici vos plus beaux souvenirs et sentiments. Notre atelier imprimera votre lettre avec raffinement pour l'insérer dans votre coffret cadeau."
                    className="mt-1.5 w-full rounded-lg border border-border bg-background p-4 text-sm font-serif leading-relaxed outline-hidden focus:border-deep-brown shadow-inner"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Cette lettre sera délicatement pliée et cachetée aux côtés de votre photo NFC dans la boîte coffret.
                  </p>
                </div>
              )}
            </div>

            {/* Next step CTA */}
            <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => setFunnelStage("video")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Retour à la vidéo
              </button>
              <button
                onClick={() => setFunnelStage("preview")}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <span>Continuer vers l'Aperçu de mon MÉMORA</span>
                <ArrowRight className="h-4 w-4" />
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
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                <Sparkles className="h-4 w-4" />
                <span>Étape 3 · Aperçu interactif de votre MÉMORA</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl">Aperçu de votre MÉMORA</h2>
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
              <div className="space-y-6 rounded-2xl border border-border bg-cream/30 p-6 sm:p-8">
                <div>
                  <p className="eyebrow text-deep-brown">Votre Création Personnalisée</p>
                  <h3 className="font-serif text-2xl text-charcoal mt-1">
                    {selectedFormat === "box"
                      ? "Mémora Coffret (Box, Carte & Lettre)"
                      : "Mémora Simple (Enveloppe & Carte)"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedFormat === "box"
                      ? "89 DT · Coffret rigide prestige, carte souvenir et lettre d'émotion"
                      : "49 DT · Photo NFC sous enveloppe d'art avec carte message"}
                  </p>
                </div>

                {/* Photo chosen */}
                <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-background p-3.5">
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
                <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-background p-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-deep-brown text-ivory">
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
                <div className="rounded-xl border border-sand/70 bg-[#FAF8F5] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Message sur la carte
                  </p>
                  <p className="mt-1 font-serif text-sm italic text-charcoal">
                    « {cardMessage || "Pour toujours, je t'aime."} »
                  </p>
                </div>

                {/* Letter if box */}
                {selectedFormat === "box" && letterContent && (
                  <div className="rounded-xl border border-sand/70 bg-[#FAF8F5] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-deep-brown font-semibold">
                        Lettre d'émotion pour le coffret
                      </p>
                      <span className="font-serif text-[10px] italic text-muted-foreground">Papier vergé</span>
                    </div>
                    <p className="mt-1.5 font-serif text-xs text-charcoal leading-relaxed max-h-24 overflow-y-auto">
                      {letterContent}
                    </p>
                  </div>
                )}

                {/* Reassurance points */}
                <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-deep-brown shrink-0" />
                    <span>Puce NFC invisible NTAG213 garantie à vie</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-deep-brown shrink-0" />
                    <span>Fonctionne sur iPhone et Android sans aucune application</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-deep-brown shrink-0" />
                    <span>Notice explicative imprimée avec élégance au verso</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Next step CTA */}
            <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => setFunnelStage("photo")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                ← Modifier la photo ou le message
              </button>
              <button
                onClick={handleValidatePhotoAndAddToCart}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <span>Valider & Ajouter au Panier</span>
                <ArrowRight className="h-4 w-4" />
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
          <div className="border-b border-border pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Votre Commande MÉMORA</p>
              <h1 className="font-serif text-4xl sm:text-5xl">Mon Panier</h1>
            </div>
            <button
              onClick={() => {
                setSelectedFormat("10x15");
                setFunnelStage("video");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-cream px-4 py-2 text-xs uppercase tracking-wider text-charcoal hover:bg-sand transition-colors shrink-0"
            >
              <Plus className="h-4 w-4 text-deep-brown" />
              <span>Créer une autre photo Mémora</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg text-muted-foreground">Votre panier est encore vide.</p>
              <button
                onClick={() => setFunnelStage("picker")}
                className="mt-6 inline-block rounded-sm bg-primary px-8 py-3 text-xs uppercase tracking-widest text-primary-foreground"
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
                      className="rounded-2xl border border-border bg-background p-6 shadow-xs transition-all hover:border-deep-brown/40"
                    >
                      <div className="flex gap-5">
                        <img
                          src={item.photoPreviewUrl || hero}
                          alt="Aperçu tirage"
                          className="h-28 w-24 rounded-lg object-cover border border-border shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-serif text-2xl">
                                {item.format === "box" || item.productId === "p2"
                                  ? "Mémora Coffret (Box, Carte & Lettre)"
                                  : "Mémora Simple (Enveloppe & Carte)"}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                Vidéo liée : {item.videoName || "video_souvenir.mp4"} ({Math.floor(item.videoDurationSec / 60)}m)
                              </p>
                              {item.cardMessage && (
                                <p className="mt-1 text-xs text-muted-foreground italic">
                                  Message carte : « {item.cardMessage} »
                                </p>
                              )}
                              {item.letterContent && (
                                <p className="mt-0.5 text-[11px] text-deep-brown font-medium">
                                  ✓ Lettre d'émotion rédigée incluse
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-serif text-xl">{formatTND(unitPrice * item.qty)}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatTND(unitPrice)} /u
                              </p>
                            </div>
                          </div>

                          {/* Quantity and Actions */}
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">Quantité :</span>
                              <div className="flex items-center rounded-md border border-border">
                                <button
                                  onClick={() => cart.setQty(item.key, item.qty - 1)}
                                  className="p-1.5 hover:bg-cream"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="px-3 font-semibold">{item.qty}</span>
                                <button
                                  onClick={() => cart.setQty(item.key, item.qty + 1)}
                                  className="p-1.5 hover:bg-cream"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Duplication Tools */}
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => handleDuplicate(item.key, "same_photo_new_video")}
                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-deep-brown"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>Même photo, autre vidéo</span>
                              </button>
                              <button
                                onClick={() => cart.remove(item.key)}
                                className="text-muted-foreground hover:text-destructive underline"
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
                <div className="rounded-2xl border border-border bg-cream/30 p-6 space-y-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Code promo (ex: MEMORA10)"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs uppercase outline-hidden"
                    />
                    <button
                      onClick={() => {
                        const res = cart.applyPromoCode(promoInput);
                        if (res.success) toast.success(res.message);
                        else toast.error(res.message);
                      }}
                      className="rounded-md bg-foreground px-4 py-2 text-xs text-background font-medium"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Summary Sidebar */}
              <div className="h-fit rounded-2xl border border-border bg-cream/40 p-6 sm:p-8 shadow-xs">
                <h3 className="font-serif text-2xl border-b border-border pb-4">Récapitulatif</h3>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tirages photos ({quote.totalQuantity} ex.)</span>
                    <span>{formatTND(quote.itemsSubtotal)}</span>
                  </div>

                  {quote.framesSubtotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Options cadres bois</span>
                      <span>+{formatTND(quote.framesSubtotal)}</span>
                    </div>
                  )}

                  {quote.videoSurcharges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Supplément vidéo (&gt;8 min)</span>
                      <span>+{formatTND(quote.videoSurcharges)}</span>
                    </div>
                  )}

                  {quote.discount > 0 && (
                    <div className="flex justify-between text-deep-brown font-medium">
                      <span>Réduction code promo</span>
                      <span>-{formatTND(quote.discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-border pt-3">
                    <span className="text-muted-foreground">Livraison estimée</span>
                    <span>
                      {quote.isFreeShipping ? (
                        <strong className="text-deep-brown">Offerte</strong>
                      ) : (
                        formatTND(quote.shippingCost)
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-border pt-4 text-xl font-serif font-bold text-charcoal">
                    <span>Total TTC</span>
                    <span>{formatTND(quote.total)}</span>
                  </div>
                </div>

                {/* Free shipping threshold progress */}
                {!quote.isFreeShipping && (
                  <div className="mt-5 rounded-xl bg-sand/30 p-3 text-xs text-charcoal">
                    Plus que {formatTND(FREE_SHIPPING_THRESHOLD_TND - quote.total)} pour profiter de la <strong>livraison offerte</strong> !
                  </div>
                )}

                <button
                  onClick={() => setFunnelStage("delivery")}
                  className="mt-8 w-full rounded-sm bg-primary py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
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
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                <Truck className="h-4 w-4" />
                <span>Étape 5 · Coordonnées & Livraison</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl">Où devons-nous expédier vos Mémora ?</h2>
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
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Prénom *
                  </label>
                  <input
                    required
                    type="text"
                    value={customer.firstName}
                    onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nom *
                  </label>
                  <input
                    required
                    type="text"
                    value={customer.lastName}
                    onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email pour le suivi *
                  </label>
                  <input
                    required
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Téléphone (pour le livreur) *
                  </label>
                  <input
                    required
                    type="tel"
                    placeholder="Ex: 20 123 456 ou 98 123 456"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Adresse de livraison *
                </label>
                <input
                  required
                  type="text"
                  value={shipping.address}
                  onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                  placeholder="Rue, quartier, résidence, n° d'appartement..."
                  className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                />
              </div>

              {/* City, Postal, Country */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Code postal
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 1001, 4000..."
                    value={shipping.postalCode}
                    onChange={(e) => setShipping({ ...shipping, postalCode: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Gouvernorat / Ville *
                  </label>
                  <input
                    required
                    type="text"
                    list="tunisian-cities"
                    placeholder="Choisir ou saisir la ville..."
                    value={shipping.city}
                    onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  />
                  <datalist id="tunisian-cities">
                    {TUNISIAN_GOVERNORATES.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pays *
                  </label>
                  <select
                    value={shipping.country}
                    onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-hidden focus:border-foreground"
                  >
                    <option value="TN">Tunisie</option>
                  </select>
                </div>
              </div>

              {/* Carrier Selection */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Mode de livraison
                </p>
                <div className="space-y-3">
                  {getShippingOptions(shipping.country, quote.total).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${
                        shipping.carrier === opt.id
                          ? "border-deep-brown bg-sand/15"
                          : "border-border hover:bg-cream/40"
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
                      <span className="font-serif text-base font-bold">
                        {opt.priceTND === 0 ? "Gratuit" : formatTND(opt.priceTND)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit to Payment */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                <button
                  type="button"
                  onClick={() => setFunnelStage("cart")}
                  className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Retour au panier
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
                >
                  <span>Valider la commande ({formatTND(quote.total)})</span>
                  <ArrowRight className="h-4 w-4" />
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
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-deep-brown font-medium">
                <Banknote className="h-4 w-4" />
                <span>Étape 6 · Validation de votre commande</span>
              </div>
              <h2 className="mt-1 font-serif text-3xl sm:text-4xl">Paiement à la livraison</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Réglez en toute sérénité en espèces auprès du livreur à la réception de votre colis.
              </p>
            </div>

            {/* Exclusive Payment Method: Cash On Delivery */}
            <div className="mt-8 rounded-2xl border-2 border-deep-brown bg-sand/15 p-6 shadow-xs">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-deep-brown text-ivory shadow-sm">
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
                      <ShieldCheck className="h-4 w-4 text-deep-brown shrink-0" />
                      <span>Aucune carte bancaire requise</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-deep-brown shrink-0" />
                      <span>Livraison suivie par transporteur</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-deep-brown shrink-0" />
                      <span>Paiement après réception</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Recap Card */}
            <div className="mt-6 rounded-xl border border-border bg-cream/40 p-4 text-xs text-charcoal flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-deep-brown uppercase tracking-wider text-[10px]">
                  Adresse de livraison enregistrée :
                </p>
                <p className="mt-0.5 text-xs text-charcoal">
                  {customer.firstName} {customer.lastName} · {shipping.address}, {shipping.postalCode} {shipping.city}
                </p>
                <p className="text-[11px] text-muted-foreground">Tél : {customer.phone || "Non renseigné"}</p>
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
            <div className="mt-8 border-t border-border pt-6">
              <label className="flex items-start gap-3 text-xs text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={legalConsent}
                  onChange={(e) => setLegalConsent(e.target.checked)}
                  className="mt-0.5 accent-deep-brown"
                />
                <span>
                  J'accepte expressément les <strong>Conditions Générales de Vente</strong> et m'engage à régler la somme de <strong>{formatTND(quote.total)}</strong> en espèces au livreur à la réception de mon colis.
                </span>
              </label>
            </div>

            {/* Status Feedback and Progress Indicator */}
            {isSubmitting && (
              <div className="mt-6 rounded-2xl border border-sand bg-cream/50 p-5 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <RotateCw className="h-5 w-5 text-deep-brown animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-deep-brown">
                      {checkoutStep === "preparing" && "1/5 · Préparation des fichiers"}
                      {checkoutStep === "uploading_photo" && `2/5 · Upload photo Cloudflare R2 (Article ${checkoutProgressIndex}/${items.length})`}
                      {checkoutStep === "uploading_video" && `3/5 · Upload vidéo Cloudflare R2 (Article ${checkoutProgressIndex}/${items.length})`}
                      {checkoutStep === "verifying" && "4/5 · Vérification de l'intégrité"}
                      {checkoutStep === "finalizing" && "5/5 · Finalisation atomique"}
                    </p>
                    <p className="mt-0.5 text-xs text-charcoal">{checkoutMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error & Retry Banner */}
            {checkoutStep === "error" && checkoutError && !isSubmitting && (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 animate-in fade-in">
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
                      className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-destructive px-4 py-2 text-xs font-semibold uppercase tracking-wider text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-xs"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Réessayer l'envoi et la commande</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm Order CTA */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setFunnelStage("delivery")}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Retour
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 sm:px-10 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md disabled:opacity-60 disabled:cursor-wait"
              >
                {isSubmitting ? (
                  <RotateCw className="h-4 w-4 text-sand animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-sand" />
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
          <div className="rounded-3xl border border-border bg-background p-8 sm:p-14 shadow-lg animate-in zoom-in-95">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand/30 text-deep-brown">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <p className="eyebrow mt-6">Commande validée</p>
            <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Merci pour votre confiance !</h1>
            <p className="mt-2 text-sm font-semibold text-deep-brown">
              Numéro de commande : {orderNumber}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Un email de confirmation récapitulatif a été envoyé à <strong>{customer.email || "votre adresse email"}</strong>.
            </p>

            {/* COD Reminder Badge */}
            <div className="mt-6 rounded-2xl border border-sand bg-sand/20 p-4 text-xs text-charcoal">
              <p className="font-semibold text-deep-brown flex items-center justify-center gap-1.5 text-sm">
                <Banknote className="h-4.5 w-4.5 text-deep-brown" />
                <span>Règlement : En espèces à la livraison</span>
              </p>
              <p className="mt-1 text-muted-foreground">
                Montant exact à remettre au livreur lors de la réception : <strong className="text-charcoal font-semibold text-sm">{formatTND(quote.total)}</strong>
              </p>
            </div>

            {/* Fulfilment Timeline Stepper as specified in section 11 of plan.md */}
            <div className="mt-10 rounded-2xl border border-border bg-cream/40 p-6 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Cycle de fabrication & livraison
              </p>
              <div className="space-y-3.5 text-xs text-charcoal">
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold">1</span>
                  <span><strong>Tirage d'art en cours :</strong> Impression argentique haute résolution.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold">2</span>
                  <span><strong>Programmation NFC :</strong> Intégration et verrouillage de votre puce unique.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-deep-brown text-[10px] text-ivory font-bold">3</span>
                  <span><strong>Contrôle qualité :</strong> Test de scan avant emballage soigné.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sand text-[10px] text-charcoal font-bold">4</span>
                  <span><strong>Expédition suivie :</strong> Réception sous 3 à 5 jours ouvrés.</span>
                </div>
              </div>
            </div>

            {/* Post-purchase feedback widget */}
            <div className="mt-8 rounded-xl border border-border p-5 text-left bg-background">
              <p className="text-xs font-medium text-charcoal">
                Votre avis nous est précieux : qu'est-ce qui a failli vous empêcher de commander aujourd'hui ?
              </p>
              <input
                type="text"
                placeholder="Un détail sur les prix, la livraison, le fonctionnement..."
                className="mt-2 w-full rounded-md border border-border bg-transparent p-2.5 text-xs outline-hidden"
              />
              <button
                type="button"
                onClick={() => toast.success("Merci pour votre retour !")}
                className="mt-3 rounded-sm bg-cream px-3 py-1.5 text-[11px] font-semibold text-charcoal hover:bg-sand"
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
                className="rounded-sm bg-primary px-8 py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors"
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
        initialFormat={selectedFormat === "magnet" ? "magnet" : "10x15"}
      />

      {/* Mobile Upload Hand-off QR Modal */}
      <MobileUploadModal
        isOpen={isMobileUploadOpen}
        onClose={() => setIsMobileUploadOpen(false)}
        onVideoReceived={(data) => {
          setVideoUrl(data.url);
          setVideoName(data.name);
          setVideoDuration(data.durationSec);
        }}
      />
    </div>
  );
}
