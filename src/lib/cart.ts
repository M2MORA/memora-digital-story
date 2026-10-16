import { useSyncExternalStore } from "react";
import { Format, calculateQuote, QuoteResult } from "./pricing";

export type RecipientAllocation = {
  recipientId: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  qty: number;
};

export type CartItem = {
  key: string;
  productId: string;
  format: Format;
  qty: number;
  withFrame?: boolean | undefined;
  videoDurationSec: number;
  photoPreviewUrl?: string | undefined;
  videoPreviewUrl?: string | undefined;
  videoName?: string | undefined;
  photoName?: string | undefined;
  cropSettings?: {
    zoom: number;
    rotation: number;
    aspect: string;
  } | undefined;
  noteForBack?: string | undefined;
  cardMessage?: string | undefined;
  letterContent?: string | undefined;
  recipients?: RecipientAllocation[] | undefined;
  personalization?: {
    title?: string | undefined;
    date?: string | undefined;
    message?: string | undefined;
    letter?: string | undefined;
    template?: string | undefined;
    color?: string | undefined;
    connectivity?: string | undefined;
    photoCount?: number | undefined;
  } | undefined;
};

type State = {
  items: CartItem[];
  wishlist: string[];
  promoCode?: string;
  giftCardCode?: string;
  discountPercent: number;
  draftId: string;
  draftToken: string;
};

const KEY = "memora-cart-v2";

function generateDraftId(): string {
  return "dft_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function generateDraftToken(): string {
  return "tok_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

let state: State = {
  items: [],
  wishlist: [],
  discountPercent: 0,
  draftId: generateDraftId(),
  draftToken: generateDraftToken(),
};

let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        ...state,
        ...parsed,
        draftId: parsed.draftId || generateDraftId(),
        draftToken: parsed.draftToken || generateDraftToken(),
      };
    }
  } catch {
    /* ignore fallback */
  }
}

function set(next: State) {
  state = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota or storage error */
    }
  }
  listeners.forEach((l) => l());
}

const EMPTY: State = {
  items: [],
  wishlist: [],
  discountPercent: 0,
  draftId: "",
  draftToken: "",
};

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
  add(productId: string, itemData?: Partial<CartItem>) {
    load();
    const format: Format =
      itemData?.format ||
      (productId === "p2" || productId.includes("box") || productId.includes("coffret")
        ? "box"
        : productId.includes("magnet")
        ? "magnet"
        : productId.includes("20x30")
        ? "20x30"
        : productId.includes("30x45")
        ? "30x45"
        : "10x15");

    const key = `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newItem: CartItem = {
      key,
      productId,
      format,
      qty: itemData?.qty ?? 1,
      withFrame: itemData?.withFrame ?? (productId.includes("encadre") || productId.includes("galerie")),
      videoDurationSec: itemData?.videoDurationSec ?? 95,
      photoPreviewUrl: itemData?.photoPreviewUrl,
      videoPreviewUrl: itemData?.videoPreviewUrl,
      videoName: itemData?.videoName,
      photoName: itemData?.photoName,
      cropSettings: itemData?.cropSettings,
      noteForBack: itemData?.noteForBack,
      cardMessage: itemData?.cardMessage,
      letterContent: itemData?.letterContent,
      recipients: itemData?.recipients || [],
      personalization: itemData?.personalization,
    };

    set({ ...state, items: [...state.items, newItem] });
    return newItem;
  },

  remove(key: string) {
    load();
    set({ ...state, items: state.items.filter((i) => i.key !== key) });
  },

  setQty(key: string, qty: number) {
    load();
    set({
      ...state,
      items: state.items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)),
    });
  },

  setFormat(key: string, format: Format) {
    load();
    set({
      ...state,
      items: state.items.map((i) => (i.key === key ? { ...i, format } : i)),
    });
  },

  toggleFrame(key: string) {
    load();
    set({
      ...state,
      items: state.items.map((i) => (i.key === key ? { ...i, withFrame: !i.withFrame } : i)),
    });
  },

  duplicate(key: string, mode: "same_photo_new_video" | "same_video_new_photo") {
    load();
    const original = state.items.find((i) => i.key === key);
    if (!original) return;

    const newKey = `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const duplicated: CartItem = {
      ...original,
      key: newKey,
      photoPreviewUrl: mode === "same_video_new_photo" ? undefined : original.photoPreviewUrl,
      videoPreviewUrl: mode === "same_photo_new_video" ? undefined : original.videoPreviewUrl,
      videoDurationSec: mode === "same_photo_new_video" ? 0 : original.videoDurationSec,
    };

    set({ ...state, items: [...state.items, duplicated] });
  },

  addRecipient(key: string, recipient: RecipientAllocation) {
    load();
    set({
      ...state,
      items: state.items.map((i) => {
        if (i.key !== key) return i;
        const currentRecipients = i.recipients || [];
        return {
          ...i,
          recipients: [...currentRecipients, recipient],
        };
      }),
    });
  },

  applyPromoCode(code: string): { success: boolean; message: string } {
    load();
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === "MEMORA10" || cleanCode === "BIENVENUE") {
      set({ ...state, promoCode: cleanCode, discountPercent: 10 });
      return { success: true, message: "Code appliqué : -10% de réduction immédiate" };
    }
    if (cleanCode === "VIP20") {
      set({ ...state, promoCode: cleanCode, discountPercent: 20 });
      return { success: true, message: "Code appliqué : -20% de réduction VIP" };
    }
    return { success: false, message: "Code promo invalide ou expiré" };
  },

  applyGiftCard(code: string): { success: boolean; message: string } {
    load();
    const clean = code.trim().toUpperCase();
    if (clean.startsWith("GIFT-") || clean.length >= 8) {
      set({ ...state, giftCardCode: clean });
      return { success: true, message: "Carte cadeau validée !" };
    }
    return { success: false, message: "Numéro de carte cadeau invalide" };
  },

  toggleWish(id: string) {
    load();
    const w = state.wishlist.includes(id)
      ? state.wishlist.filter((x) => x !== id)
      : [...state.wishlist, id];
    set({ ...state, wishlist: w });
  },

  getQuote(country: string = "TN", carrier?: any): QuoteResult {
    load();
    const quoteItems = state.items.map((i) => ({
      format: i.format,
      quantity: i.qty,
      withFrame: i.withFrame,
      videoDurationSec: i.videoDurationSec,
    }));
    return calculateQuote(quoteItems, country, carrier, state.discountPercent);
  },

  clear() {
    set({
      items: [],
      wishlist: state.wishlist,
      discountPercent: 0,
      draftId: generateDraftId(),
      draftToken: generateDraftToken(),
    });
  },
};
