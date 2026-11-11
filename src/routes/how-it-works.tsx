import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { PageHero, SectionTitle, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";
import { Img } from "@/components/site/Img";
import { IMAGES } from "@/lib/images.gen";

export const Route = createFileRoute("/how-it-works")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [{ title: `${t.how.title} — MÉMORA` }, { name: "description", content: t.how.lead }],
    };
  },
  component: How,
});

function How() {
  const t = useT();
  const h = t.how;
  return (
    <>
      <PageHero title={h.title} intro={h.lead}>
        <Link to="/commander" className={buttonStyles({ className: "mt-8" })}>
          {t.common.create}
        </Link>
      </PageHero>

      <section aria-labelledby="commander" className="border-y border-m-line bg-m-paper">
        <div className="container-x py-16 md:py-24">
          <SectionTitle id="commander" title={h.orderTitle} />
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {h.orderSteps.map(([title, text], i) => (
              <li key={title} className="border-t-2 border-m-wine pt-5">
                <p className="font-serif text-[22px] font-semibold text-m-wine">{i + 1}</p>
                <h3 className="mt-1 font-serif text-[26px] leading-tight text-m-ink">{title}</h3>
                <p className="mt-2 text-[17px] text-m-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="recevoir"
        className="container-x grid items-center gap-12 py-16 md:grid-cols-2 md:py-24"
      >
        <div>
          <SectionTitle id="recevoir" title={h.receiveTitle} intro={h.receiveLead} />
          <ol className="mt-8 space-y-6">
            {h.receiveSteps.map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-m-wine text-[15px] font-bold text-m-linen">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans text-[17px] font-semibold tracking-normal text-m-ink">
                    {title}
                  </h3>
                  <p className="mt-0.5 text-[17px] text-m-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <FlipCardDemo />
      </section>

      <section aria-labelledby="compatibilite" className="bg-m-blush">
        <div className="container-x grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <Img
            image={IMAGES.tap}
            alt={h.phonesAlt}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="aspect-square w-full rounded-[4px] object-cover"
          />
          <div>
            <SectionTitle id="compatibilite" title={h.phonesTitle} />
            <ul className="mt-6 space-y-3 text-[17px] text-m-ink">
              {h.phones.map((p) => (
                <li key={p} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/m/$memorySlug"
                params={{ memorySlug: "demo-leila-and-sami" }}
                className={buttonStyles()}
              >
                {h.seePage}
              </Link>
              <Link to="/faq" className={buttonStyles({ variant: "link", size: "inline" })}>
                {h.otherQuestions}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
