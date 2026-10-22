import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHero } from "@/components/site/ProductCard";
import { Mail, Clock, Instagram, Send, Sparkles } from "lucide-react";

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
      <section className="container-x grid gap-12 pb-32 md:grid-cols-[1fr_1.3fr] items-start">
        <div className="rounded-3xl border border-sand/25 bg-card p-8 shadow-luxury space-y-6 text-sm">
          <div>
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em] mb-1.5 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>Par email</span>
            </p>
            <a href={`mailto:${CONTACT.email}`} className="font-serif text-2xl hover:text-deep-brown transition-colors text-charcoal">
              {CONTACT.email}
            </a>
          </div>
          <div className="pt-4 border-t border-sand/15">
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em] mb-1.5 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Support direct</span>
            </p>
            <p className="text-muted-foreground">Du lundi au vendredi, de 9h à 18h.</p>
            <p className="text-muted-foreground mt-1">Réponse moyenne en moins de 4 heures.</p>
          </div>
          <div className="pt-4 border-t border-sand/15 flex gap-4 text-xs uppercase tracking-wider font-semibold">
            <a
              href={CONTACT.instagram}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-sand/30 bg-sand/10 px-4 py-2 text-charcoal hover:bg-sand/30 transition-all"
            >
              <span>Instagram</span>
            </a>
            <a
              href={CONTACT.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-sand/30 bg-sand/10 px-4 py-2 text-charcoal hover:bg-sand/30 transition-all"
            >
              <span>WhatsApp</span>
            </a>
          </div>
        </div>

        {sent ? (
          <div className="rounded-3xl border border-sand/30 bg-cream/70 p-8 sm:p-12 text-center shadow-luxury animate-in fade-in">
            <div className="mx-auto w-14 h-14 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center mb-4 text-deep-brown">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="font-serif text-3xl italic text-charcoal">Merci pour votre message.</p>
            <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
              Notre équipe vous répondra très rapidement par email avec attention.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
              toast.success("Message envoyé avec succès !");
            }}
            className="rounded-3xl border border-sand/25 bg-card p-8 sm:p-10 shadow-luxury space-y-5"
          >
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-2">
                Nom &amp; Prénom
              </label>
              <input
                required
                type="text"
                placeholder="Votre nom"
                maxLength={120}
                className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-2">
                Adresse email
              </label>
              <input
                required
                type="email"
                placeholder="votre.email@exemple.com"
                maxLength={120}
                className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-2">
                Votre message
              </label>
              <textarea
                required
                placeholder="Dites-nous tout..."
                rows={5}
                maxLength={2000}
                className="w-full rounded-xl border border-sand/30 bg-background/60 px-4 py-3 text-sm outline-hidden focus:border-deep-brown focus:ring-1 focus:ring-deep-brown transition-all text-charcoal resize-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-10 py-4 text-xs uppercase tracking-[0.2em] font-semibold text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg cursor-pointer"
            >
              <span>Envoyer mon message</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
      </section>
    </>
  );
}
