import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Play, Volume2, VolumeX, X } from "lucide-react";
import moments from "@/assets/product-moments.jpg";
import scan from "@/assets/scan.jpg";
import { getMemoryBySlug } from "@/lib/supabase";
import { resolveMemoryMediaSrc } from "@/lib/memory-video";

type Memory = {
  title: string;
  videoUrl: string;
  coverPhoto?: string | undefined;
  message: string;
};

const DEMO_MEMORIES: Record<string, Memory> = {
  "demo-leila-and-sami": {
    title: "Leila & Sami",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    coverPhoto: moments,
    message:
      "Sami, je voulais garder ce souvenir vivant dans tes mains. À chaque fois que ton téléphone touchera cette photo, j'espère que tu réentendras le bruit des vagues et notre rire ce jour-là.",
  },
  "demo-famille": {
    title: "Notre Famille",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    coverPhoto: scan,
    message: "Parce que nos plus beaux rires ne doivent jamais disparaître dans les téléphones.",
  },
};

export const Route = createFileRoute("/m/$memorySlug")({
  loader: async ({ params }): Promise<{ memory: Memory }> => {
    const demo = DEMO_MEMORIES[params.memorySlug];
    if (demo) return { memory: demo };

    const record = await getMemoryBySlug(params.memorySlug);
    if (!record) throw notFound();

    return {
      memory: {
        title: record.title,
        videoUrl: resolveMemoryMediaSrc(record.video_url),
        coverPhoto: record.photo_url ? resolveMemoryMediaSrc(record.photo_url) : undefined,
        message: record.description ?? "",
      },
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.memory
          ? `${loaderData.memory.title} — Votre Souvenir MÉMORA`
          : "Souvenir — MÉMORA",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-ivory">
      <h1 className="font-serif text-3xl">Ce souvenir MÉMORA n'est pas disponible</h1>
      <Link
        to="/"
        className="mt-6 rounded-full bg-sand px-6 py-2.5 text-xs uppercase tracking-widest text-charcoal"
      >
        Retour à l'accueil
      </Link>
    </div>
  ),
  component: MemoryPlaybackPage,
});

function MemoryPlaybackPage() {
  const { memory } = Route.useLoaderData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);

  // React ne pose pas toujours l'attribut muted côté serveur, et iOS l'exige pour démarrer seul
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => setIsPaused(true));
  }, [memory.videoUrl]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => setIsPaused(true));
    } else {
      video.pause();
    }
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (video.paused) video.play().catch(() => setIsPaused(true));
  };

  const retry = () => {
    setHasError(false);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    video.play().catch(() => setIsPaused(true));
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-ivory">
      <video
        ref={videoRef}
        src={memory.videoUrl}
        poster={memory.coverPhoto}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onClick={togglePlayback}
        onPlay={() => setIsPaused(false)}
        onPause={() => setIsPaused(true)}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
      />

      {isPaused && !hasError && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label="Lancer la vidéo"
          className="absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <span className="rounded-full bg-ivory/90 p-5 text-charcoal">
            <Play className="ml-1 h-8 w-8 fill-current" />
          </span>
        </button>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="font-serif text-xl">Cette vidéo n'est pas disponible pour le moment.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 rounded-full bg-sand px-6 py-2.5 text-xs uppercase tracking-widest text-charcoal"
          >
            Réessayer
          </button>
        </div>
      )}

      {!hasError && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={toggleSound}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/60 px-4 text-xs font-medium backdrop-blur-sm"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span>{isMuted ? "Activer le son" : "Couper le son"}</span>
          </button>
          {memory.message && (
            <button
              type="button"
              onClick={() => setIsMessageOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/60 px-4 text-xs font-medium backdrop-blur-sm"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Le message</span>
            </button>
          )}
        </div>
      )}

      {isMessageOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Le message"
          className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-charcoal p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
        >
          <button
            type="button"
            onClick={() => setIsMessageOpen(false)}
            aria-label="Fermer le message"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-ivory/70"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="mx-auto mt-6 max-w-md font-serif text-lg italic leading-relaxed">
            “{memory.message}”
          </p>
          <Link
            to="/commander"
            className="mt-6 inline-flex rounded-full bg-sand px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-charcoal"
          >
            Créer un MÉMORA
          </Link>
        </div>
      )}
    </div>
  );
}
