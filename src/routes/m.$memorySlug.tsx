import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Play, Volume2, VolumeX, X } from "lucide-react";
import { getMemoryBySlug } from "@/lib/supabase";
import { DEMO_PHOTO_URL, DEMO_VIDEO_URL } from "@/lib/demo-media";
import { useT } from "@/i18n";
import { MemoryLoading } from "@/components/site/MemoryLoading";

type Memory = {
  title: string;
  videoUrl: string;
  coverPhoto?: string | undefined;
  message: string;
};

const DEMO_MEMORIES: Record<string, Memory> = {
  "demo-leila-and-sami": {
    // Le titre et le message restent neutres : ils doivent coller à la vidéo de démo
    title: "Un message pour toi",
    videoUrl: DEMO_VIDEO_URL,
    coverPhoto: DEMO_PHOTO_URL,
    message:
      "Je voulais que tu puisses réécouter ce message quand tu veux. Pose ton téléphone sur la photo, et je suis là.",
  },
  "demo-famille": {
    title: "Notre Famille",
    videoUrl: DEMO_VIDEO_URL,
    coverPhoto: DEMO_PHOTO_URL,
    message: "Parce que nos plus beaux rires ne doivent jamais disparaître dans les téléphones.",
  },
};

export const Route = createFileRoute("/m/$memorySlug")({
  // Page privée (noindex) : rendue dans le navigateur. Le serveur envoie tout de
  // suite l'écran d'attente MÉMORA au lieu d'attendre Supabase avant de répondre.
  ssr: false,
  pendingComponent: () => <MemoryLoading />,
  pendingMs: 0,
  pendingMinMs: 400,
  loader: async ({ params }): Promise<{ memory: Memory }> => {
    const demo = DEMO_MEMORIES[params.memorySlug];
    if (demo) return { memory: demo };

    const record = await getMemoryBySlug(params.memorySlug);
    if (!record) throw notFound();

    const mediaUrl = `/api/memory-media?slug=${encodeURIComponent(params.memorySlug)}`;
    return {
      memory: {
        title: record.title,
        videoUrl: mediaUrl,
        coverPhoto: record.has_photo ? `${mediaUrl}&kind=photo` : undefined,
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
  notFoundComponent: MemoryNotFound,
  component: MemoryPlaybackPage,
});

function MemoryNotFound() {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-ivory">
      <h1 className="font-serif text-3xl">{t.memory.notFound}</h1>
      <Link
        to="/"
        className="mt-6 rounded-full bg-sand px-6 py-2.5 text-xs uppercase tracking-widest text-charcoal"
      >
        {t.common.home}
      </Link>
    </div>
  );
}

function MemoryPlaybackPage() {
  const t = useT();
  const { memory } = Route.useLoaderData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  // L'écran MÉMORA reste affiché tant que la vidéo ne peut pas encore jouer
  const [isReady, setIsReady] = useState(false);

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
        onCanPlay={() => setIsReady(true)}
        onPlaying={() => setIsReady(true)}
        onPlay={() => setIsPaused(false)}
        onPause={() => setIsPaused(true)}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
      />

      <MemoryLoading hidden={isReady || hasError} />

      {isPaused && !hasError && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={t.memory.play}
          className="absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <span className="rounded-full bg-ivory/90 p-5 text-charcoal">
            <Play className="ml-1 h-8 w-8 fill-current" />
          </span>
        </button>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="font-serif text-xl">{t.memory.unavailable}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 rounded-full bg-sand px-6 py-2.5 text-xs uppercase tracking-widest text-charcoal"
          >
            {t.memory.retry}
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
            <span>{isMuted ? t.memory.soundOn : t.memory.soundOff}</span>
          </button>
          {memory.message && (
            <button
              type="button"
              onClick={() => setIsMessageOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/60 px-4 text-xs font-medium backdrop-blur-sm"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{t.memory.message}</span>
            </button>
          )}
        </div>
      )}

      {isMessageOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.memory.message}
          className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-charcoal p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
        >
          <button
            type="button"
            onClick={() => setIsMessageOpen(false)}
            aria-label={t.memory.close}
            className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center text-ivory/70"
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
            {t.memory.create}
          </Link>
        </div>
      )}
    </div>
  );
}
