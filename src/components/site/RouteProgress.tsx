import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Délai avant d'afficher la barre : rien ne clignote sur une connexion rapide */
const SHOW_AFTER_MS = 150;

/**
 * Fine barre vin en haut de l'écran pendant qu'une page se charge.
 * Elle avance vers 85 % pendant l'attente, se complète puis s'efface.
 */
export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();

    if (pending) {
      timers.current.push(
        setTimeout(() => {
          setVisible(true);
          setWidth(15);
          // Avance de plus en plus lentement, sans jamais atteindre la fin
          let w = 15;
          const tick = () => {
            w += (85 - w) * 0.12;
            setWidth(w);
            timers.current.push(setTimeout(tick, 250));
          };
          timers.current.push(setTimeout(tick, 250));
        }, SHOW_AFTER_MS),
      );
    } else if (visible) {
      setWidth(100);
      timers.current.push(
        setTimeout(() => {
          setVisible(false);
          setWidth(0);
        }, 300),
      );
    }
    return clear;
    // `visible` est lu au moment du changement d'état seulement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms ease" }}
    >
      <div
        className="h-full origin-left bg-m-wine shadow-[0_0_8px_rgba(84,31,50,0.5)] rtl:origin-right"
        style={{ transform: `scaleX(${width / 100})`, transition: "transform 250ms ease-out" }}
      />
    </div>
  );
}
