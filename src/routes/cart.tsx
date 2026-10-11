import { createFileRoute, Link } from "@tanstack/react-router";
import { cart, useStore } from "@/lib/cart";
import { formatPrice, getProduct } from "@/lib/products";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — MÉMORA" },
      { name: "description", content: "Review your MÉMORA creations before checkout." },
      { property: "og:title", content: "Your cart — MÉMORA" },
      { property: "og:description", content: "Review your MÉMORA creations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items } = useStore();
  const total = items.reduce((s, i) => s + (getProduct(i.productId)?.price ?? 0) * i.qty, 0);
  return (
    <section className="container-x min-h-[70vh] pb-24 pt-36">
      <h1 className="text-5xl md:text-6xl">Your cart</h1>
      {items.length === 0 ? (
        <div className="py-20">
          <p className="text-muted-foreground">Your cart is waiting for its first memory.</p>
          <Link to="/shop" className="mt-6 inline-block underline">Explore the collection</Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-14 lg:grid-cols-[1.6fr_1fr]">
          <ul className="divide-y divide-border border-y border-border">
            {items.map((i) => {
              const p = getProduct(i.productId);
              if (!p) return null;
              return (
                <li key={i.key} className="flex gap-6 py-6">
                  <img src={p.images[0]} alt={p.name} className="h-28 w-24 object-cover" />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <h3 className="font-serif text-2xl">{p.name}</h3>
                      <span>{formatPrice(p.price * i.qty)}</span>
                    </div>
                    {i.personalization?.title && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        “{i.personalization.title}” · {i.personalization.template} · {i.personalization.connectivity?.toUpperCase()}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      <button onClick={() => cart.setQty(i.key, i.qty - 1)} className="px-2">−</button>
                      <span>{i.qty}</span>
                      <button onClick={() => cart.setQty(i.key, i.qty + 1)} className="px-2">+</button>
                      <button onClick={() => cart.remove(i.key)} className="ml-auto text-muted-foreground underline">Remove</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <aside className="h-fit bg-cream p-8">
            <div className="flex justify-between text-lg"><span>Subtotal</span><span>{formatPrice(total)}</span></div>
            <p className="mt-2 text-sm text-muted-foreground">Delivery calculated at checkout.</p>
            <button disabled className="mt-8 w-full bg-primary py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground opacity-60">
              Checkout — opening soon
            </button>
            <p className="mt-4 text-xs text-muted-foreground">Online payment is being set up. Contact us to order today.</p>
          </aside>
        </div>
      )}
    </section>
  );
}
