import { useState } from "react";
import { Pencil, RefreshCw, X } from "lucide-react";
import { useArticles, type ArticleEdit } from "../lib/useArticles";
import { cleanArticle } from "../lib/rules";
import { IDLE, SaveRow, type Status } from "./SaveRow";

const LANGS = [
  ["fr", "Français (obligatoire)"],
  ["en", "Anglais (vide = texte français)"],
  ["ar", "Arabe (vide = texte français)"],
] as const;
type Lang = (typeof LANGS)[number][0];

// Clés stockées dans products.occasions (seed de la migration products).
const OCCASIONS: [string, string][] = [
  ["love", "Amour"],
  ["family", "Famille"],
  ["birthday", "Anniversaire"],
  ["special", "Moment spécial"],
  ["travel", "Voyage"],
];

// Champ vide = invalide (NaN) : la règle le refusera avec un message clair.
const int = (s: string) => (s.trim() === "" ? NaN : Number(s));

const copyDraft = (a: ArticleEdit, l: Lang) => ({
  name: a.name[l] ?? "",
  tagline: a.tagline[l] ?? "",
  description: a.description[l] ?? "",
  materials: (a.materials[l] ?? []).join("\n"),
});
type CopyDraft = ReturnType<typeof copyDraft>;

const toDraft = (a: ArticleEdit) => ({
  slug: a.slug,
  active: a.active,
  sort_order: String(a.sort_order),
  badge: a.badge ?? "",
  dimensions: a.dimensions,
  occasions: a.occasions,
  included_video_min: String(a.included_video_min),
  copy: { fr: copyDraft(a, "fr"), en: copyDraft(a, "en"), ar: copyDraft(a, "ar") },
});
type Draft = ReturnType<typeof toDraft>;

function fromDraft(d: Draft, a: ArticleEdit): ArticleEdit {
  const pick = (k: "name" | "tagline" | "description") => ({ fr: d.copy.fr[k], en: d.copy.en[k], ar: d.copy.ar[k] });
  const lines = (l: Lang) => d.copy[l].materials.split("\n");
  return {
    id: a.id,
    format: a.format,
    slug: d.slug,
    active: d.active,
    sort_order: int(d.sort_order),
    badge: d.badge,
    dimensions: d.dimensions,
    occasions: d.occasions,
    included_video_min: int(d.included_video_min),
    name: pick("name"),
    tagline: pick("tagline"),
    description: pick("description"),
    materials: { fr: lines("fr"), en: lines("en"), ar: lines("ar") },
  };
}

/**
 * Formulaire d'un article. Il part de `article` et rend la main à `save`
 * ("" si enregistré, sinon le message). Le format est affiché, pas modifié.
 */
export function ArticleForm({
  article,
  save,
  onClose,
}: {
  article: ArticleEdit;
  save: (edit: ArticleEdit) => Promise<string>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(article));
  const [status, setStatus] = useState<Status>(IDLE);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(article));

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setCopy = (l: Lang, patch: Partial<CopyDraft>) =>
    setDraft((d) => ({ ...d, copy: { ...d.copy, [l]: { ...d.copy[l], ...patch } } }));
  const toggleOccasion = (key: string, on: boolean) =>
    set({ occasions: on ? [...draft.occasions, key] : draft.occasions.filter((o) => o !== key) });

  // Occasions déjà en base mais inconnues ici : gardées et affichées telles quelles.
  const occasionChoices = [...OCCASIONS, ...article.occasions.filter((o) => !OCCASIONS.some(([k]) => k === o)).map((o) => [o, o])];

  const onSave = async () => {
    setStatus({ saving: true, message: "", ok: false });
    const edit = fromDraft(draft, article);
    const err = await save(edit);
    if (err) return setStatus({ saving: false, message: err, ok: false });
    // Valeurs nettoyées comme en base : le formulaire redevient « propre ».
    setDraft(toDraft(cleanArticle(edit)));
    setStatus({ saving: false, message: "Article enregistré.", ok: true });
  };

  return (
    <div className="panel">
      <div className="panel-title-row">
        <h3 className="panel-title">{article.name.fr || article.slug}</h3>
        <button type="button" className="icon-btn" aria-label="Fermer l'article" title="Fermer" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <label className="check">
        <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
        Visible dans la boutique
      </label>

      <label className="field">
        Slug (adresse de la page : /product/…)
        <input value={draft.slug} autoCapitalize="none" spellCheck={false} onChange={(e) => set({ slug: e.target.value })} />
      </label>
      <p className="hint">Changer le slug change l'adresse de la page : les anciens liens ne marcheront plus.</p>

      <div className="field">
        Format
        <p className="muted">{article.format}</p>
        <p className="hint">Non modifiable : le prix facturé au paiement ne suit pas encore ce champ.</p>
      </div>

      <label className="field">
        Ordre d'affichage (le plus petit en premier)
        <input inputMode="numeric" value={draft.sort_order} onChange={(e) => set({ sort_order: e.target.value })} />
      </label>
      <label className="field">
        Badge (vide = aucun)
        <input value={draft.badge} onChange={(e) => set({ badge: e.target.value })} />
      </label>
      <label className="field">
        Dimensions
        <input value={draft.dimensions} onChange={(e) => set({ dimensions: e.target.value })} />
      </label>
      <label className="field">
        Minutes de vidéo incluses
        <input
          inputMode="numeric"
          value={draft.included_video_min}
          onChange={(e) => set({ included_video_min: e.target.value })}
        />
      </label>

      <fieldset className="field checks">
        <legend>Occasions</legend>
        {occasionChoices.map(([key, label]) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={draft.occasions.includes(key!)}
              onChange={(e) => toggleOccasion(key!, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {LANGS.map(([l, label]) => (
        <fieldset key={l} className="field copy" dir={l === "ar" ? "rtl" : undefined}>
          <legend>{label}</legend>
          <label className="field">
            Nom
            <input value={draft.copy[l].name} onChange={(e) => setCopy(l, { name: e.target.value })} />
          </label>
          <label className="field">
            Accroche
            <input value={draft.copy[l].tagline} onChange={(e) => setCopy(l, { tagline: e.target.value })} />
          </label>
          <label className="field">
            Description
            <textarea rows={4} value={draft.copy[l].description} onChange={(e) => setCopy(l, { description: e.target.value })} />
          </label>
          <label className="field">
            Contenu (une ligne par élément)
            <textarea rows={4} value={draft.copy[l].materials} onChange={(e) => setCopy(l, { materials: e.target.value })} />
          </label>
        </fieldset>
      ))}

      <SaveRow
        dirty={dirty}
        status={status}
        onSave={() => void onSave()}
        onReset={() => {
          setDraft(toDraft(article));
          setStatus(IDLE);
        }}
      />
    </div>
  );
}

/** Section « Articles » : liste (actifs et inactifs) et formulaire de l'article choisi. */
export function Articles({ formats }: { formats: string[] }) {
  const data = useArticles();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!data.articles) {
    return data.loading ? (
      <p className="muted">Chargement des articles…</p>
    ) : (
      <div className="panel">
        <p className="error" role="alert">{data.error}</p>
        <button type="button" className="btn" onClick={() => void data.load()}>
          <RefreshCw size={16} aria-hidden /> Réessayer
        </button>
      </div>
    );
  }

  const open = data.articles.find((a) => a.id === openId);
  return (
    <>
      <div className="panel">
        <table className="tier-table">
          <thead>
            <tr>
              <th scope="col">Article</th>
              <th scope="col">Format</th>
              <th scope="col">Statut</th>
              <th scope="col">Ordre</th>
              <th scope="col"><span className="sr-only">Modifier</span></th>
            </tr>
          </thead>
          <tbody>
            {data.articles.map((a) => (
              <tr key={a.id}>
                <td>{a.name.fr}</td>
                <td>{a.format}</td>
                <td>{a.active ? "Actif" : "Inactif"}</td>
                <td>{a.sort_order}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Modifier ${a.name.fr}`}
                    aria-pressed={a.id === openId}
                    title="Modifier"
                    onClick={() => setOpenId(a.id)}
                  >
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.articles.length === 0 && <p className="muted">Aucun article.</p>}
        <p className="hint">Un article inactif n'apparaît plus dans la boutique ; il reste dans la liste.</p>
      </div>
      {open && (
        <ArticleForm
          key={open.id}
          article={open}
          save={(edit) => data.update(edit, formats)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
