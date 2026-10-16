import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Play,
  Film,
  Building2,
  Eye,
  Star,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import scan from "@/assets/scan.jpg";
import box from "@/assets/product-box.jpg";
import moments from "@/assets/product-moments.jpg";
import { PRODUCTS } from "@/lib/products";
import { formatTND } from "@/lib/pricing";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { PriceDrawer } from "@/components/site/PriceDrawer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "MÉMORA — Les instants passent. Les souvenirs restent.",
      },
      {
        name: "description",
        content:
          "Vos photos méritent mieux qu'un écran. Transformez vos plus beaux moments en souvenirs à toucher, offrir et conserver — avec une puce NFC invisible qui ouvre votre vidéo d'un simple contact. Make Memories Last.",
      },
    ],
  }),
  component: Home,
});

export function Home() {
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState(false);
  const [drawerFormat, setDrawerFormat] = useState<"10x15" | "magnet">("10x15");

  return (
    <>
      {/* Hero Section - Fullscreen without header at first */}
      <section className="relative flex min-h-screen items-center overflow-hidden">
        <img
          src={hero}
          alt="Tirage photo MÉMORA et smartphone"
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover animate-slow-zoom"
        />
        <div className="absolute inset-0 bg-linear-to-r from-charcoal/90 via-charcoal/60 to-charcoal/20" />

        <div className="container-x relative py-32 text-ivory">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-sand/20 px-3.5 py-1 text-xs uppercase tracking-widest text-sand backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Make Memories Last</span>
            </div>

            <h1 className="mt-6 animate-rise text-4xl sm:text-6xl md:text-7xl font-serif leading-[1.05]">
              Les instants passent. Les souvenirs restent.
            </h1>

            <p className="mt-6 text-base sm:text-lg text-ivory/80 leading-relaxed max-w-xl">
              <strong>Vos photos méritent mieux qu'un écran.</strong> Transformez vos plus beaux moments en souvenirs que vous pouvez toucher, offrir et conserver pour toujours — et d'un simple contact avec votre téléphone, votre vidéo prend vie.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/commander"
                className="rounded-sm bg-sand px-8 py-4 text-xs uppercase tracking-[0.2em] font-semibold text-charcoal hover:bg-ivory transition-colors shadow-lg"
              >
                Créer mon MÉMORA
              </Link>
              <Link
                to="/m/$memorySlug"
                params={{ memorySlug: "demo-leila-and-sami" }}
                className="inline-flex items-center gap-2 rounded-sm border border-ivory/60 px-6 py-4 text-xs uppercase tracking-[0.2em] text-ivory hover:bg-ivory/10 transition-colors backdrop-blur"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Tester la démo</span>
              </Link>
            </div>

            {/* Micro assurances */}
            <div className="mt-12 flex flex-wrap items-center gap-6 text-xs text-ivory/80">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-sand" /> Compatible iPhone & Android
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-sand" /> Notice imprimée au verso
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-sand" /> Paiement à la livraison en Tunisie
              </span>
            </div>
          </div>
        </div>

        {/* Scroll down hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-ivory/60 text-[10px] uppercase tracking-widest pointer-events-none animate-bounce">
          <span>Défiler pour découvrir</span>
          <ArrowRight className="h-3 w-3 rotate-90" />
        </div>
      </section>

      {/* 3 Step Concept Bar */}
      <section className="bg-cream/50 border-y border-border py-20">
        <div className="container-x">
          <p className="eyebrow text-center text-deep-brown font-semibold">Transformez vos instants en souvenirs</p>
          <h2 className="mt-2 text-center font-serif text-3xl sm:text-5xl">
            Capturez l'instant. Gardez l'émotion.
          </h2>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-8 text-center shadow-xs">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sand/30 font-serif text-2xl text-deep-brown">
                01
              </span>
              <h3 className="mt-6 font-serif text-2xl">1. Choisissez votre moment</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Sélectionnez la photo qui vous émeut et la vidéo personnelle qui raconte votre histoire (ou utilisez notre montage automatique gratuit).
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-8 text-center shadow-xs">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sand/30 font-serif text-2xl text-deep-brown">
                02
              </span>
              <h3 className="mt-6 font-serif text-2xl">2. L'artisanat prend vie</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Tirage d'art haute fidélité sur papier noble 300g/m² avec puce invisible programmée pour conserver votre souvenir à tout jamais.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-8 text-center shadow-xs">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sand/30 font-serif text-2xl text-deep-brown">
                03
              </span>
              <h3 className="mt-6 font-serif text-2xl">3. L'émotion d'un effleurement</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Posez simplement votre smartphone sur la photo. Sans application ni compte : la vidéo démarre aussitôt et réveille l'instant.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Storytelling Section: "Chaque souvenir a son histoire" */}
      <section className="bg-rose-poudre/25 border-b border-border/80 py-24">
        <div className="container-x text-center max-w-4xl">
          <p className="eyebrow text-deep-brown font-semibold tracking-[0.25em]">Make Memories Last</p>
          <h2 className="mt-3 font-serif text-3xl sm:text-5xl md:text-6xl text-charcoal leading-tight">
            Chaque souvenir a son histoire.
          </h2>
          <p className="mt-5 font-serif text-xl sm:text-2xl italic text-deep-brown">
            Un instant capturé. Une émotion préservée.
          </p>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Parce que les plus beaux moments méritent de ne jamais être oubliés. Vos plus belles photos méritent mieux qu'un écran : transformez vos moments préférés en souvenirs que vous pourrez toucher, offrir et conserver pour toujours.
          </p>

          <div className="mt-14 grid gap-6 sm:grid-cols-3 text-left">
            <div className="rounded-2xl border border-border/80 bg-background/90 p-7 shadow-xs">
              <span className="text-[11px] uppercase tracking-widest text-deep-brown font-semibold">01 · Amour & Couples</span>
              <h3 className="mt-3 font-serif text-2xl text-charcoal">Pour toujours ensemble</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Le jour de vos vœux, vos voyages à deux ou un simple regard complice. Un trésor à garder près du cœur.
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/90 p-7 shadow-xs">
              <span className="text-[11px] uppercase tracking-widest text-deep-brown font-semibold">02 · Famille & Enfants</span>
              <h3 className="mt-3 font-serif text-2xl text-charcoal">Les rires qui grandissent</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Les premiers pas, les anniversaires partagés. Un cadeau émouvant que parents et grands-parents chériront toute leur vie.
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/90 p-7 shadow-xs">
              <span className="text-[11px] uppercase tracking-widest text-deep-brown font-semibold">03 · Amis & Voyages</span>
              <h3 className="mt-3 font-serif text-2xl text-charcoal">La magie des instants partagés</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Ce fou rire spontané, cette nuit d'été inoubliable. Gardez près de vous ce qui compte vraiment.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="container-x py-28">
        <div className="grid gap-14 lg:grid-cols-2 items-center">
          <div>
            <p className="eyebrow">Autonomie totale pour les cadeaux</p>
            <h2 className="mt-3 font-serif text-3xl sm:text-5xl leading-tight">
              Et si le destinataire ne sait pas comment faire ?
            </h2>
            <p className="mt-6 text-base text-muted-foreground leading-relaxed">
              C'est la force de Mémora : chaque tirage comporte une <strong>notice d'utilisation claire et soignée imprimée au verso</strong>.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Que vous l'offriez à vos grands-parents, vos parents ou des amis, ils retournent la photo et comprennent immédiatement le geste magique.
            </p>

            <div className="mt-8 space-y-3.5 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0" />
                <span>Aucune application à chercher sur l'App Store ou Play Store</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0" />
                <span>Pas de QR code visible qui gâcherait le tirage d'art</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0" />
                <span>Emplacement exact du capteur NFC indiqué par un repère discret</span>
              </div>
            </div>

            <div className="mt-10">
              <Link
                to="/commander"
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
              >
                <span>Commander un tirage Mémora</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="flex justify-center">
            <FlipCardDemo />
          </div>
        </div>
      </section>

      {/* Product Catalogue Section */}
      <section className="bg-cream/40 border-t border-border py-28">
        <div className="container-x">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-deep-brown font-semibold">Du numérique au cœur</p>
              <h2 className="mt-2 font-serif text-3xl sm:text-5xl">Des photos à toucher, des souvenirs à vivre.</h2>
            </div>
            <button
              onClick={() => {
                setDrawerFormat("10x15");
                setIsPriceDrawerOpen(true);
              }}
              className="text-xs uppercase tracking-widest font-semibold text-deep-brown underline underline-offset-4"
            >
              Voir la grille des tarifs dégressifs
            </button>
          </div>

          <div className="mt-14 mx-auto max-w-4xl grid gap-8 sm:grid-cols-2">
            {PRODUCTS.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-background p-6 sm:p-8 shadow-xs hover:border-deep-brown hover:shadow-lg transition-all"
              >
                <div>
                  <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-cream">
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    {p.badge && (
                      <span className="absolute left-3 top-3 rounded-full bg-deep-brown px-3 py-1 text-[11px] uppercase tracking-wider text-ivory font-medium">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 font-serif text-2xl sm:text-3xl">{p.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{p.tagline}</p>

                  <div className="mt-4 rounded-xl bg-cream/50 p-3.5 text-xs text-charcoal border border-border/60">
                    <p className="font-semibold text-deep-brown mb-1.5 uppercase tracking-wider text-[10px]">
                      Ce qui est inclus :
                    </p>
                    <ul className="space-y-1 text-muted-foreground">
                      {p.materials.map((mat, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-deep-brown shrink-0" />
                          <span>{mat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-3xl font-serif text-charcoal">{formatTND(p.priceTND)}</span>
                    <span className="text-xs text-muted-foreground">/ pack complet</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2.5">
                  <Link
                    to="/commander"
                    search={{ format: p.formatCode, stage: "video" }}
                    className="flex w-full items-center justify-center rounded-sm bg-primary py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
                  >
                    Personnaliser & Créer
                  </Link>
                  <button
                    onClick={() => {
                      setDrawerFormat(p.formatCode === "box" ? "box" as any : "10x15");
                      setIsPriceDrawerOpen(true);
                    }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-1"
                  >
                    Voir les tarifs dégressifs
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Auto-Editor Promo Section (EditEasy) */}
      <section className="container-x py-28">
        <div className="rounded-3xl bg-linear-to-r from-deep-brown to-charcoal p-8 sm:p-14 text-ivory shadow-xl">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-sand/20 px-3.5 py-1 text-xs uppercase tracking-widest text-sand">
              <Film className="h-3.5 w-3.5" />
              <span>Nouveau · Outil Gratuit</span>
            </div>
            <h2 className="mt-4 font-serif text-3xl sm:text-5xl leading-tight">
              Ne laissez pas vos souvenirs dans votre téléphone.
            </h2>
            <p className="mt-4 text-ivory/80 text-sm sm:text-base leading-relaxed">
              Découvrez notre <strong>studio de montage automatique</strong> : glissez vos clips en vrac, choisissez une musique d'ambiance et laissez notre système créer une vidéo parfaitement synchronisée prête pour votre tirage Mémora.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/editeasy"
                className="rounded-sm bg-sand px-8 py-4 text-xs uppercase tracking-widest font-semibold text-charcoal hover:bg-ivory transition-colors shadow-md"
              >
                Lancer le montage automatique gratuit
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* B2B & Pro Section */}
      <section className="bg-cream/40 border-t border-border py-28">
        <div className="container-x">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sand/30 px-3 py-1 text-xs uppercase tracking-widest text-deep-brown font-medium">
                <Building2 className="h-3.5 w-3.5" />
                <span>Pour les Professionnels</span>
              </div>
              <h2 className="mt-3 font-serif text-3xl sm:text-5xl">
                Cartes de vœux connectées & Cadeaux d'affaires
              </h2>
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
                Offrez à vos clients et partenaires une expérience inoubliable pour vos vœux, inaugurations ou événements d'entreprise.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-charcoal">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-deep-brown" />
                  <span>Mise à jour de la vidéo à distance sans réimpression</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-deep-brown" />
                  <span>Bouton d'action (CTA) vers votre site en fin de vidéo</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-deep-brown" />
                  <span>Statistiques de scans en temps réel</span>
                </li>
              </ul>
              <div className="mt-8">
                <Link
                  to="/espace-entreprise"
                  className="rounded-sm border border-foreground px-6 py-3.5 text-xs uppercase tracking-widest text-charcoal hover:bg-foreground hover:text-background transition-colors inline-block"
                >
                  Découvrir l'offre B2B & Demander un échantillon
                </Link>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border shadow-xl">
              <img src={scan} alt="Mémora pour les entreprises" className="w-full h-80 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="container-x py-32 text-center">
        <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">Make Memories Last</p>
        <h2 className="mt-4 font-serif text-4xl sm:text-6xl md:text-7xl max-w-3xl mx-auto leading-tight">
          Vos plus beaux moments méritent de durer.
        </h2>
        <p className="mt-6 text-muted-foreground max-w-lg mx-auto text-base">
          Transformez vos instants précieux en souvenirs physiques à toucher et conserver pour toujours. Livraison soignée partout en Tunisie, offerte dès 250 DT.
        </p>
        <div className="mt-10">
          <Link
            to="/commander"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-10 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-lg"
          >
            <span>Créer mon tirage MÉMORA</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Price Drawer Modal */}
      <PriceDrawer
        isOpen={isPriceDrawerOpen}
        onClose={() => setIsPriceDrawerOpen(false)}
        initialFormat={drawerFormat}
      />
    </>
  );
}
