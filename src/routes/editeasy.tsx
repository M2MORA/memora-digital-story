import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  Music,
  Sliders,
  CheckCircle2,
  Play,
  Pause,
  Trash2,
  ArrowRight,
  Smartphone,
  Sparkles,
  Scissors,
  Film,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { MobileUploadModal } from "@/components/site/MobileUploadModal";
import hero from "@/assets/hero-v2.jpg";
import scan from "@/assets/scan-v2.jpg";
import moments from "@/assets/product-moments-v2.jpg";

export const Route = createFileRoute("/editeasy")({
  head: () => ({
    meta: [
      { title: "Montage Automatique Gratuit — MÉMORA Studio" },
      {
        name: "description",
        content:
          "Transformez vos photos et vidéos éparpillées en un film souvenir harmonieux et rythmé avec musique, prêt pour votre tirage Mémora.",
      },
    ],
  }),
  component: EditEasyPage,
});

type UploadItem = {
  id: string;
  type: "photo" | "video";
  url: string;
  name: string;
  durationSec?: number | undefined;
};

const MUSIC_STYLES = [
  {
    id: "auto",
    title: "Sélection automatique intelligente",
    desc: "L'IA choisit la mélodie la plus adaptée à vos visuels",
    previewUrl: "https://cdn.pixabay.com/download/audio/2022/02/23/audio_ea70ad08e3.mp3",
    intensity: "Équilibrée",
  },
  {
    id: "romance",
    title: "Émotion & Tendresse",
    desc: "Piano doux, acoustique intimiste, idéal mariages & couple",
    previewUrl: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
    intensity: "Douce",
  },
  {
    id: "adventure",
    title: "Voyage & Évasion",
    desc: "Guitares lumineuses, percussions solaires, grand air",
    previewUrl: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a7351b.mp3",
    intensity: "Rythmée",
  },
  {
    id: "celebration",
    title: "Fête & Sourires",
    desc: "Uplifting pop moderne, anniversaires & moments de joie",
    previewUrl: "https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3",
    intensity: "Dynamique",
  },
  {
    id: "none",
    title: "Sans musique (son original uniquement)",
    desc: "Conserve uniquement les voix et bruits réels de vos vidéos",
    previewUrl: "",
    intensity: "Naturelle",
  },
];

function EditEasyPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [items, setItems] = useState<UploadItem[]>([
    { id: "1", type: "photo", url: hero, name: "vacances_plage.jpg" },
    { id: "2", type: "photo", url: moments, name: "portrait_famille.jpg" },
    { id: "3", type: "video", url: scan, name: "clip_mariage_danse.mp4", durationSec: 18 },
  ]);
  const [preserveOrder, setPreserveOrder] = useState(true);
  const [selectedMusic, setSelectedMusic] = useState("auto");
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Options
  const [pace, setPace] = useState<"dynamic" | "full">("dynamic");
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square">("portrait");
  const [photoDuration, setPhotoDuration] = useState(3.0);

  // Render simulation
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatusText, setRenderStatusText] = useState("");
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);

  // Music playback preview
  const togglePlayMusic = (id: string, url: string) => {
    if (!url) return;
    if (playingTrack === id) {
      audioRef.current?.pause();
      setPlayingTrack(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
      setPlayingTrack(id);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newItems: UploadItem[] = files.map((f, i) => ({
      id: `${Date.now()}_${i}`,
      type: f.type.startsWith("video") ? "video" : "photo",
      url: URL.createObjectURL(f),
      name: f.name,
      durationSec: f.type.startsWith("video") ? 15 : undefined,
    }));
    setItems((prev) => [...prev, ...newItems]);
    toast.success(`${files.length} fichier(s) ajouté(s)`);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const startRender = () => {
    setCurrentStep(4);
    setRenderProgress(0);
    const stages = [
      { progress: 25, text: "Analyse et calibrage des photos et vidéos..." },
      { progress: 55, text: "Découpe intelligente et calage sur le tempo musical..." },
      { progress: 85, text: "Étalonnage colorimétrique et encodage MP4 Haute Définition..." },
      { progress: 100, text: "Finalisation de votre film Mémora..." },
    ];

    let currentStageIndex = 0;
    const interval = setInterval(() => {
      if (currentStageIndex < stages.length) {
        const stage = stages[currentStageIndex];
        if (stage) {
          setRenderProgress(stage.progress);
          setRenderStatusText(stage.text);
        }
        currentStageIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setCurrentStep(5);
          toast.success("Votre film Mémora est prêt !");
        }, 800);
      }
    }, 1200);
  };

  const sendToShop = () => {
    // Send render directly into order draft
    toast.success("Vidéo ajoutée à votre commande !");
    navigate({
      to: "/commander",
      search: {
        format: "10x15",
        stage: "photo",
      },
    });
  };

  return (
    <div className="min-h-screen bg-background pb-32 pt-28">
      <audio ref={audioRef} onEnded={() => setPlayingTrack(null)} />

      {/* Header */}
      <section className="container-x text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-sand/30 px-3.5 py-1 text-xs uppercase tracking-widest text-deep-brown font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Mémora Studio · Montage Automatique Gratuit</span>
        </div>
        <h1 className="mt-4 font-serif text-4xl sm:text-5xl md:text-6xl">
          Ne laissez pas vos souvenirs dans votre téléphone.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Transformez vos moments préférés en un film souvenir émouvant : importez vos photos et vidéos en vrac, choisissez une musique et donnez vie à votre tirage MÉMORA.
        </p>

        {/* Stepper Tabs */}
        <div className="mt-10 grid grid-cols-4 gap-1 sm:flex sm:items-center sm:justify-center sm:gap-4 border-b border-border pb-6 text-[11px] sm:text-sm font-medium">
          {[
            { step: 1, label: "1. Fichiers", icon: UploadCloud },
            { step: 2, label: "2. Musique", icon: Music },
            { step: 3, label: "3. Options", icon: Sliders },
            { step: 5, label: "4. Résultat", icon: Film },
          ].map((s) => {
            const Icon = s.icon;
            const active = currentStep === s.step;
            const completed = currentStep > s.step;
            return (
              <button
                key={s.step}
                onClick={() => {
                  if (s.step < currentStep || currentStep === 5) {
                    setCurrentStep(s.step as any);
                  }
                }}
                disabled={currentStep === 4}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1 py-2 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 transition-all ${
                  active
                    ? "bg-foreground text-background shadow-xs"
                    : completed
                    ? "bg-cream text-charcoal hover:bg-sand/40"
                    : "text-muted-foreground opacity-60"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* CONTENT ACCORDION STEPS */}
      <div className="container-x mt-10 max-w-4xl">
        {/* STEP 1: UPLOAD */}
        {currentStep === 1 && (
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <h2 className="font-serif text-3xl">Ajoutez vos photos & clips vidéo</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Glissez tous vos souvenirs. Nous nous chargeons de la transition et de l'harmonie.
                </p>
              </div>
              <button
                onClick={() => setIsMobileModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-cream px-4 py-2 text-xs uppercase tracking-wider text-charcoal hover:bg-sand transition-colors shrink-0"
              >
                <Smartphone className="h-4 w-4 text-deep-brown" />
                <span>Depuis mon téléphone</span>
              </button>
            </div>

            {/* Dropzone */}
            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-taupe/40 bg-cream/30 p-10 text-center transition-colors hover:bg-cream/70">
              <UploadCloud className="h-10 w-10 text-deep-brown/70" />
              <p className="mt-3 text-base font-medium">Déposez vos fichiers ici, ou cliquez pour parcourir</p>
              <p className="mt-1 text-xs text-muted-foreground">Photos (JPG, PNG, HEIC) et vidéos (MP4, MOV, WebM)</p>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {/* Items Gallery */}
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {items.length} média(s) sélectionné(s)
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveOrder}
                    onChange={(e) => setPreserveOrder(e.target.checked)}
                    className="accent-deep-brown"
                  />
                  <span>Respecter l'ordre d'importation</span>
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {items.map((item, idx) => (
                  <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-cream shadow-xs">
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-md bg-charcoal/70 px-1.5 py-0.5 text-[10px] text-ivory">
                      {item.type === "video" ? `Vidéo ${item.durationSec ?? 15}s` : "Photo"}
                    </span>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="absolute right-2 top-2 rounded-full bg-charcoal/80 p-1 text-ivory opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute bottom-1 left-2 text-[10px] text-ivory drop-shadow-md">
                      #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="mt-10 flex justify-end border-t border-border pt-6">
              <button
                onClick={() => {
                  if (items.length === 0) {
                    toast.error("Veuillez ajouter au moins une photo ou une vidéo");
                    return;
                  }
                  setCurrentStep(2);
                }}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
              >
                <span>Étape suivante : Musique</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: MUSIC */}
        {currentStep === 2 && (
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <h2 className="font-serif text-3xl">Choisissez l'ambiance musicale</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                La musique donne tout son rythme et son émotion à votre film Mémora.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {MUSIC_STYLES.map((track) => {
                const isSelected = selectedMusic === track.id;
                const isPlaying = playingTrack === track.id;

                return (
                  <div
                    key={track.id}
                    onClick={() => setSelectedMusic(track.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-4.5 transition-all ${
                      isSelected
                        ? "border-deep-brown bg-sand/15 shadow-xs"
                        : "border-border hover:bg-cream/40"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-deep-brown text-ivory" : "bg-cream text-charcoal"}`}>
                        <Music className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-charcoal text-sm">{track.title}</p>
                        <p className="text-xs text-muted-foreground">{track.desc}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {track.previewUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlayMusic(track.id, track.previewUrl);
                          }}
                          className="rounded-full bg-cream p-2 text-charcoal hover:bg-sand transition-colors"
                          aria-label={isPlaying ? "Pause" : "Écouter l'extrait"}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                      )}
                      <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? "border-deep-brown bg-deep-brown text-ivory" : "border-border"}`}>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => setCurrentStep(1)}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Retour
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
              >
                <span>Étape suivante : Options</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OPTIONS */}
        {currentStep === 3 && (
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-sm animate-in fade-in">
            <div className="border-b border-border pb-6">
              <h2 className="font-serif text-3xl">Style & options de montage</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Personnalisez le rythme et le cadrage pour un rendu sur-mesure.
              </p>
            </div>

            <div className="mt-8 space-y-8">
              {/* Pace */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rythme du montage
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPace("dynamic")}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      pace === "dynamic" ? "border-deep-brown bg-sand/20 shadow-xs" : "border-border hover:bg-cream/30"
                    }`}
                  >
                    <p className="font-semibold text-charcoal">Dynamique & Rythmé (Recommandé)</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Extraits sélectionnés sur les temps forts musicaux. Durée estimée ~1 à 2 min.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPace("full")}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      pace === "full" ? "border-deep-brown bg-sand/20 shadow-xs" : "border-border hover:bg-cream/30"
                    }`}
                  >
                    <p className="font-semibold text-charcoal">Intégral & Contemplatif</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conserve vos clips vidéo en entier avec des transitions douces.
                    </p>
                  </button>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Format vidéo (Orientation)
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { id: "portrait", label: "Portrait 9:16", desc: "Idéal pour smartphone" },
                    { id: "landscape", label: "Paysage 16:9", desc: "Format cinéma classique" },
                    { id: "square", label: "Carré 1:1", desc: "Parfait pour cartes carrées" },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOrientation(o.id as any)}
                      className={`rounded-xl border p-3.5 text-center transition-all ${
                        orientation === o.id ? "border-deep-brown bg-sand/20 shadow-xs" : "border-border hover:bg-cream/30"
                      }`}
                    >
                      <p className="text-xs font-semibold">{o.label}</p>
                      <p className="text-[11px] text-muted-foreground">{o.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo display duration */}
              <div>
                <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Durée d'affichage par photo</span>
                  <span className="text-charcoal font-medium">{photoDuration} secondes</span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={6}
                  step={0.5}
                  value={photoDuration}
                  onChange={(e) => setPhotoDuration(parseFloat(e.target.value))}
                  className="mt-3 w-full accent-deep-brown"
                />
              </div>
            </div>

            {/* Launch render */}
            <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => setCurrentStep(2)}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Retour
              </button>
              <button
                onClick={startRender}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <Sparkles className="h-4 w-4 text-sand" />
                <span>Générer mon film Mémora (Gratuit)</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: PROGRESS BAR SIMULATION */}
        {currentStep === 4 && (
          <div className="rounded-2xl border border-border bg-background p-10 text-center shadow-lg animate-in fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand/30">
              <Loader2 className="h-8 w-8 animate-spin text-deep-brown" />
            </div>
            <h2 className="mt-6 font-serif text-3xl">Génération de votre montage en cours...</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{renderStatusText}</p>

            <div className="mx-auto mt-8 max-w-md">
              <div className="h-3 w-full overflow-hidden rounded-full bg-cream">
                <div
                  className="h-full bg-deep-brown transition-all duration-700 ease-out"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-deep-brown">{renderProgress}%</p>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Ne fermez pas cette page, le rendu ne prend que quelques secondes.
            </p>
          </div>
        )}

        {/* STEP 5: FINAL RESULT */}
        {currentStep === 5 && (
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-10 shadow-lg animate-in zoom-in-95">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sand/30 text-deep-brown">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-serif text-3xl sm:text-4xl">Votre film Mémora est prêt !</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Durée totale : 1 min 24s · {items.length} moments immortalisés avec musique synchronisée
              </p>
            </div>

            {/* Video preview in smartphone mockup */}
            <div className="mt-8 flex justify-center">
              <div className="relative w-full max-w-[280px] overflow-hidden rounded-[36px] border-8 border-charcoal bg-black shadow-2xl">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 h-4 w-20 rounded-full bg-charcoal/80 z-20" />
                <div className="relative aspect-[9/16] overflow-hidden">
                  <img src={hero} alt="Montage preview" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-charcoal/30">
                    <button className="flex h-14 w-14 items-center justify-center rounded-full bg-ivory text-charcoal shadow-lg hover:scale-105 transition-transform">
                      <Play className="h-6 w-6 ml-1" fill="currentColor" />
                    </button>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-charcoal/70 p-2.5 text-center text-ivory text-xs backdrop-blur">
                    <p className="font-serif">Leila & Sami — Nos plus beaux jours</p>
                    <p className="text-[10px] text-sand">MÉMORA ÉDITION VIDÉO</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={sendToShop}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <Sparkles className="h-4 w-4 text-sand" />
                <span>Envoyer vers ma commande Mémora</span>
              </button>
              <button
                onClick={() => {
                  toast.success("Téléchargement du MP4 démarré");
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-sm border border-border px-6 py-4 text-xs uppercase tracking-widest text-charcoal hover:bg-cream transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Télécharger le MP4</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <MobileUploadModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        onVideoReceived={(data) => {
          setItems((prev) => [
            ...prev,
            {
              id: `${Date.now()}`,
              type: "video",
              url: data.url,
              name: data.name,
              durationSec: data.durationSec,
            },
          ]);
        }}
      />
    </div>
  );
}
