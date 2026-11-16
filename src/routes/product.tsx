import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { fetchProducts } from "@/lib/products";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/product")({
  // Parent de /product/$slug : beforeLoad tourne aussi pour la fiche produit.
  // On ne redirige que /product nu, sinon la fiche produit devient inaccessible.
  beforeLoad: async ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/product") {
      const [first] = await fetchProducts(supabase);
      if (!first) throw notFound();
      throw redirect({ to: "/product/$slug", params: { slug: first.slug } });
    }
  },
  component: Outlet,
});
