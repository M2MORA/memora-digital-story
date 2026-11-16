import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/i18n";
import type { Format } from "./pricing";

/** Copy in the three site languages: `fr` is always there, `en` and `ar` may be missing. */
export type Localized<T> = { fr: T; en?: T; ar?: T };

/** A row of the products table, as the storefront reads it (active articles only). */
export type ProductRow = {
  id: string;
  slug: string;
  format: Format;
  sort_order: number;
  badge: string | null;
  dimensions: string;
  occasions: string[];
  style: string;
  included_video_min: number;
  images: string[];
  name: Localized<string>;
  tagline: Localized<string>;
  description: Localized<string>;
  materials: Localized<string[]>;
};

/** An article with its copy in one language. */
export type Product = {
  id: string;
  slug: string;
  formatCode: Format;
  badge: string | null;
  dimensions: string;
  occasions: string[];
  style: string;
  includedVideoMin: number;
  images: string[];
  name: string;
  tagline: string;
  description: string;
  materials: string[];
};

const COLUMNS =
  "id, slug, format, sort_order, badge, dimensions, occasions, style, included_video_min, images, name, tagline, description, materials";

/** The copy in `lang`, or the French copy when that language is missing or empty. */
export function localize<T extends string | string[]>(copy: Localized<T>, lang: Lang): T {
  const value = copy[lang];
  return value && value.length > 0 ? value : copy.fr;
}

export function resolveProduct(row: ProductRow, lang: Lang): Product {
  return {
    id: row.id,
    slug: row.slug,
    formatCode: row.format,
    badge: row.badge,
    dimensions: row.dimensions,
    occasions: row.occasions,
    style: row.style,
    includedVideoMin: row.included_video_min,
    images: row.images,
    name: localize(row.name, lang),
    tagline: localize(row.tagline, lang),
    description: localize(row.description, lang),
    materials: localize(row.materials, lang),
  };
}

// `active` is filtered here too: an admin signed in on the storefront may read inactive rows.
/** Active articles, in shop order. Throws when the database cannot be read. */
export async function fetchProducts(client: Pick<SupabaseClient, "from">): Promise<ProductRow[]> {
  const { data, error } = await client
    .from("products")
    .select(COLUMNS)
    .eq("active", true)
    .order("sort_order")
    .order("slug");
  if (error || !data)
    throw new Error(`Articles indisponibles : ${error?.message ?? "réponse vide"}`);
  return data as ProductRow[];
}

/** The active article with this slug, or null. Throws when the database cannot be read. */
export async function getProduct(
  client: Pick<SupabaseClient, "from">,
  slug: string,
): Promise<ProductRow | null> {
  const { data, error } = await client
    .from("products")
    .select(COLUMNS)
    .eq("active", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Article indisponible : ${error.message}`);
  return data as ProductRow | null;
}
