import { createFileRoute, Link } from "@tanstack/react-router";
import lifestyle from "@/assets/lifestyle-emotion-v2.jpg";
import envelope from "@/assets/product-envelope-v2.jpg";
import { PageHero, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";

export const Route = createFileRoute("/our-story")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [{ title: `${t.nav.story} — MÉMORA` }, { name: "description", content: t.story.title }],
    };
  },
  component: Story,
});

function Story() {
  const t = useT();
  const s = t.story;
  return (
    <>
      <PageHero title={s.title} intro={s.lead} />
      <div className="container-x">
        <img
          src={lifestyle}
          alt={s.imageAlt}
          width={1122}
          height={1402}
          loading="lazy"
          decoding="async"
          className="h-[55vh] min-h-[320px] w-full rounded-[4px] object-cover object-[50%_35%]"
        />
      </div>

      <article className="container-x max-w-3xl space-y-12 py-16 md:py-24">
        {s.chapters.map(([title, text]) => (
          <section key={title}>
            <h2 className="font-serif text-[30px] leading-tight text-m-ink sm:text-[36px]">
              {title}
            </h2>
            <p className="mt-3 text-[18px] leading-[1.7] text-m-muted">{text}</p>
          </section>
        ))}
      </article>

      <section className="grid border-t border-m-line md:grid-cols-2">
        <div className="flex flex-col justify-center bg-m-blush px-6 py-14 md:px-16">
          <p className="font-serif text-[32px] italic leading-snug text-m-ink sm:text-[40px]">
            {s.quote}
          </p>
          <Link to="/commander" className={buttonStyles({ className: "mt-8 self-start" })}>
            {t.common.create}
          </Link>
        </div>
        <img
          src={envelope}
          alt={s.envelopeAlt}
          width={1254}
          height={1254}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover"
        />
      </section>
    </>
  );
}
