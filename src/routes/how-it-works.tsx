import { createFileRoute, Link } from "@tanstack/react-router";
import { Smartphone, Sparkles, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import scan from "@/assets/scan.jpg";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "Une photo, mille émotions — Comment ça marche — MÉMORA" },
      {
        name: "description",
        content:
          "Vos plus belles photos méritent mieux qu'un écran. Découvrez comment MÉMORA transforme vos moments précieux en souvenirs physiques qui prennent vie d'un simple contact.",
      },
    ],
  }),
  component: How,
});

const STEPS = [
  ["1. Choisissez votre vidéo", "Téléversez votre vidéo préférée ou utilisez notre outil de montage automatique gratuit pour combiner photos et clips avec musique."],
  ["2. Sélectionnez la photo", "Choisissez la photo qui sera imprimée au recto, ou extrayez une image précise directement depuis votre vidéo avec notre outil."],
  ["3. Nous intégrons la puce NFC", "Nous réalisons un tirage photographique d'art haute fidélité intégrant une puce NFC invisible programmée pour votre vidéo."],
  ["4. Notice imprimée au verso", "Chaque photo comporte au verso les 3 étapes simples d'utilisation pour que le destinataire comprenne immédiatement."],
  ["5. Approchez votre smartphone", "Aucune application n'est nécessaire. Posez simplement le haut d'un iPhone ou le dos d'un smartphone Android contre la photo."],
  ["6. La vidéo prend vie", "Une notification système apparaît : touchez-la et votre vidéo personnelle se lance instantanément dans le navigateur."],
];

function How() {
  return (
    <>
      <PageHero
        eyebrow="Transformez vos instants en souvenirs"
        title="Une photo, mille émotions."
        intro="Vos plus belles photos méritent mieux qu'un écran. MÉMORA combine l'émotion d'un tirage tangible et la magie du souvenir vidéo, sans aucune application à installer."
      />

      {/* 6 Steps Grid */}
      <section className="container-x py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <div
              key={t}
              className="rounded-3xl border border-sand/25 bg-card p-8 sm:p-10 shadow-luxury hover:shadow-luxury-lg hover:border-sand/60 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <span className="font-serif text-5xl text-sand font-bold tracking-tight">0{i + 1}</span>
                <h2 className="mt-5 font-serif text-2xl text-charcoal">{t}</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Flip Card Section */}
      <section className="container-x py-20 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-2 items-center">
          <div>
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">Autonomie du destinataire</p>
            <h2 className="mt-3 font-serif text-3xl sm:text-5xl text-charcoal tracking-tight">
              Le secret : tout est expliqué au verso.
            </h2>
            <p className="mt-6 text-base text-muted-foreground leading-relaxed">
              Vous offrez un cadeau à un proche ? Pas besoin de lui expliquer comment faire ni de lui faire installer une énième application.
            </p>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Le dos de chaque carte Mémora comporte un schéma clair indiquant l'emplacement de contact et les 3 étapes simples pour lancer la vidéo.
            </p>

            <div className="mt-8 space-y-3.5 text-sm">
              <div className="flex items-center gap-3.5">
                <div className="h-8 w-8 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-charcoal font-medium">Compatible avec 100% des iPhone récents (iPhone XS et ultérieurs)</span>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="h-8 w-8 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-charcoal font-medium">Compatible avec tous les smartphones Android dotés du NFC</span>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="h-8 w-8 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center text-deep-brown shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-charcoal font-medium">8 minutes de vidéo incluses par tirage (jusqu'à 30 minutes)</span>
              </div>
            </div>

            <div className="mt-10">
              <Link
                to="/commander"
                className="inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold"
              >
                <span>Créer mon tirage Mémora</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="flex justify-center">
            <FlipCardDemo />
          </div>
        </div>
      </section>
    </>
  );
}
