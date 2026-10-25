import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PRODUCTS } from "@/lib/products";
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
          "Vos plus belles photos méritent mieux qu'un écran. Découvrez le tirage photo NFC MÉMORA, présenté dans son enveloppe d'art.",
      },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [q, setQ] = useState("");
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);

  const list = useMemo(() => {
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.description.toLowerCase().includes(q.toLowerCase()),
    );
  }, [q]);

  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Imprimez vos émotions."
        intro="Vos plus belles photos méritent mieux qu'un écran. Des souvenirs physiques à toucher, offrir et conserver pour toujours."
      />

      <section className="container-x pb-32">
        {/* Filter bar */}
        <div className="flex justify-end border-y border-sand/20 py-6">
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2 rounded-full border border-sand/30 bg-card/60 px-3.5 py-1.5 focus-within:border-deep-brown transition-all">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher..."
                className="w-36 bg-transparent outline-hidden text-xs text-charcoal"
              />
            </label>
            <button
              onClick={() => setIsPriceDrawerOpen(true)}
              className="text-xs uppercase tracking-wider font-semibold text-deep-brown underline underline-offset-4 hover:text-charcoal transition-colors"
            >
              Grille des tarifs
            </button>
          </div>
        </div>

        {/* Single product card */}
        <div className="mt-14 mx-auto max-w-2xl grid grid-cols-1 gap-8">
          {list.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col justify-between rounded-3xl border border-sand/25 bg-card p-6 sm:p-8 shadow-luxury hover:shadow-luxury-lg hover:border-sand/60 transition-all duration-300"
            >
              <div>
                <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-cream border border-sand/15">
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {p.badge && (
                    <span className="absolute left-3.5 top-3.5 rounded-full bg-linear-to-r from-deep-brown to-charcoal px-3.5 py-1 text-[11px] uppercase tracking-wider text-ivory font-medium shadow-xs">
                      {p.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-serif text-2xl sm:text-3xl text-charcoal">{p.name}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{p.tagline}</p>

                <div className="mt-4 rounded-2xl bg-cream/70 p-4 text-xs text-charcoal border border-sand/25">
                  <p className="font-semibold text-deep-brown mb-2 uppercase tracking-wider text-[10px]">
                    Ce qui est inclus :
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    {p.materials.map((mat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                        <span>{mat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-3xl font-serif font-bold text-charcoal">{formatTND(p.priceTND)}</span>
                  <span className="text-xs text-muted-foreground">/ pack complet</span>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <Link
                  to="/commander"
                  search={{ format: p.formatCode, stage: "video" }}
                  className="flex w-full items-center justify-center rounded-full bg-primary py-3.5 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold"
                >
                  Personnaliser &amp; Commander
                </Link>
                <Link
                  to="/product/$slug"
                  params={{ slug: p.slug }}
                  className="block text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
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
