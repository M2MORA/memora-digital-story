import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import heroPhoto from "@/assets/hero-v2.jpg";
import family from "@/assets/scan-v2.jpg";
import generations from "@/assets/lifestyle-emotion-v2.jpg";
import friends from "@/assets/product-moments-v2.jpg";
import envelope from "@/assets/product-envelope-v2.jpg";
import { PRODUCTS } from "@/lib/products";
import { dictFromMatches, useT } from "@/i18n";
import { FlipCardDemo } from "@/components/site/FlipCardDemo";
import { PriceTiers } from "@/components/site/PriceTiers";
import { FaqList } from "@/components/site/FaqList";
import { SectionTitle, buttonStyles } from "@/components/site/kit";

const PRODUCT = PRODUCTS[0]!;
const DEMO = { memorySlug: "demo-leila-and-sami" };
const OCCASION_IMAGES = [
  { img: family, w: 1254, h: 1254 },
  { img: generations, w: 1122, h: 1402 },
  { img: friends, w: 1536, h: 1024 },
];
const HIGHLIGHTS = ["app", "phones", "pay"];

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [
        { title: t.home.metaTitle },
        {
          name: "description",
          content: `${t.home.lead} ${t.home.priceLine(t.money(PRODUCT.priceTND))}`,
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const t = useT();
  const h = t.home;
  const faqHighlights = t.faq.groups
    .flatMap((g) => g.items)
    .filter((i) => HIGHLIGHTS.includes(i.id));

  return (
    <>
      {/* Hero : la photo en plein écran, le texte posé sur la partie sombre */}
      <section className="relative -mt-16 flex min-h-svh items-end overflow-hidden bg-m-night md:items-center">
        <img
          src={heroPhoto}
          alt={h.heroAlt}
          width={1672}
          height={941}
          fetchPriority="high"
          // En arabe, la photo est retournée pour que la zone sombre soit du côté du texte
          className="absolute inset-0 h-full w-full object-cover object-[72%_center] md:object-center rtl:-scale-x-100"
        />
        {/* Bande sombre en haut : l'en-tête transparent reste lisible sur la pierre claire */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-36 bg-linear-to-b from-m-night/60 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-m-night/90 via-m-night/55 to-m-night/10 md:bg-linear-to-r md:from-m-night/85 md:via-m-night/45 md:to-transparent rtl:md:bg-linear-to-l"
        />

        <div className="container-x relative py-14 text-m-linen md:py-24">
          <div className="max-w-xl">
            <h1 className="font-serif text-[44px] leading-[1.02] sm:text-[60px] lg:text-[72px]">
              {h.title}
            </h1>
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
            <p className="mt-6 text-[15px] text-m-linen/80">
              {h.priceLine(t.money(PRODUCT.priceTND))}
            </p>
          </div>
        </div>
      </section>

      {/* Trois étapes : une vraie séquence, donc numérotée */}
      <section aria-labelledby="etapes" className="border-y border-m-line bg-m-paper">
        <div className="container-x py-16 md:py-24">
          <SectionTitle id="etapes" title={h.stepsTitle} />
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {h.steps.map(([title, text], i) => (
              <li key={title} className="border-t-2 border-m-wine pt-5">
                <p className="font-serif text-[22px] font-semibold text-m-wine">{i + 1}</p>
                <h3 className="mt-1 font-serif text-[26px] leading-tight text-m-ink">{title}</h3>
                <p className="mt-2 text-[17px] text-m-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Le verso : la réponse à « et s'il ne sait pas faire ? » */}
      <section className="container-x grid items-center gap-12 py-16 md:grid-cols-2 md:py-28">
        <div className="md:order-2">
          <SectionTitle title={h.versoTitle} intro={h.versoLead} />
          <ul className="mt-8 space-y-3 text-[17px] text-m-ink">
            {h.versoPoints.map((p) => (
              <li key={p} className="flex gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:order-1">
          <FlipCardDemo />
        </div>
      </section>

      {/* Pour qui */}
      <section id="occasions" aria-labelledby="pour-qui" className="bg-m-blush">
        <div className="container-x py-16 md:py-24">
          <SectionTitle id="pour-qui" title={h.forWhom} />
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {OCCASION_IMAGES.map((o, i) => (
              <li key={o.img}>
                <Link to="/commander" className="group block">
                  <div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-m-stage">
                    <img
                      src={o.img}
                      alt=""
                      width={o.w}
                      height={o.h}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <h3 className="mt-4 font-serif text-[26px] leading-tight text-m-ink group-hover:text-m-wine">
                    {h.occasions[i]}
                  </h3>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Le produit et ses prix */}
      <section aria-labelledby="produit" className="container-x py-16 md:py-28">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <img
            src={envelope}
            alt={h.productAlt}
            width={1254}
            height={1254}
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-[4px] object-cover shadow-paper"
          />
          <div>
            <h2
              id="produit"
              className="font-serif text-[34px] leading-tight text-m-ink sm:text-[44px]"
            >
              {h.productTitle}
            </h2>
            <p className="mt-3 font-serif text-[30px] font-semibold text-m-wine">
              {t.money(PRODUCT.priceTND)}
            </p>
            <ul className="mt-6 space-y-2.5 text-[17px] text-m-ink">
              {t.product.materials.map((m) => (
                <li key={m} className="flex gap-3">
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
                search={{ format: PRODUCT.formatCode, stage: "video" }}
                className={buttonStyles()}
              >
                {t.common.create}
              </Link>
              <Link
                to="/product/$slug"
                params={{ slug: PRODUCT.slug }}
                className={buttonStyles({ variant: "link", size: "inline" })}
              >
                {h.details}
              </Link>
            </div>
          </div>
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
          <FaqList items={faqHighlights} />
        </div>
      </section>

      {/* Entreprises */}
      <section className="bg-m-ink text-m-linen">
        <div className="container-x flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between">
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
        <h2 className="mx-auto max-w-3xl font-serif text-[36px] leading-[1.08] text-m-ink sm:text-[52px]">
          {h.finalTitle}
        </h2>
        <p className="mt-4 text-[17px] text-m-muted">{h.finalLead}</p>
        <Link to="/commander" className={buttonStyles({ className: "mt-8" })}>
          {t.common.create}
        </Link>
      </section>
    </>
  );
}
