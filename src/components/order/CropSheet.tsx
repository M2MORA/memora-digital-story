import {
  MAX_ZOOM,
  MIN_ZOOM,
  panCrop,
  withOrientation,
  withZoom,
  type PhotoCrop,
  type Size,
} from "@/lib/photo-crop";
import { BottomSheet, CroppedPhoto, OrderCta } from "./OrderChrome";

// Cadre de recadrage (ratio exact de la carte 15 × 10)
const CROP_BOX: Record<PhotoCrop["orientation"], Size> = {
  landscape: { width: 270, height: 180 },
  portrait: { width: (220 * 2) / 3, height: 220 },
};

export function CropSheet({
  photoUrl,
  natural,
  crop,
  onChange,
  onClose,
}: {
  photoUrl: string;
  natural: Size;
  crop: PhotoCrop;
  onChange: (update: (current: PhotoCrop) => PhotoCrop) => void;
  onClose: () => void;
}) {
  const box = CROP_BOX[crop.orientation];
  const zoomPercent = Math.round(crop.zoom * 100);

  return (
    <BottomSheet
      titleId="crop-title"
      title="Recadre ta photo"
      subtitle="Format de la carte 15 × 10 cm"
      onClose={onClose}
    >
      <div className="flex h-[250px] items-center justify-center overflow-hidden rounded-[18px] bg-m-night">
        <CroppedPhoto
          photoUrl={photoUrl}
          natural={natural}
          crop={crop}
          box={box}
          className="outline outline-2 outline-m-linen shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
          onPan={(dx, dy) => onChange((c) => panCrop(c, natural, CROP_BOX[c.orientation], dx, dy))}
        />
      </div>

      <div className="flex gap-2.5" role="group" aria-label="Orientation de la carte">
        {(
          [
            ["landscape", "Paysage"],
            ["portrait", "Portrait"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={crop.orientation === value}
            onClick={() => onChange((c) => withOrientation(c, value))}
            className={`h-[46px] flex-1 rounded-[14px] border text-[15px] font-semibold transition-colors ${
              crop.orientation === value
                ? "border-m-wine bg-m-wine text-m-linen"
                : "border-m-line-strong bg-m-paper text-m-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="crop-zoom" className="mb-1.5 block text-sm font-medium text-m-muted">
          Zoom : {zoomPercent} %
        </label>
        <input
          id="crop-zoom"
          type="range"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={5}
          value={zoomPercent}
          onChange={(e) => {
            const zoom = Number(e.target.value) / 100;
            onChange((c) => withZoom(c, zoom));
          }}
          className="h-7 w-full accent-m-wine"
        />
      </div>

      <OrderCta label="Valider le cadrage" onClick={onClose} showArrow={false} />
    </BottomSheet>
  );
}
