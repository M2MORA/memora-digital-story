import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PRODUCTS } from "@/lib/products";
import { PageHero, ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/gift-finder")({
  head: () => ({
    meta: [
      { title: "Gift finder — MÉMORA" },
      { name: "description", content: "Answer four questions and discover the MÉMORA keepsake made for your moment." },
      { property: "og:title", content: "Find the perfect MÉMORA gift" },
      { property: "og:description", content: "Four questions, one meaningful gift." },
    ],
  }),
  component: Finder,
});

const Q = [
  { key: "who", q: "Who is the gift for?", opts: [["partner", "My partner"], ["family", "Family"], ["friend", "A friend"], ["me", "Myself"]] },
  { key: "occasion", q: "What is the occasion?", opts: [["love", "Love & anniversary"], ["birthday", "Birthday"], ["wedding", "Wedding"], ["family", "Family"], ["travel", "Travel"], ["special", "A special moment"]] },
  { key: "budget", q: "What is your budget?", opts: [["100", "Under 100 TND"], ["200", "Up to 200 TND"], ["999", "No limit"]] },
  { key: "style", q: "Which style do you prefer?", opts: [["minimal", "Minimal"], ["classic", "Classic"], ["romantic", "Romantic"], ["modern", "Modern"]] },
] as const;

function Finder() {
  const [a, setA] = useState<Record<string, string>>({});
  const step = Q.findIndex((q) => !a[q.key]);
  const done = step === -1;
  const results = done
    ? PRODUCTS.map((p) => ({
        p,
        s: (p.occasions.includes(a.occasion) ? 3 : 0) + (p.style === a.style ? 2 : 0) + (p.price <= +a.budget ? 2 : -5),
      }))
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map((r) => r.p)
    : [];

  return (
    <>
      <PageHero eyebrow="Gift finder" title="Let's find the piece made for your moment." />
      <section className="container-x pb-32">
        {!done ? (
          <div key={step} className="animate-rise">
            <p className="eyebrow">Question {step + 1} of {Q.length}</p>
            <h2 className="mt-4 text-4xl md:text-5xl">{Q[step].q}</h2>
            <div className="mt-10 flex flex-wrap gap-3">
              {Q[step].opts.map(([v, l]) => (
                <button key={v} onClick={() => setA({ ...a, [Q[step].key]: v })} className="border border-border px-6 py-4 hover:border-foreground hover:bg-cream">
                  {l}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <div className="flex items-end justify-between">
              <h2 className="text-4xl">Our recommendations</h2>
              <button onClick={() => setA({})} className="text-sm underline">Start again</button>
            </div>
            <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
