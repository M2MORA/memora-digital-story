import { getRouteApi } from "@tanstack/react-router";
import { useLang } from "@/i18n";
import { resolveProduct, type Product, type ProductRow } from "@/lib/products";

const rootApi = getRouteApi("__root__");

/** Active articles read by the root route, in the page language. Empty on /m/*. */
export function useProducts(): Product[] {
  const lang = useLang();
  const rows = rootApi.useLoaderData({ select: (data) => data.products });
  return (rows ?? []).map((row) => resolveProduct(row, lang));
}

/** For <title> and description tags: the articles are in the root route data. */
export function productsFromMatches(matches: readonly { loaderData?: unknown }[]): ProductRow[] {
  return (matches[0]?.loaderData as { products?: ProductRow[] | null } | undefined)?.products ?? [];
}
