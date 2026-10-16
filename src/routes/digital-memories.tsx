import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Smartphone, Sparkles, ShieldCheck, Lock, Play, ArrowRight } from "lucide-react";
import moments from "@/assets/product-moments.jpg";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/digital-memories")({
  head: () => ({
    meta: [
      { title: "Vos souvenirs prennent vie — MÉMORA" },
      {
        name: "description",
        content: "Du numérique au cœur. Découvrez l'expérience MÉMORA : un simple contact de votre smartphone fait revivre votre vidéo personnelle.",
      },
    ],
  }),
  component: Digital,
});

const FEATURES = [
  [Smartphone, "100% Sans Application", "Fonctionne directement avec la puce NFC native de votre iPhone ou Android."],
  [Film, "8 minutes de vidéo incluses", "Vos plus beaux films en streaming fluide et haute définition (jusqu'à 30 min)."],
  [Sparkles, "Puce NFC invisible", "Dissimulée à l'intérieur du papier photo d'art 300g/m²."],
  [ShieldCheck, "Notice imprimée au dos", "Le destinataire comprend seul en tournant la carte : 3 étapes simples."],
  [Lock, "Hébergement sécurisé", "Serveurs sécurisés, données protégées et privées."],
  [Play, "Autoplay instantané", "Votre vidéo s'ouvre d'un seul geste sans attente ni publicités."],
] as const;

function Digital() {
  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Vos souvenirs prennent vie."
        intro="Du numérique au cœur : une véritable photo d'art tangible qui réveille toute l'émotion de votre vidéo lorsqu'on l'effleure avec un smartphone. Sans application."
      />

      <section className="container-x grid gap-8 sm:grid-cols-2 lg:grid-cols-3 pb-24">
        {FEATURES.map(([Icon, t, d]) => (
          <div key={t} className="rounded-2xl border border-border bg-background p-8 shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand/30 text-deep-brown">
              <Icon className="h-6 w-6" strokeWidth={1.4} />
            </div>
            <h3 className="mt-6 font-serif text-2xl">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</p>
          </div>
        ))}
      </section>

      <section className="bg-cream/40 border-t border-border py-28">
        <div className="container-x grid items-center gap-16 md:grid-cols-2">
          <div>
            <p className="eyebrow">Démonstration en direct</p>
            <h2 className="mt-2 text-4xl sm:text-5xl font-serif">
              Testez l'expérience telle que la vivra votre destinataire.
            </h2>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              Découvrez la page épurée et immersive qui s'ouvre lorsque quelqu'un touche un tirage MÉMORA avec son téléphone.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/m/$memorySlug"
                params={{ memorySlug: "demo-leila-and-sami" }}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Voir la page souvenir démo</span>
              </Link>
              <Link
                to="/commander"
                className="inline-flex items-center gap-2 rounded-sm border border-foreground px-8 py-4 text-xs uppercase tracking-widest text-charcoal hover:bg-foreground hover:text-background transition-colors"
              >
                <span>Commander</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <img
            src={moments}
            alt="Tirage photo MÉMORA"
            loading="lazy"
            className="w-full rounded-2xl border border-border shadow-xl object-cover aspect-4/5"
          />
        </div>
      </section>
    </>
  );
}
