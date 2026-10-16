import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Play, RotateCw, Volume2, VolumeX, Wifi } from "lucide-react";

type Stage = "idle" | "tap" | "notif" | "video";

/**
 * Simple animated demo: a smartphone taps the client's printed photo,
 * a notification appears, then the client's own video plays inside the phone.
 */
export function TapDemo({
  photoUrl,
  videoUrl,
  hideHeader = false,
  className = "",
}: {
  photoUrl: string;
  videoUrl: string;
  hideHeader?: boolean;
  className?: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [muted, setMuted] = useState(true);
  const [run, setRun] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const replay = useCallback(() => {
    setStage("idle");
    setRun((r) => r + 1);
  }, []);

  // Timeline: idle -> tap -> notification -> video
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage("tap"), 900),
      setTimeout(() => setStage("notif"), 2600),
      setTimeout(() => setStage("video"), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [run, photoUrl, videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stage === "video") {
      v.currentTime = 0;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [stage, videoUrl]);

  const tapping = stage === "tap";

  return (
    <div className={`rounded-2xl border border-border bg-cream/50 p-6 sm:p-8 ${className}`}>
      {!hideHeader && (
        <div className="text-center">
          <p className="eyebrow">Aperçu de votre MÉMORA</p>
          <h3 className="mt-1 font-serif text-2xl sm:text-3xl">Voilà ce que vos proches verront</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Un simple contact du téléphone sur la photo, et votre vidéo s'ouvre.
          </p>
        </div>
      )}

      <div className="relative mx-auto mt-8 flex h-[430px] max-w-md items-center justify-center">
        {/* Printed card with the client's photo */}
        <div
          className={`relative h-[300px] w-[200px] -rotate-3 overflow-hidden rounded-xl border-4 border-ivory bg-cream shadow-2xl transition-transform duration-700 ${
            tapping ? "scale-[1.03]" : ""
          }`}
        >
          <img src={photoUrl} alt="Votre photo" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-charcoal/40 via-transparent to-transparent" />
          <p className="absolute bottom-2 left-3 font-serif text-sm tracking-widest text-ivory">MÉMORA</p>
          {/* NFC ripple under the phone */}
          {tapping && (
            <>
              <span className="absolute left-1/2 top-[55%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sand/70" />
              <span className="absolute left-1/2 top-[55%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sand" />
            </>
          )}
        </div>

        {/* Smartphone emulator */}
        <div
          className={`absolute z-10 h-[330px] w-[165px] rounded-[28px] border-[6px] border-charcoal bg-charcoal shadow-2xl transition-all duration-1000 ease-in-out ${
            stage === "idle"
              ? "left-[62%] top-[48%] rotate-12 opacity-90"
              : tapping
                ? "left-[34%] top-[40%] -rotate-6"
                : "left-[56%] top-[10%] rotate-0"
          }`}
        >
          <div className="absolute left-1/2 top-1.5 z-20 h-3.5 w-14 -translate-x-1/2 rounded-full bg-black" />
          <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-black">
            {/* Lock screen */}
            <div
              className={`absolute inset-0 flex flex-col items-center bg-linear-to-b from-deep-brown to-charcoal px-3 pt-10 text-ivory transition-opacity duration-500 ${
                stage === "video" ? "opacity-0" : "opacity-100"
              }`}
            >
              <p className="text-3xl font-light">9:41</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-widest text-ivory/70">Écran verrouillé</p>

              <div
                className={`mt-8 w-full rounded-xl bg-ivory/95 p-2.5 text-charcoal shadow-lg transition-all duration-500 ${
                  stage === "notif" ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  <Bell className="h-2.5 w-2.5" /> MÉMORA · maintenant
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-tight">Un souvenir vous attend</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Play className="h-2.5 w-2.5 fill-current" /> Touchez pour ouvrir la vidéo
                </p>
              </div>
            </div>

            {/* The client's video */}
            <video
              ref={videoRef}
              src={videoUrl}
              muted={muted}
              loop
              playsInline
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                stage === "video" ? "opacity-100" : "opacity-0"
              }`}
            />
            {stage === "video" && (
              <>
                <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/60 to-transparent px-3 pb-4 pt-6 text-[9px] text-ivory">
                  <span className="flex items-center gap-1">
                    <Wifi className="h-2.5 w-2.5" /> memora.tn
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? "Activer le son" : "Couper le son"}
                  className="absolute bottom-3 right-3 rounded-full bg-black/60 p-1.5 text-ivory"
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
        {stage === "idle" && "Le téléphone approche de la photo…"}
        {stage === "tap" && "Contact avec la puce NFC…"}
        {stage === "notif" && "Une notification apparaît…"}
        {stage === "video" && "Votre vidéo se lance !"}
      </p>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={replay}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs uppercase tracking-[0.15em] text-charcoal shadow-xs transition-colors hover:bg-cream"
        >
          <RotateCw className="h-3.5 w-3.5 text-taupe" /> Rejouer la démo
        </button>
      </div>
    </div>
  );
}

