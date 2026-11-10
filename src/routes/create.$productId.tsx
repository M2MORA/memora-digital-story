import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Video,
  Smartphone,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RotateCw,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { cart, useStore } from "@/lib/cart";
import { getProduct, formatPrice } from "@/lib/products";
import { MobileUploadModal } from "@/components/site/MobileUploadModal";
import { getVideoSurcharge, INCLUDED_VIDEO_SECONDS, formatTND } from "@/lib/pricing";
import { putCachedMedia, getMediaCacheKey } from "@/lib/media-cache";
import { DEMO_VIDEO_URL } from "@/lib/demo-media";

export const Route = createFileRoute("/create/$productId")({
  loader: ({ params }) => {
    const product = getProduct(params.productId);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `Personnaliser votre ${loaderData.product.name} — MÉMORA`
          : "Studio — MÉMORA",
      },
      {
        name: "description",
        content: "Liez votre vidéo et votre photo à votre tirage connecté NFC.",
      },
    ],
  }),
  component: Studio,
});

function Studio() {
  const { product } = Route.useLoaderData();
  const navigate = useNavigate();
  const { draftId } = useStore();

  // Clé d'article stable pour la session Studio
  const [itemKey] = useState(() => `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  const [step, setStep] = useState<"video" | "photo">("video");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>(DEMO_VIDEO_URL);
  const [videoName, setVideoName] = useState("video_souvenir.mp4");
  const [videoDuration, setVideoDuration] = useState(120);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(product.images[0] ?? "");
  const [photoName, setPhotoName] = useState("photo_recto.jpg");
  const [withFrame, setWithFrame] = useState(product.category === "grand-format");
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [previewSide, setPreviewSide] = useState<"recto" | "verso">("recto");

  const [cardMessage, setCardMessage] = useState("Pour toujours, je t'aime.");

  const surcharge = getVideoSurcharge(videoDuration, 1);

  // Nettoyage des object URLs temporaires lors du démontage
  const prevVideoUrlRef = useRef<string | null>(null);
  const prevPhotoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (prevVideoUrlRef.current && prevVideoUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(prevVideoUrlRef.current);
      }
      if (prevPhotoUrlRef.current && prevPhotoUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(prevPhotoUrlRef.current);
      }
    };
  }, []);

  const handleVideoSelect = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!["mp4", "mov", "webm"].includes(ext)) {
      toast.error("Format vidéo non supporté. Formats acceptés : MP4, MOV, WEBM.");
      return;
    }
    if (!f.type.startsWith("video/") && f.type !== "application/octet-stream") {
      toast.error("Type MIME vidéo invalide.");
      return;
    }
    if (f.size > 5 * 1024 * 1024 * 1024) {
      toast.error("La vidéo dépasse la taille maximale autorisée (5 Go).");
      return;
    }
    if (f.size <= 0) {
      toast.error("Le fichier vidéo est vide.");
      return;
    }

    try {
      const cacheKey = getMediaCacheKey(draftId, itemKey, "video");
      await putCachedMedia(cacheKey, f);

      if (prevVideoUrlRef.current && prevVideoUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(prevVideoUrlRef.current);
      }
      const preview = URL.createObjectURL(f);
      prevVideoUrlRef.current = preview;

      setVideoFile(f);
      setVideoUrl(preview);
      setVideoName(f.name);
      toast.success("Vidéo sélectionnée et mise en cache !");
    } catch {
      toast.error("Erreur lors de l'enregistrement local de la vidéo.");
    }
  };

  const handlePhotoSelect = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast.error("Format photo non supporté. Formats acceptés : JPG, JPEG, PNG, WEBP.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type) && !f.type.startsWith("image/")) {
      toast.error("Type MIME photo invalide.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("La photo dépasse la taille maximale autorisée (25 Mo).");
      return;
    }
    if (f.size <= 0) {
      toast.error("Le fichier photo est vide.");
      return;
    }

    try {
      const cacheKey = getMediaCacheKey(draftId, itemKey, "photo");
      await putCachedMedia(cacheKey, f);

      if (prevPhotoUrlRef.current && prevPhotoUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(prevPhotoUrlRef.current);
      }
      const preview = URL.createObjectURL(f);
      prevPhotoUrlRef.current = preview;

      setPhotoFile(f);
      setPhotoUrl(preview);
      setPhotoName(f.name);
      toast.success("Photo sélectionnée et mise en cache !");
    } catch {
      toast.error("Erreur lors de l'enregistrement local de la photo.");
    }
  };

  const handleValidate = () => {
    cart.add(product.id, {
      key: itemKey,
      format: product.formatCode,
      withFrame,
      videoDurationSec: videoDuration,
      photoPreviewUrl: photoUrl.startsWith("blob:") ? undefined : photoUrl,
      videoPreviewUrl: videoUrl.startsWith("blob:") ? undefined : videoUrl,
      videoName,
      photoName,
      cardMessage,
      qty: 1,
    });
    toast.success("Votre création Mémora a été ajoutée au panier !");
    navigate({ to: "/commander" });
  };

  return (
    <div className="min-h-screen bg-background pb-32 pt-28">
      <div className="container-x max-w-5xl">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <p className="eyebrow">Studio de création · {product.name}</p>
            <h1 className="font-serif text-3xl sm:text-5xl">Liez votre souvenir au support</h1>
          </div>
          <span className="font-serif text-2xl font-semibold text-charcoal">
            {formatPrice(product.priceTND)}
          </span>
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          {/* Live Preview */}
          <div className="lg:sticky lg:top-28 lg:self-start flex flex-col items-center">
            <div className="relative aspect-[4/5] w-full max-w-[320px] rounded-2xl border-4 border-ivory bg-cream shadow-2xl overflow-hidden flex items-center justify-center">
              {previewSide === "recto" ? (
                <img src={photoUrl} alt="Photo sélectionnée" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[#FBF9F5] p-6 text-center flex flex-col justify-between">
                  <p className="font-serif text-xl tracking-wider text-charcoal">MÉMORA</p>
                  <div className="my-auto rounded-xl border border-dashed border-taupe/40 bg-sand/20 p-4">
                    <p className="text-xs font-semibold">Puce NFC intégrée</p>
                    <p className="text-[11px] text-muted-foreground">Posez votre smartphone ici</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sans application · iOS & Android</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPreviewSide(previewSide === "recto" ? "verso" : "recto")}
                className="absolute bottom-3 right-3 rounded-full bg-charcoal/70 px-3 py-1.5 text-[11px] text-ivory uppercase tracking-wider backdrop-blur"
              >
                {previewSide === "recto" ? "Voir le verso (notice)" : "Voir la photo"}
              </button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Format {product.dimensions} · Puce NFC invisible
            </p>
          </div>

          {/* Stepper Inputs */}
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-8 shadow-xs">
            {step === "video" ? (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-deep-brown">
                  <Video className="h-4 w-4" />
                  <span>Étape 1 : Votre Vidéo</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl">Quelle vidéo voulez-vous faire vivre ?</h2>
                <p className="text-sm text-muted-foreground">
                  8 premières minutes incluses (+1,50 DT / min supplémentaire).
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-taupe/40 bg-cream/30 p-6 text-center hover:bg-cream/70">
                    <Upload className="h-6 w-6 text-deep-brown" />
                    <span className="mt-2 text-xs font-medium">Importer un fichier</span>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleVideoSelect(f);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsMobileModalOpen(true)}
                    className="flex flex-col items-center justify-center rounded-xl border border-border p-6 text-center hover:bg-cream/40"
                  >
                    <Smartphone className="h-6 w-6 text-deep-brown" />
                    <span className="mt-2 text-xs font-medium">Depuis mon téléphone</span>
                  </button>
                </div>

                <div className="rounded-xl bg-charcoal/5 p-4 text-xs">
                  <div className="flex justify-between font-medium">
                    <span>Fichier : {videoName}</span>
                    <span>Durée : {Math.floor(videoDuration / 60)}m {videoDuration % 60}s</span>
                  </div>
                  {surcharge > 0 && (
                    <p className="mt-2 text-deep-brown font-semibold">
                      Supplément durée : +{formatTND(surcharge)}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setStep("photo")}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-primary py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                >
                  <span>Passer au choix de la photo</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-deep-brown">
                  <Sparkles className="h-4 w-4" />
                  <span>Étape 2 : La Photo Imprimée</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl">La photo qui habillera le recto</h2>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-taupe/40 bg-cream/30 p-8 text-center hover:bg-cream/70">
                  <Upload className="h-8 w-8 text-deep-brown" />
                  <span className="mt-2 text-sm font-medium">Choisir ma photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoSelect(f);
                    }}
                  />
                </label>

                {/* Card Message Input */}
                <div className="rounded-xl border border-border bg-cream/30 p-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-charcoal flex justify-between">
                      <span>Message sur la carte *</span>
                      <span className="text-[11px] font-normal text-muted-foreground">{cardMessage.length}/140</span>
                    </label>
                    <input
                      type="text"
                      maxLength={140}
                      value={cardMessage}
                      onChange={(e) => setCardMessage(e.target.value)}
                      placeholder="Ex: Pour toujours, je t'aime..."
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-hidden focus:border-deep-brown"
                    />
                  </div>

                </div>

                <div className="flex gap-4 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setStep("video")}
                    className="rounded-sm border border-border px-6 py-3 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={handleValidate}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-sm bg-primary py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
                  >
                    <span>Ajouter à ma commande</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileUploadModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        onVideoReceived={(data) => {
          setVideoUrl(data.url);
          setVideoName(data.name);
          setVideoDuration(data.durationSec);
        }}
      />
    </div>
  );
}
