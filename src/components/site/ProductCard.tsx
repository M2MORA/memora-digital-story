import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { cart, useStore } from "@/lib/cart";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const { wishlist } = useStore();
  const wished = wishlist.includes(product.id);
  return (
    <div className="group rounded-3xl border border-sand/20 bg-card p-4 shadow-luxury hover:shadow-luxury-lg hover:border-sand/50 transition-all duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-cream border border-sand/15">
        <Link to="/product/$slug" params={{ slug: product.slug }}>
          <img
            src={product.images[0] ?? ""}
            alt={product.name}
            loading="lazy"
            width={1024}
            height={1024}
            className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </Link>
        <button
          onClick={() => cart.toggleWish(product.id)}
          aria-label="Ajouter aux favoris"
          className="absolute right-3.5 top-3.5 rounded-full bg-background/80 p-2.5 backdrop-blur-md border border-sand/30 shadow-xs hover:scale-110 active:scale-95 transition-transform"
        >
          <Heart className={`h-4 w-4 ${wished ? "fill-primary text-primary" : "text-charcoal"}`} strokeWidth={1.5} />
        </button>
      </div>
      <Link to="/product/$slug" params={{ slug: product.slug }} className="mt-4 block px-1">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-2xl text-charcoal">{product.name}</h3>
          <span className="text-base font-serif font-bold text-charcoal">{formatPrice(product.priceTND)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{product.tagline}</p>
      </Link>
    </div>
  );
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="container-x pb-16 pt-36 md:pt-44">
      <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em] animate-rise">{eyebrow}</p>
      <h1 className="mt-4 max-w-4xl animate-rise font-serif text-4xl sm:text-6xl md:text-7xl leading-[1.08] text-charcoal tracking-tight">{title}</h1>
      {intro && <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">{intro}</p>}
    </section>
  );
}
