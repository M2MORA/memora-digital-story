import { createFileRoute } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";
import box from "@/assets/product-box.jpg";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/our-story")({
  head: () => ({
    meta: [
      { title: "Our story — MÉMORA" },
      { name: "description", content: "Two friends from Tunisia, one belief: the most meaningful moments deserve to live beyond time." },
      { property: "og:title", content: "Our story — MÉMORA" },
      { property: "og:description", content: "Born in Tunisia. Made for the world." },
    ],
  }),
  component: Story,
});

const CHAPTERS = [
  ["The beginning", "It started at a kitchen table in Tunis, two friends scrolling through thousands of photos neither of them had looked at in years."],
  ["Why MÉMORA exists", "Our phones hold everything and keep nothing close. We wanted memories you could hold — and hear, and open, again and again."],
  ["Our philosophy", "Fewer, better things. Every object is designed to be kept for a lifetime and every digital page to be private by default."],
  ["Our commitment", "We preserve your memories carefully, with secure storage and privacy you control. They belong to you, always."],
  ["Made in Tunisia", "Our pieces are crafted with Tunisian artisans — woodworkers, printers and leather makers whose care you can feel."],
  ["Our ambition", "From the Mediterranean to the world: a Tunisian brand that helps every family keep its story alive."],
];

function Story() {
  return (
    <>
      <PageHero eyebrow="Our story" title="We started with a simple belief: the most meaningful moments deserve to live beyond time." />
      <img src={hero} alt="Memories on linen" loading="lazy" className="h-[70vh] w-full object-cover" />
      <section className="container-x py-28">
        {CHAPTERS.map(([t, d], i) => (
          <div key={t} className="grid gap-6 border-t border-border py-14 md:grid-cols-[6rem_1fr_1.4fr]">
            <span className="font-serif text-2xl text-taupe">0{i + 1}</span>
            <h2 className="text-4xl">{t}</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <section className="grid md:grid-cols-2">
        <div className="flex items-center bg-cream p-12 md:p-20">
          <p className="font-serif text-4xl italic leading-snug">Born in Tunisia. Made for the world.</p>
        </div>
        <img src={box} alt="MÉMORA Box" loading="lazy" className="aspect-square w-full object-cover" />
      </section>
    </>
  );
}
