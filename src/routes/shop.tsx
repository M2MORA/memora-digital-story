import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORIES, PRODUCTS } from "@/lib/products";
import { PageHero, ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — MÉMORA" },
      { name: "description", content: "Photo plaques, memory boxes, digital frames and personalized gifts connected to private digital memories." },
      { property: "og:title", content: "Shop the MÉMORA collection" },
      { property: "og:description", content: "Timeless keepsakes, personalized in our studio. Prices in TND." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [max, setMax] = useState(300);
  const [sort, setSort] = useState("featured");
  const list = useMemo(() => {
    const r = PRODUCTS.filter(
      (p) => (cat === "all" || p.category === cat) && p.price <= max && p.name.toLowerCase().includes(q.toLowerCase()),
    );
    if (sort === "low") r.sort((a, b) => a.price - b.price);
    if (sort === "high") r.sort((a, b) => b.price - a.price);
    return r;
  }, [cat, q, max, sort]);

  return (
    <>
      <PageHero eyebrow="The collection" title="Objects made to hold a story." />
      <section className="container-x pb-32">
        <div className="flex flex-col gap-6 border-y border-border py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors ${cat === c.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2 border-b border-border pb-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-32 bg-transparent outline-hidden" />
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              Up to {max} TND
              <input type="range" min={50} max={300} step={10} value={max} onChange={(e) => setMax(+e.target.value)} className="accent-primary" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-transparent text-muted-foreground outline-hidden">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </div>
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        {list.length === 0 && <p className="py-20 text-center text-muted-foreground">No pieces match your filters.</p>}
      </section>
    </>
  );
}
