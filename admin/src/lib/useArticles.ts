import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { cleanArticle, IMAGE_TYPES, validateArticle, validateImageFile, type Article } from "./rules";

// Sans droit admin, Supabase ne modifie aucune ligne et ne renvoie pas d'erreur : on vérifie le nombre.
const NOTHING_WRITTEN = "La base n'a rien enregistré (droits admin manquants ?). Recharge la page.";

const COLUMNS =
  "id, slug, format, active, sort_order, badge, dimensions, occasions, style, included_video_min, images, name, tagline, description, materials";

/** Ordre de la boutique : sort_order puis slug. */
const byShopOrder = (a: Article, b: Article) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug);

/** Ce que le formulaire d'article modifie (le style n'y est pas). `images` : URL publiques, dans l'ordre de la galerie. */
export type ArticleEdit = Pick<
  Article,
  | "id"
  | "slug"
  | "format"
  | "active"
  | "sort_order"
  | "badge"
  | "dimensions"
  | "occasions"
  | "included_video_min"
  | "name"
  | "tagline"
  | "description"
  | "materials"
  | "images"
>;

/** Bucket public des photos d'articles (lecture libre, écriture admin : migration catalogue_bucket). */
const BUCKET = "catalogue";

/**
 * Envoie une photo dans catalogue/<id de l'article>/ et renvoie son URL publique,
 * ou le message d'erreur. Rien n'est écrit dans products : c'est l'enregistrement de l'article qui le fait.
 */
export async function uploadArticleImage(articleId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalid = validateImageFile(file);
  if (invalid) return { error: invalid };
  const path = `${articleId}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) return { error: `Photo non envoyée : ${error.message}` };
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/**
 * Articles de l'onglet Catalogue (actifs et inactifs : la session admin lit tout), écrits
 * directement dans products. Pas de suppression : un article se désactive.
 * Les enregistrements renvoient "" en cas de succès, sinon le message à afficher.
 */
export function useArticles() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.from("products").select(COLUMNS).order("sort_order").order("slug");
    if (err) setError(`Articles non chargés : ${err.message}`);
    else setArticles(data as Article[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Article existant. `formats` : codes des formats connus (onglet Prix). */
  const update = async (edit: ArticleEdit, formats: string[]): Promise<string> => {
    const clean = cleanArticle(edit);
    const invalid = validateArticle(clean, articles ?? [], formats);
    if (invalid) return invalid;
    // Le format n'est pas écrit : le prix facturé (devis SQL) se déduit encore de l'id de l'article.
    const { id, format: _format, ...patch } = clean;
    const { data, error: err } = await supabase.from("products").update(patch).eq("id", id).select(COLUMNS);
    if (err) return err.code === "23505" ? `Le slug ${patch.slug} est déjà utilisé.` : err.message;
    const row = data?.[0] as Article | undefined;
    if (!row) return NOTHING_WRITTEN;
    setArticles((list) => list && list.map((a) => (a.id === id ? row : a)).sort(byShopOrder));
    return "";
  };

  return { articles, loading, error, load, update };
}

export type ArticlesData = ReturnType<typeof useArticles>;
