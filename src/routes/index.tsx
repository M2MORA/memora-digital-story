import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { dictFromMatches, useT } from "@/i18n";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { HeroReveal } from "@/components/site/HeroReveal";
import { OccasionShowcase } from "@/components/site/OccasionShowcase";
import { PriceTiers } from "@/components/site/PriceTiers";
import { FaqList } from "@/components/site/FaqList";
import { SectionTitle, buttonStyles } from "@/components/site/kit";
import { Img } from "@/components/site/Img";
import { reveal, stagger } from "@/components/site/reveal";
import { IMAGES } from "@/lib/images.gen";
import { getUnitPrice } from "@/lib/pricing";
import { pricingFromMatches, usePricing } from "@/hooks/use-pricing";
import { productsFromMatches, useProducts } from "@/hooks/use-products";

const DEMO = { memorySlug: "demo-leila-and-sami" };
const OCCASION_IMAGES = [
  { image: IMAGES.tap },
  { image: IMAGES.generations, pos: "50% 28%" },
  { image: IMAGES.moments },
];
const HIGHLIGHTS = ["app", "phones", "pay"];

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    const pricing = pricingFromMatches(matches);
    const format = productsFromMatches(matches)[0]?.format;
    return {
      meta: [
        { title: t.home.metaTitle },
        {
          name: "description",
          content:
            pricing && format
              ? `${t.home.lead} ${t.home.priceLine(t.money(getUnitPrice(pricing, format, 1)))}`
              : t.home.lead,
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const t = useT();
  const h = t.home;
  const pricing = usePricing();
  const product = useProducts()[0];
  const price = product ? getUnitPrice(pricing, product.formatCode, 1) : 0;
  const faqHighlights = t.faq
    .groups(pricing)
    .flatMap((g) => g.items)
    .filter((i) => HIGHLIGHTS.includes(i.id));

  return (
    <>
      {/* Hero : d'abord la photo seule ; le texte apparaît en faisant défiler */}
      <HeroReveal alt={h.heroAlt} scrollHint={h.scrollHint}>
        <div className="max-w-xl">
          <h1 className="font-serif text-[44px] leading-[1.02] sm:text-[60px] lg:text-[72px]">
            {h.title}
          </h1>
          <p className="mt-4 font-serif text-[22px] italic leading-snug text-m-linen/90 sm:text-[26px]">
            {h.tagline}
          </p>
          <p className="mt-5 max-w-[30rem] text-[17px] leading-relaxed text-m-linen/85 sm:text-lg">
            {h.lead}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to="/commander" className={buttonStyles({ variant: "inverse" })}>
              {t.common.create}
            </Link>
            <Link
              to="/m/$memorySlug"
              params={DEMO}
              className={buttonStyles({
                variant: "link",
                size: "inline",
                className: "text-m-linen decoration-m-linen/50 hover:decoration-m-linen",
              })}
            >
              {t.common.demo}
            </Link>
          </div>
          {product && (
            <p className="mt-6 text-[15px] text-m-linen/80">{h.priceLine(t.money(price))}</p>
          )}
        </div>
      </HeroReveal>

      {/* Trois étapes : une vraie séquence, donc numérotée */}
      <section aria-labelledby="etapes" className="border-y border-m-line bg-m-paper">
        <div className="container-x py-16 md:py-24">
          <SectionTitle id="etapes" title={h.stepsTitle} />
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {h.steps.map(([title, text], i) => (
              <li
                key={title}
                {...reveal("rise", stagger(i, 120))}
                className="border-t-2 border-m-wine pt-5"
              >
                <p className="font-serif text-[44px] italic leading-none text-m-rose">{i + 1}</p>
                <h3 className="mt-1 font-serif text-[26px] leading-tight text-m-ink">{title}</h3>
                <p className="mt-2 text-[17px] text-m-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Le produit et ses prix */}
      {product && (
        <section aria-labelledby="produit" className="container-x py-16 md:py-28">
          <div className="grid gap-10 md:grid-cols-2 md:gap-16">
            <div {...reveal("print", 0, -8)} className="self-start">
              <div className="print-frame rotate-[-1.5deg] transition-[rotate] duration-500 ease-out hover:rotate-0">
                <div className="aspect-square overflow-hidden rounded-[2px]">
                  <Img
                    image={IMAGES.envelope}
                    alt={h.productAlt}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="drift -mt-[7%] h-[114%] w-full object-cover"
                  />
                </div>
              </div>
            </div>
            <div>
              <h2
                id="produit"
                {...reveal("line")}
                className="font-serif text-[34px] leading-tight text-m-ink sm:text-[44px]"
              >
                {h.productTitle}
              </h2>
              <p
                {...reveal("rise", 100)}
                className="mt-3 font-serif text-[30px] font-semibold text-m-wine"
              >
                {t.money(price)}
              </p>
              <ul className="mt-6 space-y-2.5 text-[17px] text-m-ink">
                {product.materials.map((m, i) => (
                  <li key={m} {...reveal("rise", stagger(i, 70))} className="flex gap-3">
                    <Check className="mt-1 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <p className="text-[15px] font-semibold text-m-ink">{t.tiers.title}</p>
                <div className="mt-2">
                  <PriceTiers />
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  to="/commander"
                  search={{ format: product.formatCode, stage: "video" }}
                  className={buttonStyles()}
                >
                  {t.common.create}
                </Link>
                <Link
                  to="/product/$slug"
                  params={{ slug: product.slug }}
                  className={buttonStyles({ variant: "link", size: "inline" })}
                >
                  {h.details}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Le verso : la réponse à « et s'il ne sait pas faire ? » */}
      <section className="border-y border-m-line bg-m-paper">
        <div className="container-x grid items-center gap-12 py-16 md:grid-cols-2 md:py-28">
          <div className="md:order-2">
            <SectionTitle title={h.versoTitle} intro={h.versoLead} />
            <ul className="mt-8 space-y-3 text-[17px] text-m-ink">
              {h.versoPoints.map((p, i) => (
                <li key={p} {...reveal("rise", stagger(i))} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="toss-in md:order-1">
            <FlipCardDemo />
          </div>
        </div>
      </section>

      {/* Pour qui : une photo qui change toute seule */}
      <section id="occasions" aria-labelledby="pour-qui" className="bg-m-blush">
        <div className="container-x py-16 md:py-24">
          <OccasionShowcase
            title={h.forWhom}
            titleId="pour-qui"
            cta={h.forWhomCta}
            items={OCCASION_IMAGES.map((o, i) => ({ ...o, label: h.occasions[i] ?? "" }))}
          />
        </div>
      </section>

      {/* Questions courantes */}
      <section aria-labelledby="questions" className="border-t border-m-line bg-m-paper">
        <div className="container-x grid gap-10 py-16 md:grid-cols-[1fr_1.6fr] md:py-24">
          <div>
            <SectionTitle id="questions" title={h.questions} />
            <Link
              to="/faq"
              className={buttonStyles({ variant: "link", size: "inline", className: "mt-4" })}
            >
              {h.allQuestions}
            </Link>
          </div>
          <div {...reveal("rise", 120)}>
            <FaqList items={faqHighlights} />
          </div>
        </div>
      </section>

      {/* Entreprises */}
      <section className="bg-m-ink text-m-linen">
        <div
          {...reveal("rise")}
          className="container-x flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 className="font-serif text-[30px] leading-tight sm:text-[36px]">
              {h.businessTitle}
            </h2>
            <p className="mt-2 text-[17px] text-m-linen/80">{h.businessLead}</p>
          </div>
          <Link
            to="/espace-entreprise"
            className={buttonStyles({ variant: "inverse", className: "shrink-0" })}
          >
            {h.businessCta}
          </Link>
        </div>
      </section>

      {/* Dernier appel */}
      <section className="container-x py-20 text-center md:py-28">
        <h2
          {...reveal("line")}
          className="mx-auto max-w-3xl font-serif text-[36px] leading-[1.08] text-m-ink sm:text-[52px]"
        >
          {h.finalTitle}
        </h2>
        <div {...reveal("rise", 180)}>
          <p className="mt-4 text-[17px] text-m-muted">{h.finalLead(pricing)}</p>
          <Link to="/commander" className={buttonStyles({ className: "mt-8" })}>
            {t.common.create}
          </Link>
        </div>
      </section>
    </>
  );
}
