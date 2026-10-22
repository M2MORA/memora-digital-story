import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize,
  Download,
  Share2,
  Sparkles,
  Heart,
  Smartphone,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";
import hero from "@/assets/hero.jpg";
import moments from "@/assets/product-moments.jpg";
import box from "@/assets/product-box.jpg";
import scan from "@/assets/scan.jpg";
import { getMemoryBySlug } from "@/lib/supabase";

type Memory = {
  slug: string;
  title: string;
  subtitle: string;
  videoUrl: string;
  coverPhoto: string;
  author: string;
  recipient: string;
  message: string;
  date: string;
};

const MEMORIES: Record<string, Memory> = {
  "demo-leila-and-sami": {
    slug: "demo-leila-and-sami",
    title: "Leila & Sami",
    subtitle: "Le jour où la mer s'est arrêtée · Sidi Bou Saïd",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    coverPhoto: moments,
    author: "Leila",
    recipient: "Sami",
    message:
      "Sami, je voulais garder ce souvenir vivant dans tes mains. À chaque fois que ton téléphone touchera cette photo, j'espère que tu réentendras le bruit des vagues et notre rire ce jour-là.",
    date: "14 Juin 2026",
  },
  "demo-famille": {
    slug: "demo-famille",
    title: "Notre Famille",
    subtitle: "Rassemblement d'été · Depuis 1978",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    coverPhoto: scan,
    author: "Yasmine",
    recipient: "À toute la famille",
    message: "Parce que nos plus beaux rires ne doivent jamais disparaître dans les téléphones.",
    date: "Août 2026",
  },
};

export const Route = createFileRoute("/m/$memorySlug")({
  loader: async ({ params }) => {
    const dbRecord = await getMemoryBySlug(params.memorySlug);
    if (dbRecord) {
      const memory: Memory = {
        slug: dbRecord.slug,
        title: dbRecord.title,
        subtitle: dbRecord.description || "Souvenir connecté MÉMORA",
        videoUrl: dbRecord.video_url,
        coverPhoto: dbRecord.photo_url || moments,
        author: "MÉMORA",
        recipient: "Destinataire",
        message: dbRecord.description || "Approchez votre smartphone. Le souvenir prend vie instantanément.",
        date: new Date(dbRecord.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      };
      return { memory };
    }

    const memory = MEMORIES[params.memorySlug] ?? MEMORIES["demo-leila-and-sami"];
    return { memory };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.memory
          ? `${loaderData.memory.title} — Votre Souvenir MÉMORA`
          : "Souvenir — MÉMORA",
      },
      {
        name: "description",
        content: "Approchez votre smartphone. Le souvenir prend vie instantanément.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal px-6 text-center text-ivory">
      <h1 className="font-serif text-4xl">Ce souvenir MÉMORA n'est pas disponible</h1>
      <Link to="/" className="mt-6 rounded-full bg-sand px-6 py-2.5 text-xs uppercase tracking-widest text-charcoal">
        Retour à l'accueil
      </Link>
    </div>
  ),
  component: MemoryPlaybackPage,
});

function MemoryPlaybackPage() {
  const loaderData = Route.useLoaderData();
  const memory = loaderData?.memory ?? MEMORIES["demo-leila-and-sami"]!;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLandscape, setIsLandscape] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      setIsLandscape(v.videoWidth >= v.videoHeight);
    }
    if (v.duration && !isNaN(v.duration)) {
      setVideoDuration(v.duration);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime || 0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * videoDuration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleSound = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
      if (videoRef.current.muted) {
        toast("Son coupé");
      } else {
        toast.success("Son activé !");
      }
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      }
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: memory.title, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié dans le presse-papiers !");
    }
  };

  const progressPercent = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  return (
    <div className="min-h-screen bg-charcoal text-ivory selection:bg-sand selection:text-charcoal flex flex-col justify-between relative overflow-x-hidden">
      {/* Ambient background glow for luxury depth */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[550px] w-[550px] sm:w-[850px] rounded-full bg-radial from-sand/15 via-sand/5 to-transparent blur-3xl opacity-70" />

      {/* Discreet Header */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-ivory/10 backdrop-blur-md bg-charcoal/80 sticky top-0 z-40">
        <Link to="/" className="font-serif text-lg sm:text-xl tracking-[0.28em] text-ivory hover:text-sand transition-colors">
          MÉMORA
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-ivory/10 bg-ivory/5 px-3 py-1 text-[10px] tracking-widest uppercase text-sand/90 backdrop-blur-sm">
            <Smartphone className="h-3 w-3 text-sand" />
            <span>NFC Connecté</span>
          </span>
          <button
            onClick={handleShare}
            aria-label="Partager ce souvenir"
            className="flex items-center gap-1.5 rounded-full border border-ivory/15 bg-ivory/10 px-3.5 py-1.5 text-xs text-sand hover:bg-ivory/20 hover:border-sand/40 transition-all"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Partager</span>
          </button>
        </div>
      </header>

      {/* Main Playback Area - Fully flexible container */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 flex flex-col justify-center items-center relative z-10">
        {/* Memory Title */}
        <div className="text-center mb-6 w-full max-w-2xl px-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-sand/30 bg-sand/10 px-3.5 py-1 text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-sand shadow-xs">
            <Sparkles className="h-3 w-3 text-sand" />
            <span>{memory.date} · SOUVENIR SCELLÉ NFC</span>
          </div>
          <h1 className="mt-3 font-serif text-3xl sm:text-5xl md:text-6xl text-ivory tracking-tight leading-tight drop-shadow-sm">
            {memory.title}
          </h1>
          {memory.subtitle && (
            <p className="mt-2 text-xs sm:text-sm text-taupe font-serif italic">
              {memory.subtitle}
            </p>
          )}
        </div>

        {/* Video Player Box - Adapts dynamically to video's natural real proportions */}
        <div
          className={`relative mx-auto w-full transition-all duration-300 ease-out overflow-hidden rounded-2xl sm:rounded-3xl bg-black/95 shadow-luxury-lg ring-1 ring-ivory/15 border border-ivory/10 ${
            isLandscape ? "max-w-3xl sm:max-w-4xl" : "max-w-xs sm:max-w-sm md:max-w-md"
          }`}
        >
          {/* Natural Real-size Video */}
          <video
            ref={videoRef}
            src={memory.videoUrl}
            autoPlay
            playsInline
            loop
            muted={isMuted}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlay}
            className="w-full h-auto max-h-[75vh] object-contain mx-auto block cursor-pointer"
          />

          {/* Pause overlay icon in center when paused */}
          {!isPlaying && (
            <button
              onClick={togglePlay}
              aria-label="Reprendre la lecture"
              className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs transition-opacity"
            >
              <div className="rounded-full bg-sand/95 text-charcoal p-5 sm:p-6 shadow-luxury hover:bg-ivory hover:scale-105 active:scale-95 transition-all">
                <Play className="h-8 w-8 fill-current ml-1" />
              </div>
            </button>
          )}

          {/* Floating Controls Overlay with timeline progress */}
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-charcoal/95 via-charcoal/60 to-transparent p-3 sm:p-4 flex flex-col gap-2.5">
            {/* Timeline Seek Bar */}
            <div
              onClick={handleSeek}
              className="group relative h-2 w-full cursor-pointer rounded-full bg-ivory/20 flex items-center transition-all hover:h-2.5"
            >
              <div
                className="h-full rounded-full bg-linear-to-r from-sand to-champagne transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
              <span className="sr-only">Barre de progression</span>
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between text-xs text-ivory">
              {/* Left: Play/Pause and Time */}
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex items-center gap-1.5 rounded-full bg-charcoal/85 border border-ivory/15 px-3 py-1.5 font-medium text-ivory backdrop-blur-md hover:bg-charcoal hover:border-sand/40 transition-colors"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  <span className="hidden sm:inline">{isPlaying ? "Pause" : "Lecture"}</span>
                </button>
                <span className="text-[11px] text-taupe font-mono">
                  {formatTime(currentTime)} / {formatTime(videoDuration)}
                </span>
              </div>

              {/* Right: Sound & Fullscreen */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSound}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-md transition-all ${
                    isMuted
                      ? "bg-sand text-charcoal hover:bg-ivory shadow-luxury animate-pulse"
                      : "bg-charcoal/85 border border-ivory/15 text-ivory hover:border-sand/40"
                  }`}
                >
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{isMuted ? "Activer le son" : "Couper"}</span>
                </button>

                <button
                  onClick={handleFullscreen}
                  aria-label="Plein écran"
                  className="rounded-full bg-charcoal/85 border border-ivory/15 p-1.5 text-ivory hover:border-sand/40 backdrop-blur-md transition-colors"
                  title="Plein écran"
                >
                  <Maximize className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card Note from author - Luxury stationery card */}
        {memory.message && (
          <div className="mx-auto mt-8 w-full max-w-xl rounded-2xl sm:rounded-3xl border border-ivory/15 bg-linear-to-b from-ivory/[0.08] to-ivory/[0.03] p-6 sm:p-8 backdrop-blur-md text-center shadow-luxury">
            <p className="eyebrow text-sand text-[10px] sm:text-[11px] uppercase tracking-[0.25em]">
              Mot imprimé au dos du tirage
            </p>
            <p className="mt-3 font-serif text-lg sm:text-2xl italic text-ivory/95 leading-relaxed">
              “{memory.message}”
            </p>
            {memory.author && (
              <p className="mt-4 text-[10px] sm:text-xs tracking-widest uppercase text-taupe font-medium">
                De la part de <span className="text-sand">{memory.author}</span>
                {memory.recipient ? ` · Pour ${memory.recipient}` : ""}
              </p>
            )}
          </div>
        )}

        {/* Viral loop: Create your own Mémora */}
        <div className="mx-auto mt-10 w-full max-w-xl rounded-2xl sm:rounded-3xl border border-sand/30 bg-linear-to-b from-sand/15 via-sand/5 to-charcoal/90 p-6 sm:p-8 text-center shadow-luxury backdrop-blur-md">
          <Sparkles className="mx-auto h-5 w-5 text-sand mb-2" />
          <h3 className="font-serif text-xl sm:text-2xl text-ivory">Les instants passent. Les souvenirs restent.</h3>
          <p className="mt-2 text-xs sm:text-sm text-ivory/70 max-w-md mx-auto leading-relaxed">
            Vos plus belles vidéos méritent mieux qu'un écran éphémère. Offrez à ceux qui comptent un souvenir physique précieux à toucher et revivre à l'infini.
          </p>
          <Link
            to="/commander"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-sand px-6 py-3 text-xs uppercase tracking-[0.2em] text-charcoal font-semibold hover:bg-ivory transition-all shadow-luxury hover:shadow-luxury-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Créer un MÉMORA</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-taupe border-t border-ivory/10">
        MÉMORA · Make Memories Last · Des photos à toucher, des souvenirs à vivre
      </footer>
    </div>
  );
}
