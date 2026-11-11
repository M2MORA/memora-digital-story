import { createFileRoute, redirect } from "@tanstack/react-router";
import { PRODUCTS } from "@/lib/products";

// Un seul produit au catalogue : la boutique mène directement à sa fiche.
export const Route = createFileRoute("/shop")({
  beforeLoad: () => {
    throw redirect({ to: "/product/$slug", params: { slug: PRODUCTS[0]!.slug } });
  },
});
