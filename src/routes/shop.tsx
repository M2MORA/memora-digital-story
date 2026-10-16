import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { CATEGORIES, PRODUCTS } from "@/lib/products";
import { PageHero } from "@/components/site/ProductCard";
import { formatTND } from "@/lib/pricing";
import { PriceDrawer } from "@/components/site/PriceDrawer";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Imprimez vos émotions — La Boutique — MÉMORA" },
      {
        name: "description",
        content:
          "Vos plus belles photos méritent mieux qu'un écran. Découvrez la collection MÉMORA : tirages photo NFC, Magnets aimantés, Grands formats encadrés et cartes cadeaux.",
      },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);

  const list = useMemo(() => {
    return PRODUCTS.filter(
      (p) =>
        (cat === "all" || p.category === cat) &&
        (p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.description.toLowerCase().includes(q.toLowerCase())),
    );
  }, [cat, q]);

  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Imprimez vos émotions."
        intro="Vos plus belles photos méritent mieux qu'un écran. Des souvenirs physiques à toucher, offrir et conserver pour toujours."
      />

      <section className="container-x pb-32">
        {/* Filter bar */}
        <div className="flex flex-col gap-6 border-y border-border py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors rounded-sm ${
                  cat === c.id
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2 border-b border-border pb-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher"
                className="w-36 bg-transparent outline-hidden text-xs"
              />
            </label>
            <button
              onClick={() => setIsPriceDrawerOpen(true)}
              className="text-xs uppercase tracking-wider font-semibold text-deep-brown underline underline-offset-4"
            >
              Grille des tarifs
            </button>
          </div>
        </div>

        {/* Product Cards Grid - 2 Products Showcase */}
        <div className="mt-14 mx-auto max-w-4xl grid gap-8 sm:grid-cols-2">
          {list.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-background p-6 sm:p-8 shadow-xs hover:border-deep-brown hover:shadow-lg transition-all"
            >
              <div>
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {p.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-deep-brown px-3 py-1 text-[11px] uppercase tracking-wider text-ivory font-medium shadow-xs">
                      {p.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-serif text-2xl sm:text-3xl">{p.name}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{p.tagline}</p>

                <div className="mt-4 rounded-xl bg-cream/50 p-3.5 text-xs text-charcoal border border-border/60">
                  <p className="font-semibold text-deep-brown mb-1.5 uppercase tracking-wider text-[10px]">
                    Ce qui est inclus :
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {p.materials.map((mat, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                        <span>{mat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-serif text-charcoal">{formatTND(p.priceTND)}</span>
                  <span className="text-xs text-muted-foreground">/ pack complet</span>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <Link
                  to="/commander"
                  search={{ format: p.formatCode, stage: "video" }}
                  className="flex w-full items-center justify-center rounded-sm bg-primary py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                >
                  Personnaliser & Commander
                </Link>
                <Link
                  to="/product/$slug"
                  params={{ slug: p.slug }}
                  className="block text-center text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  Voir tous les détails du produit →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PriceDrawer
        isOpen={isPriceDrawerOpen}
        onClose={() => setIsPriceDrawerOpen(false)}
      />
    </>
  );
}
