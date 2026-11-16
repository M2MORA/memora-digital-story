import { useSyncExternalStore } from "react";
import {
  Format,
  calculateQuote,
  Pricing,
  QuoteResult,
  ShippingMode,
} from "./pricing";
import { getOrCreateDraftCredentials, resetDraftCredentials } from "./draft-manager";

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
    aspect?: string | undefined;
    pan?: { x: number; y: number } | undefined;
    fineAngle?: number | undefined;
    flipH?: boolean | undefined;
    template?: string | undefined;
    caption?: string | undefined;
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
  /** Percent from check_promo_code when the code was applied (display only; the SQL Quote charges). */
  promoPercent?: number;
  giftCardCode?: string;
  draftId: string;
  draftToken: string;
};

const KEY = "memora-cart-v2";

const initialCreds = getOrCreateDraftCredentials();

let state: State = {
  items: [],
  wishlist: [],
  draftId: initialCreds.draftId,
  draftToken: initialCreds.draftToken,
};

let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const creds = getOrCreateDraftCredentials();
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        ...state,
        ...parsed,
        draftId: creds.draftId,
        draftToken: creds.draftToken,
      };
      // Code saved before check_promo_code existed: its percent is unknown, so it is dropped
      // rather than charged without being shown.
      if (typeof state.promoPercent !== "number") {
        const { promoCode: _dropped, ...rest } = state;
        state = rest;
      }
    } else {
      state = {
        ...state,
        draftId: creds.draftId,
        draftToken: creds.draftToken,
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
    const format: Format = itemData?.format ?? "10x15";

    const key = itemData?.key ?? `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

  // Met à jour une création déjà au panier (ex. photo recadrée après coup)
  update(key: string, patch: Partial<Omit<CartItem, "key" | "productId" | "qty">>) {
    load();
    set({
      ...state,
      items: state.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    });
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

  /**
   * Checks a code with `check` (check_promo_code) and keeps it with its percent when it gives a discount.
   * "error": the check failed, the cart is unchanged and the customer must be told.
   */
  async applyPromoCode(
    code: string,
    check: (code: string) => Promise<number>,
  ): Promise<{ ok: true; percent: number } | { ok: false; reason: "invalid" | "error" }> {
    load();
    const cleanCode = code.trim().toUpperCase();
    let percent: number;
    try {
      percent = await check(cleanCode);
    } catch {
      return { ok: false, reason: "error" };
    }
    if (!(percent > 0)) return { ok: false, reason: "invalid" };
    set({ ...state, promoCode: cleanCode, promoPercent: percent });
    return { ok: true, percent };
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

  getQuote(pricing: Pricing, shipping?: ShippingMode): QuoteResult {
    load();
    const lines = state.items.map((i) => ({
      format: i.format,
      quantity: i.qty,
      withFrame: i.withFrame,
      videoDurationSec: i.videoDurationSec,
    }));
    return calculateQuote(lines, pricing, state.promoPercent ?? 0, shipping);
  },

  clear() {
    const nextCreds = resetDraftCredentials();
    set({
      items: [],
      wishlist: state.wishlist,
      draftId: nextCreds.draftId,
      draftToken: nextCreds.draftToken,
    });
  },
};
