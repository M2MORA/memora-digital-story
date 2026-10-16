import { useState } from "react";
import { RotateCw, Smartphone, Sparkles, CheckCircle2 } from "lucide-react";
import hero from "@/assets/hero.jpg";

export function FlipCardDemo() {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="flex flex-col items-center">
      {/* 3D Flip Container */}
      <div
        className="relative h-[420px] w-full max-w-[320px] cursor-pointer select-none [perspective:1200px]"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className={`relative h-full w-full rounded-2xl shadow-2xl transition-transform duration-700 [transform-style:preserve-3d] ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* RECTO (Front) */}
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-4 border-ivory bg-cream shadow-xl [backface-visibility:hidden]">
            <div className="relative flex-1 overflow-hidden">
              <img
                src={hero}
                alt="Photo Mémora imprimée"
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-charcoal/40 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-ivory">
                <div>
                  <p className="font-serif text-lg tracking-wide">MÉMORA 10×15</p>
                  <p className="text-[11px] uppercase tracking-widest text-sand">Tirage photographique d'art</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-charcoal/60 px-2.5 py-1 text-[10px] uppercase tracking-wider backdrop-blur">
                  <Sparkles className="h-3 w-3 text-sand" /> Puce NFC intégrée
                </span>
              </div>
            </div>
          </div>

          {/* VERSO (Back) */}
          <div className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-border bg-[#FBF9F5] p-6 text-charcoal shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {/* Header with NFC target spot */}
            <div className="border-b border-border/80 pb-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sand/30">
                <Smartphone className="h-5 w-5 text-deep-brown" />
              </div>
              <p className="font-serif text-xl tracking-wider text-charcoal">MÉMORA</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Notice d'utilisation au dos
              </p>
            </div>

            {/* Target Area where the phone touches */}
            <div className="my-auto flex flex-col items-center justify-center rounded-xl border border-dashed border-taupe/40 bg-sand/15 p-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-taupe/30 bg-background text-deep-brown shadow-xs">
                <span className="text-xs font-semibold uppercase tracking-wider">NFC</span>
              </div>
              <p className="mt-2 text-xs font-medium text-charcoal">Posez votre smartphone ici</p>
              <p className="text-[11px] text-muted-foreground">Haut de l'iPhone ou dos d'Android</p>
            </div>

            {/* 3 Step Instructions */}
            <div className="space-y-2.5 text-xs text-charcoal/90">
              <div className="flex items-start gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-deep-brown text-[10px] font-bold text-ivory">
                  1
                </span>
                <p className="leading-tight">Déverrouillez l'écran de votre smartphone</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-deep-brown text-[10px] font-bold text-ivory">
                  2
                </span>
                <p className="leading-tight">Approchez-le du centre de la photo</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-deep-brown text-[10px] font-bold text-ivory">
                  3
                </span>
                <p className="leading-tight">Touchez la notification : votre vidéo démarre</p>
              </div>
            </div>

            {/* Footer reassurance */}
            <div className="flex items-center justify-between border-t border-border/80 pt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-deep-brown" /> Sans application
              </span>
              <span>iOS & Android</span>
            </div>
          </div>
        </div>
      </div>

      {/* Button to flip */}
      <button
        onClick={() => setIsFlipped(!isFlipped)}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs uppercase tracking-[0.15em] text-charcoal shadow-xs transition-colors hover:bg-cream"
      >
        <RotateCw className="h-3.5 w-3.5 text-taupe" />
        {isFlipped ? "Voir la photo (recto)" : "Voir les instructions au dos (verso)"}
      </button>
    </div>
  );
}
