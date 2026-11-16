import { useT, type Dict } from "@/i18n";
import { usePricing } from "@/hooks/use-pricing";

/** Page légale traduite : `page` désigne la rubrique dans le dictionnaire */
export function LegalPage({ page }: { page: keyof Dict["legal"] }) {
  const { title, sections: raw } = useT().legal[page];
  const pricing = usePricing();
  // La page livraison cite le seuil de livraison offerte : ses rubriques dépendent des tarifs
  const sections = typeof raw === "function" ? raw(pricing) : raw;
  return (
    <article className="container-x max-w-3xl pb-24 pt-12 md:pt-20">
      <h1 className="font-serif text-[40px] leading-[1.05] text-m-ink sm:text-[52px]">{title}</h1>
      <div className="mt-10 divide-y divide-m-line border-y border-m-line">
        {sections.map(([h, p]) => (
          <section key={h} className="py-8">
            <h2 className="font-serif text-[26px] leading-tight text-m-ink">{h}</h2>
            <p className="mt-3 max-w-[65ch] text-[17px] leading-relaxed text-m-muted">{p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
