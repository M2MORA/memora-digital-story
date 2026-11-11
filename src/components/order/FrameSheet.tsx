import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { BottomSheet, OrderCta } from "./OrderChrome";

/** Côté le plus court conseillé pour une carte 10 × 15 nette (≈ 200 ppp) */
const SHARP_SHORT_SIDE = 1000;
const THUMB_WIDTH = 160;
const SEEK_TIMEOUT_MS = 4000;

type Thumb = { time: number; url: string };

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${tenth}`;
}

/** Résout quand la vidéo a fini de se placer à `time` (ou après un délai de sécurité) */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, SEEK_TIMEOUT_MS);
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

/**
 * Sur iPhone, Safari ne charge ni n'affiche aucune image d'une vidéo tant
 * qu'elle n'a pas été lue une fois : on la lance (sans le son) puis on la met
 * en pause aussitôt. Sans ça, l'écran reste noir et rien n'est capturable.
 */
async function primeVideo(video: HTMLVideoElement) {
  video.muted = true;
  try {
    await video.play();
  } catch {
    // Lecture refusée : on compte sur le chargement normal
  }
  video.pause();
}

/**
 * Choisir une image dans sa vidéo : une bande de vignettes pour repérer le bon
 * moment d'un coup d'œil, puis le curseur pour ajuster image par image.
 */
export function FrameSheet({
  videoUrl,
  duration,
  onCapture,
  onClose,
}: {
  videoUrl: string;
  duration: number;
  onCapture: (file: File) => Promise<void> | void;
  onClose: () => void;
}) {
  const f = useT().order.frame;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(duration);
  const [ready, setReady] = useState(false);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [lowRes, setLowRes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = Math.max(0.1, length || duration);

  // Grande vidéo : prête à afficher une image, placée sur un premier moment
  const handleMetadata = async () => {
    const video = videoRef.current;
    if (!video) return;
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    setLength(d);
    setLowRes(Math.min(video.videoWidth, video.videoHeight) < SHARP_SHORT_SIDE);
    await primeVideo(video);
    const start = Math.min(d * 0.1, 0.5);
    await seekTo(video, start);
    setTime(start);
    setReady(true);
  };

  // Filet de sécurité iPhone : si rien n'est chargé après 1 s, on force la lecture
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const video of [videoRef.current, thumbVideoRef.current]) {
        if (video && video.readyState < 1) void primeVideo(video);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [videoUrl]);

  // Vignettes, tirées d'une seconde vidéo cachée pour ne pas bouger la grande
  useEffect(() => {
    const video = thumbVideoRef.current;
    if (!video) return;
    let cancelled = false;

    const build = async () => {
      const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
      if (!d || !video.videoWidth) return;
      await primeVideo(video);
      // Une vignette par demi-seconde, entre 4 et 8 : une vidéo de 4 s en donne 8
      const count = Math.min(8, Math.max(4, Math.round(d * 2)));
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_WIDTH;
      canvas.height = Math.round((THUMB_WIDTH * video.videoHeight) / video.videoWidth);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const result: Thumb[] = [];
      for (let i = 0; i < count; i++) {
        if (cancelled) return;
        const t = ((i + 0.5) * d) / count;
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        result.push({ time: t, url: canvas.toDataURL("image/jpeg", 0.7) });
        setThumbs([...result]);
      }
    };

    const onReady = () => void build().catch(() => {});
    if (video.readyState >= 1) onReady();
    else video.addEventListener("loadedmetadata", onReady, { once: true });
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onReady);
    };
  }, [videoUrl, duration]);

  const seek = (seconds: number) => {
    const t = Math.min(Math.max(0, seconds), max);
    setTime(t);
    const video = videoRef.current;
    if (video) video.currentTime = t;
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError(f.notReady);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // L'image affichée doit correspondre au moment choisi avant la capture
      if (video.seeking) await seekTo(video, time);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.95),
      );
      await onCapture(
        new File([blob], `image_video_${video.currentTime.toFixed(1)}s.jpg`, {
          type: "image/jpeg",
        }),
      );
    } catch {
      setError(f.failed);
    } finally {
      setBusy(false);
    }
  };

  // Vignette la plus proche du moment choisi, pour la mettre en évidence
  const activeThumb = thumbs.reduce<number>(
    (best, th, i) =>
      best < 0 || Math.abs(th.time - time) < Math.abs((thumbs[best]?.time ?? 0) - time) ? i : best,
    -1,
  );

  return (
    <BottomSheet titleId="frame-title" title={f.title} subtitle={f.sub} onClose={onClose}>
      <div className="relative flex h-[250px] items-center justify-center overflow-hidden rounded-[18px] bg-m-night">
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onLoadedMetadata={() => void handleMetadata()}
          onSeeked={() => setReady(true)}
          onError={() => setError(f.unreadable)}
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-m-linen/85">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            <span role="status">{f.loading}</span>
          </div>
        )}
      </div>

      {/* Vidéo cachée qui sert seulement à fabriquer les vignettes */}
      <video
        ref={thumbVideoRef}
        src={videoUrl}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      {thumbs.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-m-muted">{f.pick}</p>
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
            role="group"
            aria-label={f.pick}
          >
            {thumbs.map((th, i) => (
              <button
                key={th.time}
                type="button"
                onClick={() => seek(th.time)}
                aria-pressed={i === activeThumb}
                aria-label={f.thumb(formatClock(th.time))}
                className={cn(
                  "h-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                  i === activeThumb ? "border-m-wine" : "border-transparent opacity-80",
                )}
              >
                <img src={th.url} alt="" className="h-full w-auto object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="frame-time"
          className="mb-1.5 flex justify-between text-sm font-medium text-m-muted"
        >
          <span>{f.moment}</span>
          <span className="tabular-nums" dir="ltr">
            {formatClock(time)} / {formatClock(max)}
          </span>
        </label>
        <input
          id="frame-time"
          type="range"
          min={0}
          max={max}
          // Pas d'une image (≈ 1/30 s) : on peut viser précisément, même sur 4 secondes
          step={1 / 30}
          value={Math.min(time, max)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!ready}
          className="h-7 w-full accent-m-wine"
        />
      </div>

      {lowRes && ready && (
        <p className="rounded-2xl bg-m-blush p-3 text-[13px] leading-relaxed text-m-ink">
          {f.lowRes}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-m-ink"
        >
          {error}
        </p>
      )}

      <OrderCta
        label={f.take}
        onClick={() => void capture()}
        disabled={!ready}
        busy={busy}
        showArrow={false}
      />
    </BottomSheet>
  );
}
