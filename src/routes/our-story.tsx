import { createFileRoute } from "@tanstack/react-router";
import product from "@/assets/product-envelope-v2.jpg";
import lifestyle from "@/assets/lifestyle-emotion-v2.jpg";
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
      <div className="container-x pb-8">
        <div className="overflow-hidden rounded-3xl border border-sand/20 shadow-luxury-lg">
          <img src={lifestyle} alt="Deux générations partagent un souvenir photo" loading="lazy" className="h-[50vh] sm:h-[60vh] w-full object-cover" />
        </div>
      </div>
      <section className="container-x py-20 sm:py-24">
        {CHAPTERS.map(([t, d], i) => (
          <div key={t} className="grid gap-6 border-t border-sand/20 py-12 md:grid-cols-[6rem_1fr_1.4fr] items-baseline">
            <span className="font-serif text-3xl text-sand font-bold">0{i + 1}</span>
            <h2 className="text-2xl sm:text-3xl font-serif text-charcoal">{t}</h2>
            <p className="text-base leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <section className="grid md:grid-cols-2 border-t border-sand/20">
        <div className="flex flex-col justify-center bg-cream/70 p-12 md:p-20">
          <p className="font-serif text-3xl sm:text-4xl italic leading-snug text-charcoal">
            « Les instants passent. Les souvenirs restent. »
          </p>
          <p className="mt-3 text-sm font-serif italic text-deep-brown">
            Un instant capturé. Une émotion préservée.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-deep-brown font-semibold">
            MÉMORA · Make Memories Last
          </p>
        </div>
        <img src={product} alt="Tirage MÉMORA dans son enveloppe d'art" loading="lazy" className="aspect-square w-full object-cover" />
      </section>
    </>
  );
}
