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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: memory.title, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié dans le presse-papiers !");
    }
  };

  return (
    <div className="min-h-screen bg-charcoal text-ivory selection:bg-sand selection:text-charcoal flex flex-col justify-between">
      {/* Discreet Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-ivory/10 backdrop-blur-md bg-charcoal/80 sticky top-0 z-40">
        <Link to="/" className="font-serif text-xl tracking-[0.25em] text-ivory">
          MÉMORA
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            aria-label="Partager ce souvenir"
            className="flex items-center gap-1.5 rounded-full bg-ivory/10 px-3.5 py-1.5 text-xs text-sand hover:bg-ivory/20 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Partager</span>
          </button>
        </div>
      </header>

      {/* Main Playback Area */}
      <main className="container-x max-w-4xl py-8 flex-1 flex flex-col justify-center">
        {/* Memory Title */}
        <div className="text-center mb-6">
          <p className="eyebrow text-sand">{memory.date} · MÉMORA SOUVENIR NFC</p>
          <h1 className="mt-2 font-serif text-4xl sm:text-6xl text-ivory tracking-tight">{memory.title}</h1>
          <p className="mt-2 text-sm text-taupe">{memory.subtitle}</p>
        </div>

        {/* Video Player Box */}
        <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-black shadow-2xl border border-ivory/15">
          <video
            ref={videoRef}
            src={memory.videoUrl}
            autoPlay
            playsInline
            loop
            muted={isMuted}
            className="aspect-video w-full object-cover"
          />

          {/* Floating Controls Overlay */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4 bg-linear-to-t from-charcoal/90 via-charcoal/40 to-transparent">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="flex items-center gap-2 rounded-full bg-charcoal/80 px-3.5 py-2 text-xs font-medium text-ivory backdrop-blur hover:bg-charcoal"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              <span>{isPlaying ? "Pause" : "Lecture"}</span>
            </button>

            {/* Tap for sound button */}
            <button
              onClick={toggleSound}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider backdrop-blur transition-all ${
                isMuted
                  ? "bg-sand text-charcoal hover:bg-sand/90 animate-pulse"
                  : "bg-charcoal/80 text-ivory hover:bg-charcoal"
              }`}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span>{isMuted ? "Activer le son" : "Couper le son"}</span>
            </button>
          </div>
        </div>

        {/* Card Note from author */}
        <div className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-ivory/15 bg-ivory/5 p-6 sm:p-8 backdrop-blur-xs text-center">
          <p className="eyebrow text-sand">Mot imprimé au dos</p>
          <p className="mt-4 font-serif text-xl sm:text-2xl italic text-ivory/90 leading-relaxed">
            “{memory.message}”
          </p>
          <p className="mt-4 text-xs tracking-widest uppercase text-taupe">
            De la part de {memory.author} · Pour {memory.recipient}
          </p>
        </div>

        {/* Viral loop: Create your own Mémora */}
        <div className="mx-auto mt-12 w-full max-w-xl rounded-2xl border border-sand/30 bg-sand/10 p-6 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-sand mb-2" />
          <h3 className="font-serif text-2xl text-ivory">Les instants passent. Les souvenirs restent.</h3>
          <p className="mt-1 text-xs text-ivory/70 max-w-md mx-auto">
            Vos plus belles photos méritent mieux qu'un écran. Offrez à ceux que vous aimez un souvenir physique à toucher et revivre pour toujours.
          </p>
          <Link
            to="/commander"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-sand px-6 py-3 text-xs uppercase tracking-widest text-charcoal font-semibold hover:bg-ivory transition-colors shadow-md"
          >
            <span>Créer un MÉMORA</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[11px] uppercase tracking-[0.25em] text-taupe border-t border-ivory/10">
        MÉMORA · Make Memories Last · Des photos à toucher, des souvenirs à vivre
      </footer>
    </div>
  );
}
