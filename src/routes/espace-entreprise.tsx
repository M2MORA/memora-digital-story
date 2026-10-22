import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  RefreshCw,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles,
  CheckCircle2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import moments from "@/assets/product-moments.jpg";
import scan from "@/assets/scan.jpg";

export const Route = createFileRoute("/espace-entreprise")({
  head: () => ({
    meta: [
      { title: "MÉMORA B2B — Cartes de Vœux & Objets Connectés pour Entreprises" },
      {
        name: "description",
        content:
          "Offrez des cartes de vœux, invitations et cadeaux d'affaires connectés par NFC. Vidéo modifiable à distance, bouton CTA et statistiques de scan en direct.",
      },
    ],
  }),
  component: EspaceEntreprisePage,
});

function EspaceEntreprisePage() {
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-32 pt-28">
      {/* Hero Section */}
      <section className="container-x max-w-5xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-sand/30 bg-sand/20 px-4 py-1.5 text-xs uppercase tracking-widest text-deep-brown font-semibold shadow-2xs">
          <Building2 className="h-3.5 w-3.5" />
          <span>Make Memories Last · Événements &amp; Entreprises</span>
        </div>
        <h1 className="mt-4 font-serif text-4xl sm:text-6xl md:text-7xl leading-tight text-charcoal tracking-tight">
          L'émotion prend forme pour vos événements.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Associez l'élégance d'une création d'art imprimée à la puissance d'une vidéo personnalisée. Faites durer la magie de vos moments forts avec vos partenaires et vos équipes.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="#devis"
            className="rounded-full bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold"
          >
            Demander un devis &amp; échantillon gratuit
          </a>
          <a
            href="#fonctionnalites"
            className="rounded-full border border-sand/30 bg-card/60 px-8 py-4 text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-sand/20 transition-all font-semibold"
          >
            Découvrir les fonctionnalités B2B
          </a>
        </div>
      </section>

      {/* Highlights Grid */}
      <section id="fonctionnalites" className="container-x mt-24">
        <p className="eyebrow text-center text-deep-brown font-semibold tracking-[0.2em]">Technologie B2B</p>
        <h2 className="mt-2 text-center font-serif text-3xl sm:text-5xl text-charcoal">
          Conçu pour sublimer votre communication d'entreprise
        </h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          <div className="rounded-3xl border border-sand/25 bg-card p-8 shadow-luxury hover:shadow-luxury-lg hover:border-sand/50 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand/20 border border-sand/30 text-deep-brown">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h3 className="mt-6 font-serif text-2xl text-charcoal">Mise à jour vidéo à distance</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Une fois vos cartes distribuées, vous pouvez changer ou actualiser la vidéo liée à tout moment depuis votre espace sans jamais avoir à réimprimer les cartes.
            </p>
          </div>

          <div className="rounded-3xl border border-sand/25 bg-card p-8 shadow-luxury hover:shadow-luxury-lg hover:border-sand/50 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand/20 border border-sand/30 text-deep-brown">
              <ExternalLink className="h-5 w-5" />
            </div>
            <h3 className="mt-6 font-serif text-2xl text-charcoal">Bouton CTA &amp; Génération de leads</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Ajoutez un bouton cliquable à la fin de la vidéo (vers votre site web, formulaire de prise de rendez-vous ou catalogue) pour transformer l'émotion en action concrète.
            </p>
          </div>

          <div className="rounded-3xl border border-sand/25 bg-card p-8 shadow-luxury hover:shadow-luxury-lg hover:border-sand/50 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand/20 border border-sand/30 text-deep-brown">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="mt-6 font-serif text-2xl text-charcoal">Statistiques de scan en direct</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Mesurez l'impact réel de votre campagne : nombre de consultations uniques, localisation géographique, taux d'engagement et pics de lecture.
            </p>
          </div>
        </div>
      </section>

      {/* Case studies / Formats */}
      <section className="container-x mt-28 rounded-3xl bg-cream/70 p-8 sm:p-14 border border-sand/25 shadow-luxury">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">Cas d'usage</p>
            <h2 className="mt-2 font-serif text-3xl sm:text-5xl text-charcoal">
              Pour vos moments d'entreprise les plus précieux
            </h2>
            <div className="mt-6 space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Vœux de fin d'année :</strong> Le mot vidéo de la direction ou de l'équipe incarné dans une carte luxueuse.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Inaugurations &amp; Salons :</strong> Un souvenir connecté remis aux participants pour revivre la journée.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Cadeaux VIP &amp; Relations clients :</strong> Remerciez vos partenaires avec un objet d'art qui ne finit pas à la poubelle.</span>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-xs text-charcoal font-medium">
              <span className="flex items-center gap-2"><Package className="h-4 w-4 text-deep-brown" /> À partir de 50 ex.</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-deep-brown" /> Hébergement sécurisé &amp; confidentiel</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-sand/20 shadow-luxury-lg">
            <img src={scan} alt="Mémora carte professionnelle" className="w-full h-80 object-cover" />
          </div>
        </div>
      </section>

      {/* Quote & Sample Request Form */}
      <section id="devis" className="container-x mt-28 max-w-3xl">
        <div className="rounded-3xl border border-sand/25 bg-card p-8 sm:p-12 shadow-luxury">
          <p className="eyebrow text-center text-deep-brown font-semibold tracking-[0.2em]">Devis &amp; Échantillon</p>
          <h2 className="mt-2 text-center font-serif text-3xl sm:text-4xl text-charcoal">
            Recevez un échantillon personnalisé gratuit
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Testez la magie Mémora sur vos propres smartphones. Réponse sous 24h ouvrées.
          </p>

          {sent ? (
            <div className="mt-10 rounded-2xl bg-sand/20 border border-sand/30 p-8 text-center animate-in fade-in">
              <CheckCircle2 className="mx-auto h-12 w-12 text-deep-brown" />
              <h3 className="mt-4 font-serif text-2xl text-charcoal">Demande bien reçue !</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Notre responsable B2B vous contactera sous 24 heures pour concevoir votre échantillon ou affiner votre devis.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
                toast.success("Votre demande a bien été envoyée !");
              }}
              className="mt-10 space-y-5"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Prénom &amp; Nom *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Jean Dupont"
                    className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Entreprise / Organisation *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Acme Corp"
                    className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Email professionnel *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="jean@acme.com"
                    className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="+216 98 000 000"
                    className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Quantité estimée
                  </label>
                  <select className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal">
                    <option value="sample">Je souhaite un échantillon d'abord</option>
                    <option value="50-100">50 à 100 exemplaires</option>
                    <option value="100-500">100 à 500 exemplaires</option>
                    <option value="500-1000">500 à 1 000 exemplaires</option>
                    <option value="1000+">Plus de 1 000 exemplaires</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Format souhaité
                  </label>
                  <select className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal">
                    <option value="carte">Carte Photo 10×15 cm (Classique)</option>
                    <option value="magnet">Magnet 10×15 cm</option>
                    <option value="cadre">Format Encadré 20×30 cm</option>
                    <option value="sur-mesure">Format spécial / carte de visite</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  Détails de votre projet / Événement
                </label>
                <textarea
                  rows={4}
                  placeholder="Décrivez votre besoin : date de l'événement, besoins d'intégration, adresse pour l'envoi de l'échantillon..."
                  className="w-full rounded-xl border border-sand/30 bg-background/60 p-4 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold cursor-pointer"
              >
                <Send className="h-4 w-4" />
                <span>Envoyer ma demande professionnelle</span>
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
