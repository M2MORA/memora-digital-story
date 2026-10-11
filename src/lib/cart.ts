import { useSyncExternalStore } from "react";

export type Personalization = {
  title?: string;
  date?: string;
  message?: string;
  template?: string;
  color?: string;
  connectivity?: string;
  photoCount?: number;
};

export type CartItem = {
  key: string;
  productId: string;
  qty: number;
  personalization?: Personalization;
};

type State = { items: CartItem[]; wishlist: string[] };
const KEY = "memora-cart-v1";
let state: State = { items: [], wishlist: [] };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch {
    /* ignore */
  }
}
function set(next: State) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}
const EMPTY: State = { items: [], wishlist: [] };

export function useStore() {
  return useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      l();
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export const cart = {
  add(productId: string, personalization?: Personalization) {
    load();
    const key = `${productId}-${Date.now()}`;
    set({ ...state, items: [...state.items, { key, productId, qty: 1, personalization }] });
  },
  remove(key: string) {
    set({ ...state, items: state.items.filter((i) => i.key !== key) });
  },
  setQty(key: string, qty: number) {
    set({ ...state, items: state.items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)) });
  },
  toggleWish(id: string) {
    load();
    const w = state.wishlist.includes(id) ? state.wishlist.filter((x) => x !== id) : [...state.wishlist, id];
    set({ ...state, wishlist: w });
  },
};
