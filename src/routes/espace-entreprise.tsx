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
  const [sampleRequested, setSampleRequested] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-32 pt-28">
      {/* Hero Section */}
      <section className="container-x max-w-5xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-sand/30 px-3.5 py-1 text-xs uppercase tracking-widest text-deep-brown font-medium">
          <Building2 className="h-3.5 w-3.5" />
          <span>Make Memories Last · Événements & Entreprises</span>
        </div>
        <h1 className="mt-4 font-serif text-4xl sm:text-6xl md:text-7xl leading-tight">
          L'émotion prend forme pour vos événements.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Associez l'élégance d'une création d'art imprimée à la puissance d'une vidéo personnalisée. Faites durer la magie de vos moments forts avec vos partenaires et vos équipes.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="#devis"
            className="rounded-sm bg-primary px-8 py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
          >
            Demander un devis & échantillon gratuit
          </a>
          <a
            href="#fonctionnalites"
            className="rounded-sm border border-border px-8 py-4 text-xs uppercase tracking-widest text-charcoal hover:bg-cream transition-colors"
          >
            Découvrir les fonctionnalités B2B
          </a>
        </div>
      </section>

      {/* Highlights Grid */}
      <section id="fonctionnalites" className="container-x mt-24">
        <p className="eyebrow text-center">Technologie B2B</p>
        <h2 className="mt-2 text-center font-serif text-3xl sm:text-5xl">
          Conçu pour sublimer votre communication d'entreprise
        </h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-8 shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand/30 text-deep-brown">
              <RefreshCw className="h-6 w-6" />
            </div>
            <h3 className="mt-6 font-serif text-2xl">Mise à jour vidéo à distance</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Une fois vos cartes distribuées, vous pouvez changer ou actualiser la vidéo liée à tout moment depuis votre espace sans jamais avoir à réimprimer les cartes.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-8 shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand/30 text-deep-brown">
              <ExternalLink className="h-6 w-6" />
            </div>
            <h3 className="mt-6 font-serif text-2xl">Bouton CTA & Génération de leads</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Ajoutez un bouton cliquable à la fin de la vidéo (vers votre site web, formulaire de prise de rendez-vous ou catalogue) pour transformer l'émotion en action concrète.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-8 shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand/30 text-deep-brown">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="mt-6 font-serif text-2xl">Statistiques de scan en direct</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Mesurez l'impact réel de votre campagne : nombre de consultations uniques, localisation géographique, taux d'engagement et pics de lecture.
            </p>
          </div>
        </div>
      </section>

      {/* Case studies / Formats */}
      <section className="container-x mt-28 rounded-3xl bg-cream/50 p-8 sm:p-14 border border-border">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <p className="eyebrow">Cas d'usage</p>
            <h2 className="mt-2 font-serif text-3xl sm:text-5xl">
              Pour vos moments d'entreprise les plus précieux
            </h2>
            <div className="mt-6 space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Vœux de fin d'année :</strong> Le mot vidéo de la direction ou de l'équipe incarné dans une carte luxueuse.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Inaugurations & Salons :</strong> Un souvenir connecté remis aux participants pour revivre la journée.</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-deep-brown shrink-0 mt-0.5" />
                <span><strong>Cadeaux VIP & Relations clients :</strong> Remerciez vos partenaires avec un objet d'art qui ne finit pas à la poubelle.</span>
              </div>
            </div>

            <div className="mt-8 flex gap-6 text-xs text-charcoal font-medium">
              <span className="flex items-center gap-1.5"><Package className="h-4 w-4 text-deep-brown" /> À partir de 50 ex.</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-deep-brown" /> Hébergement sécurisé & confidentiel</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border shadow-xl">
            <img src={scan} alt="Mémora carte professionnelle" className="w-full h-80 object-cover" />
          </div>
        </div>
      </section>

      {/* Quote & Sample Request Form */}
      <section id="devis" className="container-x mt-28 max-w-3xl">
        <div className="rounded-2xl border border-border bg-background p-8 sm:p-12 shadow-sm">
          <p className="eyebrow text-center">Devis & Échantillon</p>
          <h2 className="mt-2 text-center font-serif text-3xl sm:text-4xl">
            Recevez un échantillon personnalisé gratuit
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Testez la magie Mémora sur vos propres smartphones. Réponse sous 24h ouvrées.
          </p>

          {sent ? (
            <div className="mt-10 rounded-xl bg-sand/20 p-8 text-center animate-in fade-in">
              <CheckCircle2 className="mx-auto h-12 w-12 text-deep-brown" />
              <h3 className="mt-4 font-serif text-2xl">Demande bien reçue !</h3>
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
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Prénom & Nom *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Jean Dupont"
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-3 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Entreprise / Organisation *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Acme Corp"
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-3 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email professionnel *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="jean@acme.com"
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-3 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="+33 6 12 34 56 78"
                    className="mt-1.5 w-full rounded-md border border-border bg-transparent px-4 py-3 text-sm outline-hidden focus:border-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quantité estimée
                  </label>
                  <select className="mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-hidden focus:border-foreground">
                    <option value="sample">Je souhaite un échantillon d'abord</option>
                    <option value="50-100">50 à 100 exemplaires</option>
                    <option value="100-500">100 à 500 exemplaires</option>
                    <option value="500-1000">500 à 1 000 exemplaires</option>
                    <option value="1000+">Plus de 1 000 exemplaires</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Format souhaité
                  </label>
                  <select className="mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-hidden focus:border-foreground">
                    <option value="carte">Carte Photo 10×15 cm (Classique)</option>
                    <option value="magnet">Magnet 10×15 cm</option>
                    <option value="cadre">Format Encadré 20×30 cm</option>
                    <option value="sur-mesure">Format spécial / carte de visite</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Détails de votre projet / Événement
                </label>
                <textarea
                  rows={4}
                  placeholder="Décrivez votre besoin : date de l'événement, besoins d'intégration, adresse pour l'envoi de l'échantillon..."
                  className="mt-1.5 w-full rounded-md border border-border bg-transparent p-4 text-sm outline-hidden focus:border-foreground"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-primary py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
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
