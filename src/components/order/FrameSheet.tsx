import { useRef, useState } from "react";
import { BottomSheet, OrderCta } from "./OrderChrome";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Le client fait glisser le curseur dans sa vidéo, on capture l'image affichée */
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = Math.max(0.1, duration || videoRef.current?.duration || 0);

  const seek = (seconds: number) => {
    setTime(seconds);
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("La vidéo n'est pas encore prête. Réessaie dans un instant.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
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
        new File([blob], `image_video_${Math.floor(video.currentTime)}s.jpg`, {
          type: "image/jpeg",
        }),
      );
    } catch {
      setError("Cette image n'a pas pu être capturée. Choisis plutôt une photo de ta galerie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      titleId="frame-title"
      title="Une image de ta vidéo"
      subtitle="Fais glisser, on capture"
      onClose={onClose}
    >
      <div className="flex h-[250px] items-center justify-center overflow-hidden rounded-[18px] bg-m-night">
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onLoadedMetadata={(e) => {
            // Sur iPhone, une petite avance force l'affichage de la première image
            const video = e.currentTarget;
            video.currentTime = Math.min(0.1, video.duration || 0);
          }}
          onLoadedData={() => setReady(true)}
          onSeeked={() => setReady(true)}
          onError={() =>
            setError(
              "Cette vidéo ne peut pas être lue ici. Choisis plutôt une photo de ta galerie.",
            )
          }
        />
      </div>

      <div>
        <label
          htmlFor="frame-time"
          className="mb-1.5 flex justify-between text-sm font-medium text-m-muted"
        >
          <span>Moment choisi</span>
          <span className="tabular-nums">
            {formatClock(time)} / {formatClock(max)}
          </span>
        </label>
        <input
          id="frame-time"
          type="range"
          min={0}
          max={max}
          step={0.1}
          value={Math.min(time, max)}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-7 w-full accent-m-wine"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-m-ink"
        >
          {error}
        </p>
      )}

      <OrderCta
        label="Prendre cette image"
        onClick={() => void capture()}
        disabled={!ready}
        busy={busy}
        showArrow={false}
      />
    </BottomSheet>
  );
}
