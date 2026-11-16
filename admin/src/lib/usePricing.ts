import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  validateFramePrice,
  validateShippingVideo,
  validateTierGrid,
  type PriceTier,
  type ShippingVideoSettings,
} from "./rules";

export type PricingFormat = { code: string; frame_price: number; active: boolean; tiers: PriceTier[] };
export type PricingSettings = {
  shipping_fee_aramex: number;
  shipping_fee_mondial_relay: number;
  free_shipping_threshold: number;
  included_video_seconds: number;
  surcharge_per_minute: number;
  max_video_seconds: number;
};
export type Pricing = { formats: PricingFormat[]; settings: PricingSettings };

type RawPricing = {
  formats?: { code: string; frame_price: number | string; active: boolean }[];
  tiers?: { format: string; min_qty: number; unit_price: number | string }[];
  settings?: Record<keyof PricingSettings, number | string> | null;
};

function parsePricing(raw: unknown): Pricing | null {
  const r = raw as RawPricing | null;
  if (!r?.formats || !r.tiers || !r.settings) return null;
  const s = r.settings;
  return {
    formats: r.formats.map((f) => ({
      code: f.code,
      frame_price: Number(f.frame_price),
      active: f.active,
      tiers: r.tiers!
        .filter((t) => t.format === f.code)
        .map((t) => ({ min_qty: Number(t.min_qty), unit_price: Number(t.unit_price) }))
        .sort((a, b) => a.min_qty - b.min_qty),
    })),
    settings: {
      shipping_fee_aramex: Number(s.shipping_fee_aramex),
      shipping_fee_mondial_relay: Number(s.shipping_fee_mondial_relay),
      free_shipping_threshold: Number(s.free_shipping_threshold),
      included_video_seconds: Number(s.included_video_seconds),
      surcharge_per_minute: Number(s.surcharge_per_minute),
      max_video_seconds: Number(s.max_video_seconds),
    },
  };
}

// Sans droit admin, Supabase ne modifie aucune ligne et ne renvoie pas d'erreur : on vérifie le nombre.
const NOTHING_WRITTEN = "La base n'a rien enregistré (droits admin manquants ?). Recharge la page.";

/**
 * Prix de l'onglet Catalogue, lus par get_pricing() et écrits directement dans les tables
 * avec la session admin. Les règles RLS et le contrôle « palier à 1 » de la base décident.
 * Renvoie "" si l'enregistrement a réussi, sinon le message à afficher.
 */
export function usePricing() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Change à chaque chargement : les formulaires repartent des valeurs de la base.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc("get_pricing");
    const parsed = err ? null : parsePricing(data);
    if (parsed) {
      setPricing(parsed);
      setVersion((v) => v + 1);
    } else {
      setError(`Prix non chargés : ${err?.message ?? "réponse inattendue de la base."}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Grille d'un format : on écrit d'abord les paliers (upsert), puis on supprime ceux retirés.
   * Le palier à 1 est toujours dans la nouvelle grille, donc jamais supprimé : chaque requête
   * laisse la base valide pour le contrôle différé « premier palier à 1 ».
   */
  const saveFormat = async (code: string, framePrice: number, tiers: PriceTier[]): Promise<string> => {
    const invalid = validateTierGrid(tiers) ?? validateFramePrice(framePrice);
    if (invalid) return invalid;
    const saved = pricing?.formats.find((f) => f.code === code);
    if (!saved) return "Format inconnu. Recharge la page.";

    const rows = tiers.map((t) => ({ format: code, min_qty: t.min_qty, unit_price: t.unit_price }));
    const up = await supabase.from("price_tiers").upsert(rows, { onConflict: "format,min_qty" }).select();
    if (up.error) return up.error.message;
    if ((up.data?.length ?? 0) !== rows.length) return NOTHING_WRITTEN;

    const kept = new Set(tiers.map((t) => t.min_qty));
    const removed = saved.tiers.map((t) => t.min_qty).filter((q) => !kept.has(q));
    if (removed.length) {
      const del = await supabase.from("price_tiers").delete().eq("format", code).in("min_qty", removed).select();
      if (del.error) return del.error.message;
      if ((del.data?.length ?? 0) !== removed.length) return NOTHING_WRITTEN;
    }

    if (framePrice !== saved.frame_price) {
      const upd = await supabase.from("formats").update({ frame_price: framePrice }).eq("code", code).select();
      if (upd.error) return upd.error.message;
      if (!upd.data?.length) return NOTHING_WRITTEN;
    }

    const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
    setPricing((p) =>
      p && { ...p, formats: p.formats.map((f) => (f.code === code ? { ...f, frame_price: framePrice, tiers: sorted } : f)) },
    );
    return "";
  };

  /** Livraison et vidéo : l'écran parle en minutes, la table stocke des secondes. */
  const saveShippingVideo = async (values: ShippingVideoSettings): Promise<string> => {
    if (!pricing) return "Prix non chargés.";
    const invalid = validateShippingVideo(values, pricing.settings.max_video_seconds);
    if (invalid) return invalid;
    const { included_video_minutes, ...rest } = values;
    const patch = { ...rest, included_video_seconds: Math.round(included_video_minutes * 60) };
    const { data, error: err } = await supabase.from("pricing_settings").update(patch).eq("id", true).select();
    if (err) return err.message;
    if (!data?.length) return NOTHING_WRITTEN;
    setPricing((p) => p && { ...p, settings: { ...p.settings, ...patch } });
    return "";
  };

  return { pricing, loading, error, version, load, saveFormat, saveShippingVideo };
}

export type PricingData = ReturnType<typeof usePricing>;
