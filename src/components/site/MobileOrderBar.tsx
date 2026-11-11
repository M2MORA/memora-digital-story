import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/contact";
import { PRODUCTS } from "@/lib/products";
import { useT } from "@/i18n";
import { useHeroPassed } from "@/hooks/use-hero-passed";
import { cn } from "@/lib/utils";

/**
 * Barre fixée en bas sur mobile : l'action principale reste à portée de pouce.
 * Sur l'accueil, elle attend que la photo du hero soit passée pour apparaître.
 */
export function MobileOrderBar() {
  const t = useT();
  const shown = useHeroPassed({ immediateElsewhere: true });
  return (
    <div
      inert={!shown}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-m-line bg-m-linen/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm transition-transform duration-300 ease-out md:hidden",
        shown ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          to="/commander"
          className="flex min-h-14 flex-1 items-center justify-between rounded-full bg-m-wine pe-5 ps-6 text-base font-semibold text-m-linen"
        >
          <span>{t.common.create}</span>
          <span className="text-m-linen/80">{t.money(PRODUCTS[0]!.priceTND)}</span>
        </Link>
        <a
          href={whatsappLink(t.common.whatsappHello)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.mobileBarAsk}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-m-line-strong bg-m-paper text-m-ink"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Réserve la hauteur de la barre pour qu'elle ne masque pas le bas du pied de page */
export function MobileOrderBarSpacer() {
  return (
    <div aria-hidden="true" className="h-[calc(80px+env(safe-area-inset-bottom))] md:hidden" />
  );
}
