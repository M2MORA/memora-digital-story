import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const DELAY_MS = 4500;

export type Occasion = { label: string; img: string; w: number; h: number; pos?: string };

/**
 * « Pour qui ? » : une grande photo qui change toute seule (fondu), avec la
 * liste des occasions à côté. L'occasion affichée est soulignée par une barre
 * qui se remplit jusqu'à la photo suivante. Pause au survol ou au focus ;
 * pas de défilement automatique avec « réduire les animations ».
 */
export function OccasionShowcase({
  title,
  titleId,
  cta,
  items,
}: {
  title: string;
  titleId: string;
  cta: string;
  items: Occasion[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    setAuto(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!auto || paused) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % items.length), DELAY_MS);
    return () => clearTimeout(id);
  }, [auto, paused, active, items.length]);

  return (
    <div
      className="grid items-center gap-8 md:grid-cols-[1fr_1.5fr] md:gap-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="order-2 md:order-1">
        <h2 id={titleId} className="font-serif text-[30px] leading-[1.1] text-m-ink sm:text-[40px]">
          {title}
        </h2>
        <ul className="mt-6 flex gap-2 md:mt-8 md:flex-col md:gap-1">
          {items.map((o, i) => {
            const on = i === active;
            return (
              <li key={o.label} className="flex-1 md:flex-none">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActive(i)}
                  className={cn(
                    "w-full py-2 text-start font-serif text-[20px] leading-tight transition-colors sm:text-[24px] md:text-[34px]",
                    on ? "text-m-wine" : "text-m-ink/40 hover:text-m-ink/70",
                  )}
                >
                  {o.label}
                  {/* Barre de progression jusqu'à la photo suivante */}
                  <span className="mt-2 block h-[2px] w-full overflow-hidden rounded-full bg-m-line-strong">
                    {on && (
                      <span
                        key={`${active}-${paused}`}
                        className="block h-full origin-left bg-m-wine rtl:origin-right"
                        style={
                          auto && !paused
                            ? { animation: `occasion-progress ${DELAY_MS}ms linear forwards` }
                            : { transform: "scaleX(1)" }
                        }
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Link
          to="/commander"
          className="mt-8 hidden min-h-11 items-center font-semibold text-m-wine underline decoration-m-rose underline-offset-4 md:inline-flex"
        >
          {cta}
        </Link>
      </div>

      <div className="relative order-1 aspect-[4/3] overflow-hidden rounded-[4px] bg-m-stage shadow-paper md:order-2">
        {items.map((o, i) => (
          <img
            key={o.img}
            src={o.img}
            alt=""
            width={o.w}
            height={o.h}
            loading="lazy"
            decoding="async"
            {...(o.pos ? { style: { objectPosition: o.pos } } : {})}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-out",
              i === active ? "scale-100 opacity-100" : "scale-[1.04] opacity-0",
            )}
          />
        ))}
      </div>
    </div>
  );
}
