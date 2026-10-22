import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Smartphone, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import { cart } from "@/lib/cart";
import { getProduct, PRODUCTS, formatPrice } from "@/lib/products";
import { formatTND } from "@/lib/pricing";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.product.name} — MÉMORA` },
            { name: "description", content: loaderData.product.description },
          ],
        }
      : { meta: [{ title: "Non trouvé — MÉMORA" }] },
  notFoundComponent: () => (
    <div className="container-x py-48 text-center">
      <h1 className="text-5xl font-serif">Ce produit n'existe pas.</h1>
      <Link to="/commander" className="mt-8 inline-block underline">Retour à la boutique</Link>
    </div>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const [img, setImg] = useState(0);
  const related = PRODUCTS.filter((p) => p.id !== product.id).slice(0, 3);

  return (
    <>
      <section className="container-x grid gap-14 pb-24 pt-32 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-3xl border border-sand/20 shadow-luxury-lg bg-cream">
            <img
              src={product.images[img]}
              alt={product.name}
              width={1024}
              height={1024}
              className="aspect-[4/5] w-full object-cover transition-all duration-500"
            />
          </div>
          <div className="mt-4 flex gap-3">
            {product.images.map((src, i) => (
              <button
                key={i}
                onClick={() => setImg(i)}
                className={`w-20 overflow-hidden rounded-xl border transition-all ${
                  i === img
                    ? "border-deep-brown ring-2 ring-deep-brown ring-offset-2 shadow-xs"
                    : "border-sand/30 opacity-70 hover:opacity-100"
                }`}
              >
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="inline-flex items-center gap-2 rounded-full border border-sand/30 bg-sand/20 px-3.5 py-1 text-xs uppercase tracking-wider text-deep-brown font-semibold shadow-2xs">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Connecté par Puce NFC Invisible</span>
          </div>

          <h1 className="mt-4 font-serif text-4xl sm:text-5xl md:text-6xl text-charcoal tracking-tight">{product.name}</h1>
          <p className="mt-3 font-serif text-xl italic text-muted-foreground">{product.tagline}</p>
          <p className="mt-5 font-serif text-3xl sm:text-4xl font-bold text-charcoal">{formatPrice(product.priceTND)}</p>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

          <dl className="mt-8 divide-y divide-sand/20 border-y border-sand/20 text-xs sm:text-sm">
            {[
              ["Matériaux", product.materials.join(", ")],
              ["Dimensions", product.dimensions],
              ["Technologie", "Puce NFC intégrée, notice explicative au verso, 100% sans application"],
              ["Vidéo incluse", `${product.includedVideoMin} minutes de vidéo incluses (+1,50 DT/min au-delà, max 30 min)`],
              ["Livraison", product.delivery],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 py-3.5">
                <dt className="text-muted-foreground font-medium">{k}</dt>
                <dd className="text-charcoal">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/commander"
              search={{ format: product.formatCode, stage: "video" }}
              className="flex-1 rounded-full bg-primary px-8 py-4 text-center text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold"
            >
              Créer mon tirage
            </Link>
            <button
              onClick={() => {
                cart.add(product.id, { format: product.formatCode, qty: 1 });
                toast.success(`${product.name} ajouté à votre panier`);
              }}
              className="flex-1 rounded-full border border-charcoal/30 bg-transparent px-8 py-4 text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory transition-all font-semibold"
            >
              Ajouter au panier
            </button>
          </div>
        </div>
      </section>

      {/* Reassurance Features */}
      <section className="bg-cream/60 border-y border-sand/20 py-14">
        <div className="container-x grid gap-8 sm:grid-cols-3 text-center sm:text-left">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-charcoal">Sans aucune application</p>
              <p className="text-xs text-muted-foreground">iPhone et Android reconnus instantanément</p>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-charcoal">Notice d'utilisation au verso</p>
              <p className="text-xs text-muted-foreground">Tout est imprimé pour le destinataire</p>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-charcoal">Hébergement à vie</p>
              <p className="text-xs text-muted-foreground">Streaming instantané, données protégées</p>
            </div>
          </div>
        </div>
      </section>

      {/* Other Product Comparison */}
      {related.length > 0 && (
        <section className="container-x py-20 border-t border-sand/20">
          <div className="max-w-2xl mx-auto text-center">
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">L'autre formule MÉMORA</p>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-charcoal">Découvrez aussi</h2>
          </div>
          <div className="mt-8 max-w-md mx-auto">
            {related.map((p) => (
              <div
                key={p.id}
                className="rounded-3xl border border-sand/25 bg-card p-6 shadow-luxury hover:shadow-luxury-lg hover:border-sand/60 transition-all"
              >
                <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-cream border border-sand/15">
                  <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                  {p.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-linear-to-r from-deep-brown to-charcoal px-3 py-1 text-[10px] uppercase tracking-wider text-ivory font-medium">
                      {p.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-serif text-2xl text-charcoal">{p.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-sand/20">
                  <span className="font-serif text-xl font-bold text-charcoal">{formatPrice(p.priceTND)}</span>
                  <Link
                    to="/product/$slug"
                    params={{ slug: p.slug }}
                    className="text-xs uppercase tracking-wider font-semibold text-deep-brown underline underline-offset-4 hover:text-charcoal transition-colors"
                  >
                    Voir la formule →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
