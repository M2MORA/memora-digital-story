import { useState } from "react";
import type { CardOrientation } from "@/lib/photo-crop";
import { cn } from "@/lib/utils";

/**
 * Le téléphone s'approche de la carte et la vidéo démarre (animation de la maquette).
 *
 * - Vidéo tournée à l'horizontale : affichée entière, avec des bandes noires,
 *   exactement comme sur la page souvenir (/m/…) que verra la personne. Sans
 *   ça, elle était recadrée et très zoomée dans le téléphone vertical.
 * - Carte à l'horizontale : plus grande et décalée en haut à gauche ; le
 *   téléphone se pose sur son coin bas-droit au lieu de cacher la photo.
 */
export function TapPreview({
  photoUrl,
  orientation,
  videoUrl,
}: {
  photoUrl: string;
  orientation: CardOrientation;
  videoUrl: string;
}) {
  const [videoLandscape, setVideoLandscape] = useState(false);
  const wide = orientation === "landscape";

  return (
    <div
      aria-hidden="true"
      className="relative h-[380px] overflow-hidden rounded-[28px] bg-m-stage"
    >
      {/* Sur les très petits écrans (moins de 360 px), la scène est un peu réduite pour tenir */}
      <div className="relative flex h-full w-full items-center justify-center max-[359px]:scale-[0.84]">
        <div
          className={cn(
            "-rotate-3 overflow-hidden rounded-lg shadow-[0_18px_40px_rgba(42,26,31,0.18)]",
            wide
              ? "h-[156px] w-[234px] -translate-x-[40px] -translate-y-[55px]"
              : "h-[210px] w-[140px] -translate-x-[30px] -translate-y-[30px]",
          )}
        >
          {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
        </div>

        <div
          className={cn(
            "absolute left-1/2 top-[110px] -ml-[85px] h-[240px] w-[120px] rounded-[26px] bg-m-ink p-1.5 shadow-[0_24px_50px_rgba(42,26,31,0.35)]",
            wide ? "animate-memora-phone-wide" : "animate-memora-phone",
          )}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[21px] bg-black">
            <div className="absolute left-1/2 top-2 z-10 -ml-[19px] h-2.5 w-[38px] rounded-[5px] bg-black" />
            <div className="absolute inset-0 animate-memora-play">
              {videoUrl && (
                <video
                  src={videoUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setVideoLandscape(v.videoWidth > v.videoHeight);
                  }}
                  className={cn(
                    "h-full w-full",
                    videoLandscape ? "object-contain" : "object-cover",
                  )}
                />
              )}
              <div className="absolute inset-x-2.5 bottom-3.5 h-[3px] overflow-hidden rounded-sm bg-m-linen/35">
                <i className="block h-[3px] bg-m-linen animate-memora-bar" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
