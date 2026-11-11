import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Img } from "./Img";
import { IMAGES } from "@/lib/images.gen";

/** Part du défilement (en hauteurs d'écran) où le texte apparaît : de 4 % à 40 % */
const START = 0.04;
const SPAN = 0.36;

/**
 * Hero de l'accueil : à l'ouverture, seule la photo est visible, en plein écran.
 * En faisant défiler, la photo reste en place (sticky), s'assombrit un peu,
 * et le texte apparaît. La progression est écrite dans la variable CSS
 * --reveal (0 → 1) sans re-rendu React. Avec « réduire les animations »,
 * le texte est visible tout de suite.
 */
export function HeroReveal({
  alt,
  scrollHint,
  children,
}: {
  alt: string;
  scrollHint: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--reveal", "1");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, (window.scrollY / vh - START) / SPAN));
      el.style.setProperty("--reveal", p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const reveal = "var(--reveal)";

  return (
    <section
      ref={ref}
      id="hero"
      // La section fait 1,6 écran : le défilement fait apparaître le texte
      // pendant que la photo reste fixe, puis la page continue normalement.
      className="relative -mt-16 h-[160svh] bg-m-night"
      style={{ "--reveal": 0 } as CSSProperties}
    >
      <div className="sticky top-0 flex h-svh items-end overflow-hidden md:items-center">
        <Img
          image={IMAGES.hero}
          alt={alt}
          sizes="100vw"
          priority
          // En arabe, la photo est retournée pour que la zone sombre soit du côté du texte
          className="absolute inset-0 h-full w-full object-cover object-[72%_center] md:object-center rtl:-scale-x-100"
        />
        {/* Bande sombre en haut : l'en-tête transparent reste lisible sur la pierre claire */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-36 bg-linear-to-b from-m-night/60 to-transparent"
        />
        {/* Le voile arrive avec le texte : la photo est d'abord montrée telle quelle */}
        <div
          aria-hidden="true"
          style={{ opacity: reveal }}
          className="absolute inset-0 bg-linear-to-t from-m-night/90 via-m-night/55 to-m-night/10 md:bg-linear-to-r md:from-m-night/85 md:via-m-night/45 md:to-transparent rtl:md:bg-linear-to-l"
        />

        <div
          className="container-x relative py-14 text-m-linen md:py-24"
          style={{
            opacity: reveal,
            transform: `translateY(calc((1 - ${reveal}) * 32px))`,
          }}
        >
          {children}
        </div>

        {/* Invitation à faire défiler, qui s'efface dès que le texte arrive */}
        <div
          aria-hidden="true"
          style={{ opacity: `calc(1 - ${reveal} * 3)` }}
          className="pointer-events-none absolute inset-x-0 bottom-[calc(32px+env(safe-area-inset-bottom))] flex justify-center md:bottom-10"
        >
          {/* Fond sombre : lisible même sur la pierre claire de la photo */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-m-night/60 px-4 py-2 text-[15px] font-medium text-m-linen backdrop-blur-sm">
            {scrollHint}
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </span>
        </div>
      </div>
    </section>
  );
}
