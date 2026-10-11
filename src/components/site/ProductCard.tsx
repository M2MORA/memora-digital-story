import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { cart, useStore } from "@/lib/cart";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const { wishlist } = useStore();
  const wished = wishlist.includes(product.id);
  return (
    <div className="group">
      <div className="relative overflow-hidden bg-cream">
        <Link to="/product/$slug" params={{ slug: product.slug }}>
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            width={1024}
            height={1024}
            className="aspect-[4/5] w-full object-cover transition-transform duration-[1.4s] group-hover:scale-105"
          />
        </Link>
        <button
          onClick={() => cart.toggleWish(product.id)}
          aria-label="Add to wishlist"
          className="absolute right-4 top-4 rounded-full bg-background/80 p-2 backdrop-blur"
        >
          <Heart className={`h-4 w-4 ${wished ? "fill-primary text-primary" : ""}`} strokeWidth={1.4} />
        </button>
      </div>
      <Link to="/product/$slug" params={{ slug: product.slug }} className="mt-5 block">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-2xl">{product.name}</h3>
          <span className="text-sm text-muted-foreground">{formatPrice(product.price)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{product.tagline}</p>
      </Link>
    </div>
  );
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="container-x pb-16 pt-40 md:pt-48">
      <p className="eyebrow animate-rise">{eyebrow}</p>
      <h1 className="mt-6 max-w-4xl animate-rise text-5xl leading-[1.05] md:text-7xl">{title}</h1>
      {intro && <p className="mt-8 max-w-xl text-lg text-muted-foreground">{intro}</p>}
    </section>
  );
}
