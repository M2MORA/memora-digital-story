import { X, Check, Sparkles, ShieldCheck, Truck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TIERS_10X15, TIERS_BOX, FREE_SHIPPING_THRESHOLD_TND, formatTND } from "@/lib/pricing";

export function PriceDrawer({
  isOpen,
  onClose,
  initialFormat = "10x15",
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFormat?: "10x15" | "box" | "magnet" | string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-charcoal/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div
        className="relative flex h-full w-full max-w-lg flex-col bg-background p-6 shadow-2xl sm:p-8 overflow-y-auto animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sand/20 pb-5">
          <div>
            <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">Tarifs &amp; Remises Dégressives</p>
            <h2 className="font-serif text-3xl text-charcoal mt-1">Grille tarifaire MÉMORA</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full p-2 text-muted-foreground hover:bg-sand/20 hover:text-charcoal transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Reassurance Banner */}
        <div className="my-6 rounded-2xl border border-sand/30 bg-sand/15 p-4 text-sm text-charcoal shadow-2xs">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-deep-brown" />
            Remises de volume automatiques
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Plus vous commandez d'exemplaires (même souvenir ou souvenirs différents), plus le prix unitaire diminue !
          </p>
        </div>

        {/* Comparison Table */}
        <div className="overflow-hidden rounded-2xl border border-sand/25 shadow-2xs">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream/80 border-b border-sand/20 font-serif text-base text-charcoal">
              <tr>
                <th className="p-3.5">Quantité</th>
                <th className="p-3.5">Simple (Enveloppe)</th>
                <th className="p-3.5">Coffret (Box &amp; Lettre)</th>
                <th className="p-3.5 text-right">Remise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/15">
              {TIERS_10X15.map((tier, idx) => {
                const boxPrice = TIERS_BOX[idx]?.unitPriceTND ?? 49;
                const label =
                  tier.minQty === 1
                    ? "1 à 4"
                    : tier.minQty === 5
                    ? "5 à 9"
                    : tier.minQty === 10
                    ? "10 à 49"
                    : tier.minQty === 50
                    ? "50 à 99"
                    : "100+";

                return (
                  <tr key={tier.minQty} className="hover:bg-cream/40 transition-colors">
                    <td className="p-3.5 font-medium">{label}</td>
                    <td className="p-3.5">
                      <span className="font-semibold text-charcoal">{formatTND(tier.unitPriceTND)}</span>
                      <span className="text-xs text-muted-foreground"> /u</span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-semibold text-charcoal">{formatTND(boxPrice)}</span>
                      <span className="text-xs text-muted-foreground"> /u</span>
                    </td>
                    <td className="p-3.5 text-right font-medium text-deep-brown">
                      {tier.discountPercent > 0 ? `-${tier.discountPercent}%` : "Prix base"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-sand/10">
                <td className="p-3.5 font-medium">&gt; 500 ex.</td>
                <td colSpan={3} className="p-3.5 text-right">
                  <Link to="/espace-entreprise" onClick={onClose} className="font-medium underline hover:text-deep-brown">
                    Sur devis personnalisé
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* What is included */}
        <div className="mt-8 space-y-3.5 border-t border-sand/20 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tout est inclus</p>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Tirage photo haute définition sur papier professionnel d'art</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Puce NFC invisible encodée et protégée intégrée au tirage</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Carte avec message personnalisé incluse dans chaque commande</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Véritable lettre d'émotion sur papier d'art (incluse dans la formule Coffret)</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>8 minutes de vidéo incluses (+1,50 DT / min supplémentaire, max 30 min)</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Check className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Notice explicative claire et élégante imprimée au verso pour le destinataire</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <Truck className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Livraison gratuite partout en Tunisie dès {formatTND(FREE_SHIPPING_THRESHOLD_TND)} d'achat</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-charcoal">
            <ShieldCheck className="h-4 w-4 shrink-0 text-deep-brown mt-0.5" />
            <span>Hébergement sécurisé de vos vidéos, sans abonnement</span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 border-t border-sand/20 pt-6">
          <Link
            to="/commander"
            search={{ format: initialFormat === "box" ? "box" : "10x15", stage: "video" }}
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full bg-primary py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold cursor-pointer"
          >
            Commencer ma création
          </Link>
        </div>
      </div>
    </div>
  );
}
