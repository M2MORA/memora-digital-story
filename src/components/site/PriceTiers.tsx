import { Link } from "@tanstack/react-router";
import { getTierDiscountPercent, getTiers } from "@/lib/pricing";
import { usePricing } from "@/hooks/use-pricing";
import { useT } from "@/i18n";

/** Prix à l'unité selon la quantité, lus dans la grille tarifaire (base de données) */
export function PriceTiers() {
  const t = useT();
  const tiers = getTiers(usePricing(), "10x15");
  return (
    <table className="w-full text-start text-[15px]">
      <caption className="sr-only">{t.tiers.caption}</caption>
      <thead>
        <tr className="border-b border-m-line-strong text-sm text-m-muted">
          <th scope="col" className="py-2.5 text-start font-semibold">
            {t.tiers.qty}
          </th>
          <th scope="col" className="py-2.5 text-start font-semibold">
            {t.tiers.unit}
          </th>
          <th scope="col" className="py-2.5 text-end font-semibold">
            {t.tiers.discount}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-m-line">
        {tiers.map((tier, i) => {
          const next = tiers[i + 1];
          const discount = getTierDiscountPercent(tiers, tier);
          return (
            <tr key={tier.min_qty}>
              <th scope="row" className="py-2.5 text-start font-medium text-m-ink">
                {t.tiers.range(tier.min_qty, next ? next.min_qty - 1 : undefined)}
              </th>
              <td className="py-2.5 text-m-ink">{t.money(tier.unit_price)}</td>
              <td className="py-2.5 text-end text-m-muted" dir="ltr">
                {discount > 0 ? `−${discount} %` : "—"}
              </td>
            </tr>
          );
        })}
        <tr>
          <th scope="row" className="py-2.5 text-start font-medium text-m-ink">
            {t.tiers.over}
          </th>
          <td colSpan={2} className="py-2.5 text-end">
            <Link
              to="/espace-entreprise"
              className="font-semibold text-m-wine underline decoration-m-rose underline-offset-4"
            >
              {t.tiers.quote}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
