import { Link } from "@tanstack/react-router";
import { TIERS_10X15 } from "@/lib/pricing";
import { useT } from "@/i18n";

/** Prix à l'unité selon la quantité, lus directement dans le moteur de prix */
export function PriceTiers() {
  const t = useT();
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
        {TIERS_10X15.map((tier, i) => {
          const next = TIERS_10X15[i + 1];
          return (
            <tr key={tier.minQty}>
              <th scope="row" className="py-2.5 text-start font-medium text-m-ink">
                {t.tiers.range(tier.minQty, next ? next.minQty - 1 : undefined)}
              </th>
              <td className="py-2.5 text-m-ink">{t.money(tier.unitPriceTND)}</td>
              <td className="py-2.5 text-end text-m-muted" dir="ltr">
                {tier.discountPercent > 0 ? `−${tier.discountPercent} %` : "—"}
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
