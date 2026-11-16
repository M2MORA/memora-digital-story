import { useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { usePricing, type PricingData, type PricingFormat, type PricingSettings } from "../lib/usePricing";
import { usePromoCodes, type PromoCodesData } from "../lib/usePromoCodes";
import { normalizePromoCode, type PromoCode } from "../lib/rules";

import { Articles } from "./Articles";
import { IDLE, SaveRow, type Status } from "./SaveRow";

// Champ vide = invalide (NaN) : la règle le refusera avec un message clair.
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

const formatLabel = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace("x", " × ");

type TierDraft = { min_qty: string; unit_price: string };
const formatDraft = (f: PricingFormat) => ({
  frame: String(f.frame_price),
  tiers: f.tiers.map((t) => ({ min_qty: String(t.min_qty), unit_price: String(t.unit_price) })),
});

/** Grille de paliers et prix du cadre d'un format. */
function FormatPrices({ format, save }: { format: PricingFormat; save: PricingData["saveFormat"] }) {
  const [draft, setDraft] = useState(() => formatDraft(format));
  const [status, setStatus] = useState<Status>(IDLE);
  const dirty = JSON.stringify(draft) !== JSON.stringify(formatDraft(format));

  const setTier = (i: number, patch: Partial<TierDraft>) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const onSave = async () => {
    setStatus({ saving: true, message: "", ok: false });
    const tiers = draft.tiers.map((t) => ({ min_qty: num(t.min_qty), unit_price: num(t.unit_price) }));
    const err = await save(format.code, num(draft.frame), tiers);
    if (err) return setStatus({ saving: false, message: err, ok: false });
    // Valeurs normalisées (paliers triés, « 12,50 » → 12.5) : le formulaire redevient « propre ».
    setDraft({
      frame: String(num(draft.frame)),
      tiers: [...tiers]
        .sort((a, b) => a.min_qty - b.min_qty)
        .map((t) => ({ min_qty: String(t.min_qty), unit_price: String(t.unit_price) })),
    });
    setStatus({ saving: false, message: "Prix enregistrés.", ok: true });
  };

  return (
    <div className="panel">
      <h3 className="panel-title">
        {formatLabel(format.code)}
        {!format.active && " (inactif)"}
      </h3>

      <table className="tier-table">
        <thead>
          <tr>
            <th scope="col">À partir de (ex.)</th>
            <th scope="col">Prix unitaire (DT)</th>
            <th scope="col"><span className="sr-only">Retirer</span></th>
          </tr>
        </thead>
        <tbody>
          {draft.tiers.map((t, i) => (
            <tr key={i}>
              <td>
                <input
                  inputMode="numeric"
                  value={t.min_qty}
                  aria-label={`Quantité minimale, palier ${i + 1}`}
                  onChange={(e) => setTier(i, { min_qty: e.target.value })}
                />
              </td>
              <td>
                <input
                  inputMode="decimal"
                  value={t.unit_price}
                  aria-label={`Prix unitaire, palier ${i + 1}`}
                  onChange={(e) => setTier(i, { unit_price: e.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Retirer le palier ${i + 1}`}
                  title="Retirer le palier"
                  onClick={() => setDraft((d) => ({ ...d, tiers: d.tiers.filter((_, j) => j !== i) }))}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="btn"
        onClick={() => setDraft((d) => ({ ...d, tiers: [...d.tiers, { min_qty: "", unit_price: "" }] }))}
      >
        <Plus size={16} aria-hidden /> Ajouter un palier
      </button>

      <label className="field">
        Prix du cadre (DT)
        <input inputMode="decimal" value={draft.frame} onChange={(e) => setDraft((d) => ({ ...d, frame: e.target.value }))} />
      </label>

      <SaveRow
        dirty={dirty}
        status={status}
        onSave={() => void onSave()}
        onReset={() => {
          setDraft(formatDraft(format));
          setStatus(IDLE);
        }}
      />
    </div>
  );
}

const settingsDraft = (s: PricingSettings) => ({
  shipping_fee_aramex: String(s.shipping_fee_aramex),
  shipping_fee_mondial_relay: String(s.shipping_fee_mondial_relay),
  free_shipping_threshold: String(s.free_shipping_threshold),
  included_video_minutes: String(s.included_video_seconds / 60),
  surcharge_per_minute: String(s.surcharge_per_minute),
});
type SettingsDraft = ReturnType<typeof settingsDraft>;

const SETTINGS_FIELDS: [keyof SettingsDraft, string][] = [
  ["shipping_fee_aramex", "Livraison Aramex (DT)"],
  ["shipping_fee_mondial_relay", "Livraison Mondial Relay (DT)"],
  ["free_shipping_threshold", "Livraison gratuite à partir de (DT)"],
  ["included_video_minutes", "Minutes de vidéo incluses"],
  ["surcharge_per_minute", "Supplément par minute en plus (DT)"],
];

/** Frais de livraison, seuil de gratuité et vidéo. */
function ShippingVideo({ settings, save }: { settings: PricingSettings; save: PricingData["saveShippingVideo"] }) {
  const [draft, setDraft] = useState(() => settingsDraft(settings));
  const [status, setStatus] = useState<Status>(IDLE);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settingsDraft(settings));

  const onSave = async () => {
    setStatus({ saving: true, message: "", ok: false });
    const values = {
      shipping_fee_aramex: num(draft.shipping_fee_aramex),
      shipping_fee_mondial_relay: num(draft.shipping_fee_mondial_relay),
      free_shipping_threshold: num(draft.free_shipping_threshold),
      included_video_minutes: num(draft.included_video_minutes),
      surcharge_per_minute: num(draft.surcharge_per_minute),
    };
    const err = await save(values);
    if (err) return setStatus({ saving: false, message: err, ok: false });
    setDraft(
      settingsDraft({ ...settings, ...values, included_video_seconds: Math.round(values.included_video_minutes * 60) }),
    );
    setStatus({ saving: false, message: "Réglages enregistrés.", ok: true });
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Livraison et vidéo</h3>
      {SETTINGS_FIELDS.map(([key, label]) => (
        <label key={key} className="field">
          {label}
          <input inputMode="decimal" value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
        </label>
      ))}
      <p className="hint">Durée maximale d'une vidéo : {settings.max_video_seconds / 60} min.</p>
      <SaveRow
        dirty={dirty}
        status={status}
        onSave={() => void onSave()}
        onReset={() => {
          setDraft(settingsDraft(settings));
          setStatus(IDLE);
        }}
      />
    </div>
  );
}

const promoDraft = (codes: PromoCode[]) => codes.map((c) => ({ percent: String(c.percent), active: c.active }));

/** Codes existants : pourcentage et activation, enregistrés ensemble. Pas de suppression. */
function PromoList({ codes, update }: { codes: PromoCode[]; update: PromoCodesData["update"] }) {
  const [draft, setDraft] = useState(() => promoDraft(codes));
  const [status, setStatus] = useState<Status>(IDLE);
  const dirty = JSON.stringify(draft) !== JSON.stringify(promoDraft(codes));

  const setRow = (i: number, patch: Partial<(typeof draft)[number]>) =>
    setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onSave = async () => {
    setStatus({ saving: true, message: "", ok: false });
    const rows = draft.map((r) => ({ percent: num(r.percent), active: r.active }));
    for (const [i, c] of codes.entries()) {
      const row = rows[i]!;
      if (row.percent === c.percent && row.active === c.active) continue;
      const err = await update(c.code, row);
      if (err) return setStatus({ saving: false, message: `${c.code} : ${err}`, ok: false });
    }
    setDraft(rows.map((r) => ({ percent: String(r.percent), active: r.active })));
    setStatus({ saving: false, message: "Codes promo enregistrés.", ok: true });
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Codes existants</h3>
      {codes.length === 0 ? (
        <p className="muted">Aucun code promo.</p>
      ) : (
        <table className="tier-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Réduction (%)</th>
              <th scope="col">Actif</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c, i) => (
              <tr key={c.code}>
                <td>{c.code}</td>
                <td>
                  <input
                    inputMode="decimal"
                    value={draft[i]!.percent}
                    aria-label={`Réduction du code ${c.code}`}
                    onChange={(e) => setRow(i, { percent: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft[i]!.active}
                    aria-label={`Code ${c.code} actif`}
                    onChange={(e) => setRow(i, { active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Un code désactivé ne donne plus de réduction ; il reste dans la liste.</p>
      <SaveRow
        dirty={dirty}
        status={status}
        onSave={() => void onSave()}
        onReset={() => {
          setDraft(promoDraft(codes));
          setStatus(IDLE);
        }}
      />
    </div>
  );
}

/** Nouveau code promo, actif dès sa création. */
function NewPromo({ create }: { create: PromoCodesData["create"] }) {
  const [draft, setDraft] = useState({ code: "", percent: "" });
  const [status, setStatus] = useState<Status>(IDLE);
  const dirty = draft.code !== "" || draft.percent !== "";

  const onSave = async () => {
    setStatus({ saving: true, message: "", ok: false });
    const err = await create(draft.code, num(draft.percent));
    if (err) return setStatus({ saving: false, message: err, ok: false });
    setStatus({ saving: false, message: `Code ${normalizePromoCode(draft.code)} créé.`, ok: true });
    setDraft({ code: "", percent: "" });
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Nouveau code</h3>
      <label className="field">
        Code
        <input
          value={draft.code}
          autoCapitalize="characters"
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
        />
      </label>
      <label className="field">
        Réduction (%)
        <input inputMode="decimal" value={draft.percent} onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))} />
      </label>
      <SaveRow
        dirty={dirty}
        status={status}
        onSave={() => void onSave()}
        onReset={() => {
          setDraft({ code: "", percent: "" });
          setStatus(IDLE);
        }}
      />
    </div>
  );
}

/** Section « Codes promo » : la liste n'est lisible que par les admins (droits de la base). */
function PromoCodes() {
  const promos = usePromoCodes();

  if (!promos.codes) {
    return promos.loading ? (
      <p className="muted">Chargement des codes promo…</p>
    ) : (
      <div className="panel">
        <p className="error" role="alert">{promos.error}</p>
        <button type="button" className="btn" onClick={() => void promos.load()}>
          <RefreshCw size={16} aria-hidden /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Remonte la liste quand un code est créé : le brouillon suit les lignes. */}
      <PromoList key={promos.codes.map((c) => c.code).join()} codes={promos.codes} update={promos.update} />
      <NewPromo create={promos.create} />
    </>
  );
}

/**
 * Onglet Catalogue. Chaque section enregistre seule et s'ajoute comme un panneau de plus
 * dans <section className="settings catalogue">.
 * Les commandes passées gardent leurs prix : order_items stocke les prix facturés.
 */
export default function Catalogue() {
  const pricing = usePricing();

  if (!pricing.pricing) {
    return (
      <section className="settings catalogue">
        {pricing.loading ? (
          <p className="muted">Chargement des prix…</p>
        ) : (
          <div className="panel">
            <p className="error" role="alert">{pricing.error}</p>
            <button type="button" className="btn" onClick={() => void pricing.load()}>
              <RefreshCw size={16} aria-hidden /> Réessayer
            </button>
          </div>
        )}
      </section>
    );
  }

  const { formats, settings } = pricing.pricing;
  return (
    <section className="settings catalogue">
      {pricing.error && <p className="error" role="alert">{pricing.error}</p>}
      <h2 className="sub-title">Prix</h2>
      {formats.map((f) => (
        <FormatPrices key={`${f.code}-${pricing.version}`} format={f} save={pricing.saveFormat} />
      ))}
      <ShippingVideo key={`settings-${pricing.version}`} settings={settings} save={pricing.saveShippingVideo} />
      <h2 className="sub-title">Codes promo</h2>
      <PromoCodes />
      <h2 className="sub-title">Articles</h2>
      <Articles formats={formats} />
    </section>
  );
}
