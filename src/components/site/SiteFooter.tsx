import { Link } from "@tanstack/react-router";
import { ShieldCheck, Truck, Smartphone, Heart } from "lucide-react";

export function SiteFooter() {
  const cols = [
    {
      title: "Commander",
      links: [
        { href: "/shop", label: "La Boutique complète" },
        { href: "/commander", label: "Créer un tirage photo NFC" },
        { href: "/product/memora-magnet", label: "Mémora Magnet" },
        { href: "/editeasy", label: "Montage automatique gratuit" },
        { href: "/cart", label: "Mon Panier" },
      ],
    },
    {
      title: "Entreprises & Démo",
      links: [
        { href: "/espace-entreprise", label: "Espace Entreprises (B2B)" },
        { href: "/m/demo-leila-and-sami", label: "Voir la démo NFC" },
        { href: "/gift-finder", label: "Trouver un cadeau" },
        { href: "/digital-memories", label: "L'Expérience NFC" },
      ],
    },
    {
      title: "MÉMORA",
      links: [
        { href: "/how-it-works", label: "Comment ça marche" },
        { href: "/our-story", label: "Notre histoire" },
        { href: "/faq", label: "Foire aux questions" },
        { href: "/contact", label: "Nous contacter" },
      ],
    },
    {
      title: "Informations Légales",
      links: [
        { href: "/privacy-policy", label: "Politique de confidentialité" },
        { href: "/terms", label: "Conditions Générales (CGV)" },
        { href: "/shipping-policy", label: "Livraison & Expédition" },
        { href: "/refund-policy", label: "Garantie & Retours" },
      ],
    },
  ];

  return (
    <footer className="bg-charcoal text-ivory">
      {/* Reassurance Bar */}
      <div className="border-b border-ivory/10 py-10">
        <div className="container-x grid gap-8 sm:grid-cols-3 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3.5">
            <Smartphone className="h-6 w-6 text-sand shrink-0" />
            <div>
              <p className="text-sm font-semibold">100% Sans Application</p>
              <p className="text-xs text-taupe">Compatible nativement avec iPhone et Android</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-3.5">
            <Truck className="h-6 w-6 text-sand shrink-0" />
            <div>
              <p className="text-sm font-semibold">Livraison Offerte dès 250 DT</p>
              <p className="text-xs text-taupe">Expédié sous 5 à 7 jours avec numéro de suivi</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-3.5">
            <ShieldCheck className="h-6 w-6 text-sand shrink-0" />
            <div>
              <p className="text-sm font-semibold">Hébergement Sécurisé</p>
              <p className="text-xs text-taupe">Vos vidéos protégées et accessibles à vie sans abonnement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Links */}
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <p className="font-serif text-3xl tracking-[0.25em]">MÉMORA</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-sand font-medium">Make Memories Last</p>
          <p className="mt-3 max-w-xs font-serif text-lg italic text-ivory/90 leading-relaxed">
            Les instants passent. Les souvenirs restent.
          </p>
          <p className="mt-4 text-xs text-taupe leading-relaxed max-w-xs">
            Vos photos méritent mieux qu'un écran. Des souvenirs physiques à toucher et conserver pour toujours.
          </p>
        </div>

        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-sand">{c.title}</p>
            <ul className="mt-5 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.href} className="text-xs text-ivory/75 hover:text-ivory transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Legal */}
      <div className="container-x flex flex-col justify-between items-center gap-3 border-t border-ivory/10 py-6 text-xs text-taupe md:flex-row">
        <span>© {new Date().getFullYear()} MÉMORA. Tous droits réservés.</span>
        <span>Paiement sécurisé · Prix TTC en Dinars tunisiens (DT)</span>
      </div>
    </footer>
  );
}
