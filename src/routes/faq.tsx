import { createFileRoute, Link } from "@tanstack/react-router";
import { whatsappLink } from "@/lib/contact";
import { FaqList } from "@/components/site/FaqList";
import { PageHero, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";

export const Route = createFileRoute("/faq")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [{ title: `${t.faq.title} — MÉMORA` }, { name: "description", content: t.faq.lead }],
    };
  },
  component: Faq,
});

function Faq() {
  const t = useT();
  return (
    <>
      <PageHero title={t.faq.title} intro={t.faq.lead} />
      <div className="container-x max-w-4xl space-y-14 pb-20">
        {t.faq.groups.map((group, i) => (
          <section key={group.title} aria-labelledby={`faq-groupe-${i}`}>
            <h2
              id={`faq-groupe-${i}`}
              className="mb-4 font-sans text-[15px] font-semibold tracking-normal text-m-wine"
            >
              {group.title}
            </h2>
            <FaqList items={group.items} />
          </section>
        ))}

        <div className="rounded-[20px] bg-m-blush p-8">
          <h2 className="font-serif text-[28px] text-m-ink">{t.faq.notFoundTitle}</h2>
          <p className="mt-2 text-[17px] text-m-muted">{t.faq.notFoundLead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={whatsappLink(t.common.whatsappHello)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles()}
            >
              {t.common.whatsapp}
            </a>
            <Link to="/contact" className={buttonStyles({ variant: "secondary" })}>
              {t.faq.otherContact}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
