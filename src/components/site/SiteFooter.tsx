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
    <footer className="bg-charcoal text-ivory border-t border-deep-brown/40">
      {/* Reassurance Bar */}
      <div className="border-b border-ivory/10 py-12">
        <div className="container-x grid gap-6 sm:grid-cols-3 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-4 rounded-xl p-4 bg-ivory/[0.03] border border-ivory/8">
            <Smartphone className="h-6 w-6 text-champagne shrink-0" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold tracking-wide text-ivory">100% Sans Application</p>
              <p className="text-xs text-taupe mt-0.5">Compatible nativement avec iPhone et Android</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-4 rounded-xl p-4 bg-ivory/[0.03] border border-ivory/8">
            <Truck className="h-6 w-6 text-champagne shrink-0" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold tracking-wide text-ivory">Livraison Partout en Tunisie</p>
              <p className="text-xs text-taupe mt-0.5">Paiement à la livraison · Offerte dès 250 DT</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-4 rounded-xl p-4 bg-ivory/[0.03] border border-ivory/8">
            <ShieldCheck className="h-6 w-6 text-champagne shrink-0" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold tracking-wide text-ivory">Garantie & Hébergement à Vie</p>
              <p className="text-xs text-taupe mt-0.5">Vidéos protégées sans abonnement récurrent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Links */}
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <p className="font-serif text-3xl tracking-[0.25em] text-ivory">MÉMORA</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.24em] text-champagne font-medium">Make Memories Last</p>
          <p className="mt-3 max-w-xs font-serif text-lg italic text-ivory/90 leading-relaxed">
            Les instants passent. Les souvenirs restent.
          </p>
          <p className="mt-4 text-xs text-taupe leading-relaxed max-w-xs">
            Vos photos méritent mieux qu'un écran. Des souvenirs physiques à toucher et conserver pour toujours.
          </p>
        </div>

        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-champagne">{c.title}</p>
            <ul className="mt-3 sm:mt-5 sm:space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.href} className="text-xs text-ivory/70 hover:text-champagne transition-colors py-3 sm:py-0.5 block">
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
        <span>© {new Date().getFullYear()} MÉMORA. Fait avec passion en Tunisie 🇹🇳 · Tous droits réservés.</span>
        <span>Paiement sécurisé · Prix TTC en Dinars tunisiens (DT)</span>
      </div>
    </footer>
  );
}
