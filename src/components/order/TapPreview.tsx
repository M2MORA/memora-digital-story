import type { CardOrientation } from "@/lib/photo-crop";

/** Le téléphone s'approche de la carte et la vidéo démarre (animation de la maquette) */
export function TapPreview({
  photoUrl,
  orientation,
  videoUrl,
}: {
  photoUrl: string;
  orientation: CardOrientation;
  videoUrl: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-[380px] items-center justify-center overflow-hidden rounded-[28px] bg-m-stage"
    >
      <div
        className={`${
          orientation === "landscape" ? "h-[140px] w-[210px]" : "h-[210px] w-[140px]"
        } -translate-x-[30px] -translate-y-[30px] -rotate-3 overflow-hidden rounded-lg shadow-[0_18px_40px_rgba(42,26,31,0.18)]`}
      >
        {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
      </div>

      <div className="absolute left-1/2 top-[110px] -ml-[85px] h-[240px] w-[120px] rounded-[26px] bg-m-ink p-1.5 shadow-[0_24px_50px_rgba(42,26,31,0.35)] animate-memora-phone">
        <div className="relative h-full w-full overflow-hidden rounded-[21px] bg-m-night">
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
                className="h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-x-2.5 bottom-3.5 h-[3px] overflow-hidden rounded-sm bg-m-linen/35">
              <i className="block h-[3px] bg-m-linen animate-memora-bar" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
