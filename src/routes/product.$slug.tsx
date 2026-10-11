import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { cart } from "@/lib/cart";
import { formatPrice, getProduct, PRODUCTS } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

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
            { property: "og:title", content: `${loaderData.product.name} — MÉMORA` },
            { property: "og:description", content: loaderData.product.tagline },
            { property: "og:type", content: "product" },
          ],
        }
      : { meta: [{ title: "Not found — MÉMORA" }, { name: "robots", content: "noindex" }] },
  notFoundComponent: () => (
    <div className="container-x py-48 text-center">
      <h1 className="text-5xl">This piece doesn't exist.</h1>
      <Link to="/shop" className="mt-8 inline-block underline">Back to the shop</Link>
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
          <img src={product.images[img]} alt={product.name} width={1024} height={1024} className="aspect-[4/5] w-full bg-cream object-cover" />
          <div className="mt-4 flex gap-3">
            {product.images.map((src, i) => (
              <button key={i} onClick={() => setImg(i)} className={`w-20 border ${i === img ? "border-foreground" : "border-transparent"}`}>
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{product.connectivity.map((c) => c.toUpperCase()).join(" + ")} connected</p>
          <h1 className="mt-4 text-5xl md:text-6xl">{product.name}</h1>
          <p className="mt-4 font-serif text-2xl italic text-muted-foreground">{product.tagline}</p>
          <p className="mt-8 text-2xl">{formatPrice(product.price)}</p>
          <p className="mt-8 leading-relaxed text-muted-foreground">{product.description}</p>
          <dl className="mt-10 divide-y divide-border border-y border-border text-sm">
            {[
              ["Materials", product.materials.join(", ")],
              ["Dimensions", product.dimensions],
              ["Personalization", "Photos, title, date, letter, template, finish, audio & video"],
              ["Delivery", product.delivery],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 py-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link to="/create/$productId" params={{ productId: product.id }} className="flex-1 bg-primary px-8 py-4 text-center text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal">
              Customize
            </Link>
            <button
              onClick={() => { cart.add(product.id); toast.success(`${product.name} added to your cart`); }}
              className="flex-1 border border-foreground px-8 py-4 text-xs uppercase tracking-[0.2em] hover:bg-foreground hover:text-background"
            >
              Add to cart
            </button>
          </div>
        </div>
      </section>
      <section className="bg-cream py-20">
        <div className="container-x">
          <h2 className="text-3xl">Customer reviews</h2>
          <p className="mt-4 text-sm text-muted-foreground">No reviews yet — be the first to share your story after receiving your piece.</p>
        </div>
      </section>
      <section className="container-x py-24">
        <h2 className="text-4xl">You may also love</h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </>
  );
}
