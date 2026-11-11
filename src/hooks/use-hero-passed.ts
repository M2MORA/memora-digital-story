import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Vrai quand la photo plein écran de l'accueil (#hero) n'occupe plus l'écran.
 * Sur les autres pages : vrai dès les premiers pixels (ou tout de suite si
 * `immediateElsewhere`). Sert à garder la photo du hero dégagée : en-tête
 * transparent, barre de commande et bouton WhatsApp cachés.
 */
export function useHeroPassed({ immediateElsewhere = false } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const [passed, setPassed] = useState(!isHome && immediateElsewhere);

  useEffect(() => {
    if (!isHome && immediateElsewhere) {
      setPassed(true);
      return;
    }
    const onScroll = () => {
      const hero = isHome ? document.getElementById("hero") : null;
      const limit = hero ? hero.offsetHeight - window.innerHeight - 64 : 40;
      setPassed(window.scrollY > Math.max(40, limit));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isHome, immediateElsewhere]);

  return passed;
}
