import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { normalizePromoCode, validateNewPromoCode, validatePromoPercent, type PromoCode } from "./rules";

// Sans droit admin, Supabase ne modifie aucune ligne et ne renvoie pas d'erreur : on vérifie le nombre.
const NOTHING_WRITTEN = "La base n'a rien enregistré (droits admin manquants ?). Recharge la page.";

const toPromo = (r: { code: string; percent: number | string; active: boolean }): PromoCode => ({
  code: r.code,
  percent: Number(r.percent),
  active: r.active,
});

/**
 * Codes promo de l'onglet Catalogue, lus et écrits directement dans promo_codes avec la session
 * admin (seuls les admins y ont accès). Pas de suppression : un code se désactive.
 * Les enregistrements renvoient "" en cas de succès, sinon le message à afficher.
 */
export function usePromoCodes() {
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.from("promo_codes").select("code, percent, active").order("code");
    if (err) setError(`Codes promo non chargés : ${err.message}`);
    else setCodes(data.map(toPromo));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (row: PromoCode) =>
    setCodes((list) => list && list.map((c) => (c.code === row.code ? row : c)));

  const create = async (code: string, percent: number): Promise<string> => {
    const invalid = validateNewPromoCode(code, percent, (codes ?? []).map((c) => c.code));
    if (invalid) return invalid;
    const clean = normalizePromoCode(code);
    const { data, error: err } = await supabase.from("promo_codes").insert({ code: clean, percent }).select();
    if (err) return err.code === "23505" ? `Le code ${clean} existe déjà.` : err.message;
    const row = data?.[0];
    if (!row) return NOTHING_WRITTEN;
    setCodes((list) => [...(list ?? []), toPromo(row)].sort((a, b) => a.code.localeCompare(b.code)));
    return "";
  };

  const update = async (code: string, patch: Partial<Omit<PromoCode, "code">>): Promise<string> => {
    const invalid = patch.percent === undefined ? null : validatePromoPercent(patch.percent);
    if (invalid) return invalid;
    const { data, error: err } = await supabase.from("promo_codes").update(patch).eq("code", code).select();
    if (err) return err.message;
    const row = data?.[0];
    if (!row) return NOTHING_WRITTEN;
    replace(toPromo(row));
    return "";
  };

  return {
    codes,
    loading,
    error,
    load,
    create,
    update,
  };
}

export type PromoCodesData = ReturnType<typeof usePromoCodes>;
