import { useEffect, useRef, type CSSProperties } from "react";
import memoryLand from "@/assets/hero-card/memory-land.webp";
import memoryPort from "@/assets/hero-card/memory-port.webp";
import techLand from "@/assets/hero-card/tech-land.webp";
import techPort from "@/assets/hero-card/tech-port.webp";

const PORTRAIT = "(orientation: portrait)";

const layer: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  pointerEvents: "none",
  userSelect: "none",
};

const MASK = "radial-gradient(closest-side, #000 58%, transparent 100%)";

/**
 * Photo du hero : la carte MÉMORA (le souvenir). En passant la souris ou le
 * doigt dessus, un cercle doré suit le pointeur et révèle la même carte avec sa
 * couche technique (puce NFC, circuits, QR code). Une petite passe automatique
 * montre l'effet une fois à l'ouverture. Sans effet avec « réduire les animations ».
 *
 * Doit être placé dans un conteneur positionné (le hero sticky) : les événements
 * du pointeur sont écoutés sur son parent, pour que le texte posé par-dessus
 * n'empêche pas l'effet.
 */
export function HeroCardPhoto({ alt }: { alt: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const reveal = revealRef.current;
    const stage = root?.parentElement;
    if (!root || !reveal || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const LERP = 0.22;
    let size = 240;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let started = false;
    let userTouched = false;
    let raf = 0;
    let hintFrame = 0;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;

    const setSize = (s: number) => {
      size = s;
      reveal.style.setProperty("-webkit-mask-size", `${s}px ${s}px`);
      reveal.style.maskSize = `${s}px ${s}px`;
    };
    const apply = () => {
      const pos = `${cx - size / 2}px ${cy - size / 2}px`;
      reveal.style.setProperty("-webkit-mask-position", pos);
      reveal.style.maskPosition = pos;
    };
    const tick = () => {
      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;
      apply();
      if (Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3) {
        cx = tx;
        cy = ty;
        apply();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const follow = (x: number, y: number) => {
      tx = x;
      ty = y;
      if (!started) {
        started = true;
        cx = x;
        cy = y;
        apply();
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      userTouched = true;
      cancelAnimationFrame(hintFrame);
      clearTimeout(hintTimer);
      const touch = e.pointerType !== "mouse";
      const want = touch ? 300 : 240;
      if (size !== want) setSize(want);
      const r = stage.getBoundingClientRect();
      // au doigt, le cercle se place un peu au-dessus pour rester visible
      follow(e.clientX - r.left, e.clientY - r.top - (touch ? 70 : 0));
      reveal.style.opacity = "1";
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") {
        started = false;
        onMove(e);
      }
    };
    const hide = () => {
      reveal.style.opacity = "0";
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") hide();
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", hide);
    stage.addEventListener("pointerleave", hide);

    // Invitation : une passe lente de gauche à droite sur la carte, une seule
    // fois, tant que personne n'a touché l'image.
    hintTimer = setTimeout(() => {
      if (userTouched) return;
      const r = stage.getBoundingClientRect();
      const portrait = window.matchMedia(PORTRAIT).matches;
      setSize(portrait ? 260 : 240);
      const y = r.height * (portrait ? 0.68 : 0.58);
      const from = r.width * (portrait ? 0.3 : 0.42);
      const to = r.width * (portrait ? 0.72 : 0.72);
      const DURATION = 2200;
      const t0 = performance.now();
      started = false;
      reveal.style.opacity = "1";
      const step = (now: number) => {
        if (userTouched) return;
        const k = Math.min(1, (now - t0) / DURATION);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        follow(from + (to - from) * eased, y);
        if (k < 1) {
          hintFrame = requestAnimationFrame(step);
        } else {
          hintTimer = setTimeout(hide, 500);
        }
      };
      hintFrame = requestAnimationFrame(step);
    }, 1200);

    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", hide);
      stage.removeEventListener("pointerleave", hide);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hintFrame);
      clearTimeout(hintTimer);
    };
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0" style={{ touchAction: "pan-y" }}>
      {/* 1. le souvenir */}
      <picture>
        <source media={PORTRAIT} srcSet={memoryPort} />
        <img
          src={memoryLand}
          alt={alt}
          width={1672}
          height={941}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          style={layer}
        />
      </picture>
      {/* 2. trace très légère de la couche technique */}
      <picture aria-hidden="true">
        <source media={PORTRAIT} srcSet={techPort} />
        <img
          src={techLand}
          alt=""
          decoding="async"
          draggable={false}
          style={{ ...layer, opacity: 0.12 }}
        />
      </picture>
      {/* 3. la couche technique, révélée sous le pointeur */}
      <div
        ref={revealRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          transition: "opacity 0.4s ease-out",
          willChange: "opacity",
          pointerEvents: "none",
          WebkitMaskImage: MASK,
          maskImage: MASK,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "240px 240px",
          maskSize: "240px 240px",
          WebkitMaskPosition: "-9999px -9999px",
          maskPosition: "-9999px -9999px",
        }}
      >
        <picture>
          <source media={PORTRAIT} srcSet={techPort} />
          <img src={techLand} alt="" decoding="async" draggable={false} style={layer} />
        </picture>
      </div>
    </div>
  );
}
