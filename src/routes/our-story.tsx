import { createFileRoute } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";
import box from "@/assets/product-box.jpg";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/our-story")({
  head: () => ({
    meta: [
      { title: "Notre Histoire — MÉMORA" },
      {
        name: "description",
        content:
          "L'histoire de MÉMORA : deux passionnés, une conviction simple. Faire revivre vos plus beaux souvenirs d'un simple contact.",
      },
      { property: "og:title", content: "Notre Histoire — MÉMORA" },
      { property: "og:description", content: "Né en Méditerranée. Conçu pour traverser les générations." },
    ],
  }),
  component: Story,
});

const CHAPTERS = [
  [
    "Le commencement",
    "Tout est né autour d'une table à Tunis, deux amis faisant défiler des milliers de photos et de vidéos oubliées au fond de leurs smartphones que personne n'avait regardées depuis des années.",
  ],
  [
    "Pourquoi MÉMORA existe",
    "Nos téléphones retiennent tout sans rien garder près du cœur. Nous voulions un souvenir que l'on puisse toucher, tenir entre ses mains, poser sur sa table de chevet — et réécouter d'un simple effleurement.",
  ],
  [
    "Notre philosophie",
    "Moins d'objets, mais de véritables trésors. Chaque tirage photo est pensé pour durer toute une vie, avec une puce NFC invisible et une notice élégante imprimée au verso pour que chacun sache l'utiliser.",
  ],
  [
    "Notre engagement",
    "Nous protégeons vos souvenirs avec une infrastructure sécurisée et un respect absolu de votre vie privée. Vos vidéos sont accessibles à vie sans abonnement ni publicité.",
  ],
  [
    "Artisanat & Technologie",
    "Nos créations marient le savoir-faire des maîtres imprimeurs sur papier photo d'art 300g/m² et l'innovation invisible du NFC sans application.",
  ],
  [
    "Notre ambition",
    "De la Méditerranée au monde entier : offrir à chaque famille le pouvoir de faire revivre ses plus grands moments d'émotion.",
  ],
];

function Story() {
  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Parce que certains instants sont éternels."
        intro="Vos plus belles photos méritent mieux qu'un écran. MÉMORA transforme vos moments les plus précieux en souvenirs physiques et émotionnels que l'on garde près du cœur."
      />
      <img src={hero} alt="Souvenirs MÉMORA" loading="lazy" className="h-[60vh] w-full object-cover" />
      <section className="container-x py-24">
        {CHAPTERS.map(([t, d], i) => (
          <div key={t} className="grid gap-6 border-t border-border py-12 md:grid-cols-[6rem_1fr_1.4fr]">
            <span className="font-serif text-2xl text-taupe">0{i + 1}</span>
            <h2 className="text-3xl font-serif text-charcoal">{t}</h2>
            <p className="text-base leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <section className="grid md:grid-cols-2 border-t border-border">
        <div className="flex flex-col justify-center bg-rose-poudre/25 p-12 md:p-20">
          <p className="font-serif text-3xl sm:text-4xl italic leading-snug text-charcoal">
            « Les instants passent. Les souvenirs restent. »
          </p>
          <p className="mt-3 text-sm font-serif italic text-deep-brown">
            Un instant capturé. Une émotion préservée.
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-deep-brown font-semibold">
            MÉMORA · Make Memories Last
          </p>
        </div>
        <img src={box} alt="Coffret tirage MÉMORA" loading="lazy" className="aspect-square w-full object-cover" />
      </section>
    </>
  );
}
