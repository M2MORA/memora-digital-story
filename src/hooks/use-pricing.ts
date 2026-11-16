import { getRouteApi } from "@tanstack/react-router";
import type { Pricing } from "@/lib/pricing";

const rootApi = getRouteApi("__root__");

/** Tarifs lus par la route racine (get_pricing), pour toutes les pages du site hors /m/*. */
export function usePricing(): Pricing {
  const pricing = rootApi.useLoaderData({ select: (data) => data.pricing });
  if (!pricing) throw new Error("Tarifs non chargés");
  return pricing;
}

/** Pour les balises <title> et la description : les tarifs sont dans les données de la route racine */
export function pricingFromMatches(matches: readonly { loaderData?: unknown }[]): Pricing | null {
  return (matches[0]?.loaderData as { pricing?: Pricing | null } | undefined)?.pricing ?? null;
}
