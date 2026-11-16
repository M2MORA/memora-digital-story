import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { fetchProducts } from "@/lib/products";
import { supabase } from "@/lib/supabase";

// Un seul produit au catalogue : la boutique mène directement à la fiche du premier article actif.
export const Route = createFileRoute("/shop")({
  beforeLoad: async () => {
    const [first] = await fetchProducts(supabase);
    if (!first) throw notFound();
    throw redirect({ to: "/product/$slug", params: { slug: first.slug } });
  },
});
