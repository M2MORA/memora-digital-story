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
          <img
            src={product.images[img]}
            alt={product.name}
            width={1024}
            height={1024}
            className="aspect-[4/5] w-full bg-cream object-cover rounded-2xl border border-border shadow-md"
          />
          <div className="mt-4 flex gap-3">
            {product.images.map((src, i) => (
              <button
                key={i}
                onClick={() => setImg(i)}
                className={`w-20 overflow-hidden rounded-lg border ${
                  i === img ? "border-foreground ring-2 ring-deep-brown" : "border-border"
                }`}
              >
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sand/30 px-3 py-1 text-xs uppercase tracking-wider text-deep-brown font-medium">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Connecté par Puce NFC Invisible</span>
          </div>

          <h1 className="mt-4 font-serif text-4xl sm:text-5xl md:text-6xl">{product.name}</h1>
          <p className="mt-3 font-serif text-xl italic text-muted-foreground">{product.tagline}</p>
          <p className="mt-6 font-serif text-3xl font-bold text-charcoal">{formatPrice(product.priceTND)}</p>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

          <dl className="mt-8 divide-y divide-border border-y border-border text-xs sm:text-sm">
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

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/commander"
              search={{ format: product.formatCode, stage: "video" }}
              className="flex-1 rounded-sm bg-primary px-8 py-4 text-center text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
            >
              Créer mon tirage
            </Link>
            <button
              onClick={() => {
                cart.add(product.id, { format: product.formatCode, qty: 1 });
                toast.success(`${product.name} ajouté à votre panier`);
              }}
              className="flex-1 rounded-sm border border-foreground px-8 py-4 text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-foreground hover:text-background transition-colors"
            >
              Ajouter au panier
            </button>
          </div>
        </div>
      </section>

      {/* Reassurance Features */}
      <section className="bg-cream/40 border-y border-border py-16">
        <div className="container-x grid gap-8 sm:grid-cols-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-deep-brown shrink-0" />
            <div>
              <p className="font-semibold text-sm">Sans aucune application</p>
              <p className="text-xs text-muted-foreground">iPhone et Android reconnus instantanément</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-deep-brown shrink-0" />
            <div>
              <p className="font-semibold text-sm">Notice d'utilisation au verso</p>
              <p className="text-xs text-muted-foreground">Tout est imprimé pour le destinataire</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-deep-brown shrink-0" />
            <div>
              <p className="font-semibold text-sm">Hébergement à vie</p>
              <p className="text-xs text-muted-foreground">Streaming instantané, données protégées</p>
            </div>
          </div>
        </div>
      </section>

      {/* Other Product Comparison */}
      {related.length > 0 && (
        <section className="container-x py-20 border-t border-border">
          <div className="max-w-2xl mx-auto text-center">
            <p className="eyebrow">L'autre formule MÉMORA</p>
            <h2 className="mt-2 font-serif text-3xl">Découvrez aussi</h2>
          </div>
          <div className="mt-8 max-w-md mx-auto">
            {related.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-background p-6 shadow-xs hover:border-deep-brown hover:shadow-md transition-all"
              >
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                  <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                  {p.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-deep-brown px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-ivory">
                      {p.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-serif text-2xl">{p.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/70">
                  <span className="font-serif text-xl font-bold text-charcoal">{formatPrice(p.priceTND)}</span>
                  <Link
                    to="/product/$slug"
                    params={{ slug: p.slug }}
                    className="text-xs uppercase tracking-wider font-semibold text-deep-brown underline underline-offset-4"
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
