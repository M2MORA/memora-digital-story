import { useState } from "react";
import { RotateCw } from "lucide-react";
import rectoPhoto from "@/assets/recto-family-v2.jpg";
import { useT } from "@/i18n";

/** La carte MÉMORA, recto et verso : on la retourne pour lire la notice imprimée au dos */
export function FlipCardDemo() {
  const t = useT();
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        aria-label={flipped ? t.flip.toFront : t.flip.toBack}
        className="relative h-[420px] w-[280px] cursor-pointer select-none rounded-[4px] [perspective:1400px]"
      >
        <div
          className={`relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Recto */}
          <div className="absolute inset-0 overflow-hidden rounded-[4px] border-[8px] border-m-paper bg-m-paper shadow-paper [backface-visibility:hidden]">
            <img
              src={rectoPhoto}
              alt={t.flip.front}
              width={560}
              height={840}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Verso, tel qu'il est imprimé */}
          <div className="absolute inset-0 flex flex-col rounded-[4px] bg-m-paper p-6 text-start text-m-ink shadow-paper [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="keep-tracking text-center font-serif text-[22px] font-semibold tracking-[0.18em] text-m-wine">
              MÉMORA
            </p>
            <div className="my-auto flex flex-col items-center">
              <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-m-rose text-sm font-bold text-m-wine">
                {t.flip.place}
              </span>
              <p className="mt-3 text-center text-sm text-m-muted">{t.flip.where}</p>
            </div>
            <ol className="space-y-2.5 text-[15px] leading-snug">
              {t.flip.steps.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-m-wine text-[13px] font-bold text-m-linen">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-m-line pt-3 text-center text-[13px] text-m-step">
              {t.flip.noApp}
            </p>
          </div>
        </div>
      </button>

      <p
        className="mt-5 inline-flex items-center gap-2 text-[15px] text-m-muted"
        aria-hidden="true"
      >
        <RotateCw className="h-4 w-4" />
        {flipped ? t.flip.hintFront : t.flip.hintBack}
      </p>
    </div>
  );
}
