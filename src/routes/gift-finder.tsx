import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PRODUCTS } from "@/lib/products";
import { PageHero, ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/gift-finder")({
  head: () => ({
    meta: [
      { title: "Trouver un Cadeau — MÉMORA" },
      {
        name: "description",
        content: "Répondez à 4 questions pour trouver le tirage photo connecté parfait pour votre proche.",
      },
      { property: "og:title", content: "Trouvez le cadeau MÉMORA idéal" },
      { property: "og:description", content: "4 questions simples, un cadeau inoubliable." },
    ],
  }),
  component: Finder,
});

const Q = [
  {
    key: "who",
    q: "À qui souhaitez-vous offrir ce cadeau ?",
    opts: [
      ["partner", "Mon / Ma partenaire"],
      ["family", "Mes parents ou ma famille"],
      ["friend", "Un(e) ami(e) proche"],
      ["me", "Pour moi-même"],
    ],
  },
  {
    key: "occasion",
    q: "Quelle est l'occasion célébrée ?",
    opts: [
      ["love", "Amour & Saint-Valentin"],
      ["birthday", "Anniversaire"],
      ["wedding", "Mariage ou fiançailles"],
      ["family", "Fête des mères / pères"],
      ["travel", "Voyage inoubliable"],
      ["special", "Un moment précieux"],
    ],
  },
  {
    key: "budget",
    q: "Quel est votre budget indicatif ?",
    opts: [
      ["50", "49 DT · Mémora Simple (Enveloppe & Carte)"],
      ["999", "Plusieurs exemplaires (Tarif dégressif)"],
    ],
  },
  {
    key: "style",
    q: "Quel style visuel préférez-vous ?",
    opts: [
      ["classic", "Classique & Authentique (Enveloppe d'art)"],
      ["romantic", "Romantique & Précieux"],
      ["minimal", "Minimaliste & Sobre"],
      ["modern", "Moderne"],
    ],
  },
] as const;

function Finder() {
  const [a, setA] = useState<Record<string, string>>({});
  const step = Q.findIndex((q) => !a[q.key]);
  const done = step === -1;
  const cur = Q[step === -1 ? 0 : step]!;
  const results = done
    ? PRODUCTS.map((p) => ({
        p,
        s:
          (p.occasions.includes(a["occasion"] ?? "") ? 3 : 0) +
          (p.style === a["style"] ? 2 : 0) +
          (p.priceTND <= Number(a["budget"] ?? 999) ? 2 : -5),
      }))
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map((r) => r.p)
    : [];

  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Gardez près de vous ce qui compte."
        intro="Trouvons ensemble le cadeau qui touchera le cœur de vos proches. 4 questions pour transformer vos plus beaux moments en souvenirs éternels."
      />
      <section className="container-x pb-32">
        {!done ? (
          <div key={step} className="animate-rise max-w-3xl">
            <p className="eyebrow">Question {step + 1} sur {Q.length}</p>
            <h2 className="mt-4 font-serif text-3xl sm:text-5xl">{cur.q}</h2>
            <div className="mt-10 flex flex-wrap gap-3">
              {cur.opts.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setA({ ...a, [cur.key]: v })}
                  className="rounded-lg border border-border bg-background px-6 py-4 text-sm font-medium hover:border-deep-brown hover:bg-cream transition-all shadow-xs"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
              <div>
                <p className="eyebrow">Sélection sur-mesure</p>
                <h2 className="mt-1 font-serif text-3xl sm:text-5xl">Nos recommandations pour vous</h2>
              </div>
              <button
                onClick={() => setA({})}
                className="text-xs uppercase tracking-wider font-semibold text-deep-brown underline underline-offset-4"
              >
                Recommencer le questionnaire
              </button>
            </div>
            <div className="mt-12 grid gap-10 sm:grid-cols-2 max-w-3xl mx-auto">
              {results.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
