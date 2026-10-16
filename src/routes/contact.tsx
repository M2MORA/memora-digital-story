import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contactez-nous — MÉMORA" },
      {
        name: "description",
        content: "Contactez l'équipe MÉMORA par email ou via nos réseaux. Nous répondons sous 24h.",
      },
      { property: "og:title", content: "Contactez MÉMORA" },
      { property: "og:description", content: "Nous serions ravis de découvrir votre histoire." },
    ],
  }),
  component: Contact,
});

const CONTACT = {
  email: "bonjour@memora.tn",
  instagram: "https://instagram.com/memora.tn",
  whatsapp: "https://wa.me/21698000000",
};

function Contact() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Chaque photo raconte une histoire. Racontez-nous la vôtre."
        intro="Une question sur nos tirages, une demande personnalisée ou un moment précieux à célébrer ? Notre équipe basée en Tunisie vous répond avec cœur."
      />
      <section className="container-x grid gap-16 pb-32 md:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6 text-sm">
          <div>
            <p className="eyebrow text-deep-brown font-semibold">Par email</p>
            <a href={`mailto:${CONTACT.email}`} className="font-serif text-2xl hover:underline text-charcoal">
              {CONTACT.email}
            </a>
          </div>
          <div className="pt-4">
            <p className="eyebrow text-deep-brown font-semibold">Support direct</p>
            <p className="text-muted-foreground">Du lundi au vendredi, de 9h à 18h.</p>
            <p className="text-muted-foreground mt-1">Réponse moyenne en moins de 4 heures.</p>
          </div>
          <div className="pt-4 flex gap-6 text-xs uppercase tracking-wider font-semibold">
            <a href={CONTACT.instagram} target="_blank" rel="noreferrer" className="text-charcoal hover:text-deep-brown underline">
              Instagram
            </a>
            <a href={CONTACT.whatsapp} target="_blank" rel="noreferrer" className="text-charcoal hover:text-deep-brown underline">
              WhatsApp
            </a>
          </div>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-cream/40 p-8 text-center animate-in fade-in">
            <p className="font-serif text-3xl italic text-charcoal">Merci pour votre message.</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Notre équipe vous répondra très rapidement par email.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
              toast.success("Message envoyé avec succès !");
            }}
            className="space-y-6"
          >
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1">
                Nom & Prénom
              </label>
              <input
                required
                type="text"
                placeholder="Votre nom"
                maxLength={120}
                className="w-full border-b border-border bg-transparent py-3 text-sm outline-hidden focus:border-foreground"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1">
                Adresse email
              </label>
              <input
                required
                type="email"
                placeholder="votre.email@exemple.com"
                maxLength={120}
                className="w-full border-b border-border bg-transparent py-3 text-sm outline-hidden focus:border-foreground"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium block mb-1">
                Votre message
              </label>
              <textarea
                required
                placeholder="Dites-nous tout..."
                rows={5}
                maxLength={2000}
                className="w-full border-b border-border bg-transparent py-3 text-sm outline-hidden focus:border-foreground"
              />
            </div>
            <button
              type="submit"
              className="rounded-sm bg-primary px-10 py-4 text-xs uppercase tracking-[0.2em] font-medium text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
            >
              Envoyer mon message
            </button>
          </form>
        )}
      </section>
    </>
  );
}
