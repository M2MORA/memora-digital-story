import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";
import { Img } from "@/components/site/Img";
import { IMAGES } from "@/lib/images.gen";

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
        <Img
          image={IMAGES.generations}
          alt={s.imageAlt}
          sizes="100vw"
          objectPosition="50% 35%"
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
        <Img
          image={IMAGES.envelope}
          alt={s.envelopeAlt}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="aspect-square w-full object-cover"
        />
      </section>
    </>
  );
}
