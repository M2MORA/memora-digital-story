import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Faux côté serveur et au premier rendu, vrai une fois la page active dans
 * le navigateur. Sert à ne pas afficher « panier vide » avant d'avoir lu le
 * panier enregistré dans le téléphone.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
