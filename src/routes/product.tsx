import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { PRODUCTS } from "@/lib/products";

export const Route = createFileRoute("/product")({
  // Parent de /product/$slug : beforeLoad tourne aussi pour la fiche produit.
  // On ne redirige que /product nu, sinon la fiche produit devient inaccessible.
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/product") {
      throw redirect({ to: "/product/$slug", params: { slug: PRODUCTS[0]!.slug } });
    }
  },
  component: Outlet,
});
