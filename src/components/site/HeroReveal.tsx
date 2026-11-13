import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { HeroCardPhoto } from "./HeroCardPhoto";

/** Le texte commence à apparaître après 10 % du chemin jusqu'au point d'arrêt */
const START = 0.1;

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
  const stopRef = useRef<HTMLDivElement>(null);

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
      // Le texte est entièrement visible pile au point d'arrêt, quelle que soit
      // la hauteur réelle de l'écran (barre d'adresse du téléphone affichée ou non)
      const marker = stopRef.current;
      const stop = marker
        ? marker.getBoundingClientRect().top + window.scrollY
        : window.innerHeight * 0.4;
      const p = Math.min(1, Math.max(0, (window.scrollY / stop - START) / (1 - START)));
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

  // Arrêt au texte : un geste qui descend depuis le haut s'arrête au point
  // d'arrêt (texte entièrement visible), inertie comprise. Le geste suivant
  // continue normalement. Seulement pour un défilement fait par la personne
  // (molette, doigt, clavier) : un lien interne comme #occasions passe sans arrêt.
  // Le CSS scroll-snap ne suffit pas : Chrome ignore scroll-snap-stop en mode
  // « proximity », et « mandatory » bloquerait le reste de la page.
  useEffect(() => {
    const marker = stopRef.current;
    if (!marker) return;
    const IDLE_MS = 180;
    const stopY = () => marker.getBoundingClientRect().top + window.scrollY;
    let armed = window.scrollY < stopY() - 4;
    let holding = false;
    let lastInput = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;

    const markInput = () => {
      lastInput = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["PageDown", "ArrowDown", " ", "End"].includes(e.key)) markInput();
    };
    const holdUntilIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        holding = false;
      }, IDLE_MS);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const stop = stopY();
      if (holding) {
        if (y > stop) window.scrollTo(0, stop);
        holdUntilIdle();
        return;
      }
      if (y < stop - 4) {
        armed = true;
        return;
      }
      const byUser = performance.now() - lastInput < 600;
      if (armed && byUser && y > stop + 1) {
        armed = false;
        holding = true;
        window.scrollTo(0, stop);
        holdUntilIdle();
      } else {
        armed = false;
      }
    };

    window.addEventListener("wheel", markInput, { passive: true });
    window.addEventListener("touchmove", markInput, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(idle);
      window.removeEventListener("wheel", markInput);
      window.removeEventListener("touchmove", markInput);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
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
      {/* Point d'arrêt : texte entièrement visible (voir l'effet « Arrêt au texte ») */}
      <div
        ref={stopRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[40svh] h-px"
      />
      <div className="sticky top-0 flex h-svh items-end overflow-hidden md:items-center">
        <HeroCardPhoto alt={alt} />
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
