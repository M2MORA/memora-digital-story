import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";
import scan from "@/assets/scan.jpg";
import box from "@/assets/product-box.jpg";
import { PRODUCTS } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MÉMORA — More than a memory. A story that lives forever." },
      { name: "description", content: "Turn your most precious memories into timeless objects connected to private digital memory pages. Born in Tunisia." },
      { property: "og:title", content: "MÉMORA — More than a memory" },
      { property: "og:description", content: "Timeless keepsakes connected to private digital memories, by NFC and QR." },
    ],
  }),
  component: Home,
});

const STEPS = [
  ["Choose your memory", "Select the photographs, voices and words that matter."],
  ["Personalize your creation", "Shape your object in our studio: title, date, letter, finish."],
  ["Connect your object", "Each piece carries a private NFC tag or engraved QR code."],
  ["Relive your story", "One tap opens your digital memory, wherever you are."],
];
const OCCASIONS = ["Love & Anniversaries", "Birthdays", "Weddings", "Family", "Travel", "Special Moments"];

function Home() {
  return (
    <>
      <section className="relative flex min-h-screen items-end overflow-hidden">
        <img src={hero} alt="MÉMORA keepsake box, printed photographs and a handwritten letter" width={1920} height={1088} className="absolute inset-0 h-full w-full animate-slow-zoom object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-charcoal/85 via-charcoal/30 to-transparent" />
        <div className="container-x relative pb-20 text-ivory md:pb-28">
          <p className="eyebrow animate-rise text-sand">MÉMORA · Born in Tunisia</p>
          <h1 className="mt-6 max-w-4xl animate-rise text-5xl leading-[1.02] md:text-8xl">
            Some moments deserve more than a place in your gallery.
          </h1>
          <p className="mt-8 max-w-lg text-lg text-ivory/80">Turn your most precious memories into timeless objects and experiences.</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/our-story" className="bg-ivory px-8 py-4 text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-sand">Discover MÉMORA</Link>
            <Link to="/shop" className="border border-ivory/60 px-8 py-4 text-xs uppercase tracking-[0.2em] hover:bg-ivory/10">Create your memory</Link>
          </div>
        </div>
      </section>

      <section className="container-x grid gap-12 py-32 md:grid-cols-[1fr_1.4fr]">
        <p className="eyebrow">Our philosophy</p>
        <p className="font-serif text-3xl leading-snug md:text-5xl">
          MÉMORA does not sell objects. We preserve meaning — the laugh behind a photograph, the voice behind a letter —
          and give it a place in the world <em className="text-taupe">that will not fade.</em>
        </p>
      </section>

      <section className="bg-cream py-28">
        <div className="container-x">
          <p className="eyebrow">How it works</p>
          <div className="mt-14 grid gap-px bg-border md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="bg-cream p-8">
                <span className="font-serif text-6xl text-taupe">0{i + 1}</span>
                <h3 className="mt-8 text-2xl">{t}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x py-32">
        <div className="flex items-end justify-between">
          <h2 className="text-4xl md:text-6xl">The collection</h2>
          <Link to="/shop" className="text-sm underline underline-offset-8">View all</Link>
        </div>
        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      <section className="grid md:grid-cols-2">
        <img src={box} alt="Open MÉMORA Box with prints and a sealed letter" loading="lazy" width={1024} height={1024} className="aspect-square h-full w-full object-cover" />
        <div className="flex flex-col justify-center bg-deep-brown p-12 text-ivory md:p-20">
          <p className="eyebrow text-sand">Physical</p>
          <h2 className="mt-6 text-4xl leading-tight md:text-6xl">Not everything important should remain digital.</h2>
          <p className="mt-8 max-w-md text-ivory/75">Thousands of photos sleep in our phones. We bring the ones that matter back into your hands — printed on archival paper, set in oak, sealed in leather.</p>
        </div>
      </section>

      <section className="container-x grid items-center gap-16 py-32 md:grid-cols-[1.2fr_1fr]">
        <img src={scan} alt="A phone opening a digital memory page from an NFC frame" loading="lazy" width={1536} height={1024} className="w-full object-cover" />
        <div>
          <p className="eyebrow">The digital experience</p>
          <h2 className="mt-6 text-4xl leading-tight md:text-5xl">Tap the object. The story opens.</h2>
          <p className="mt-6 text-muted-foreground">Every MÉMORA piece carries an NFC tag or QR code linked to a private memory page — galleries, videos, voice messages and letters, protected by the privacy you choose.</p>
          <Link to="/m/$memorySlug" params={{ memorySlug: "demo-leila-and-sami" }} className="mt-10 inline-block border border-foreground px-8 py-4 text-xs uppercase tracking-[0.2em] hover:bg-foreground hover:text-background">See a demo memory</Link>
        </div>
      </section>

      <section className="border-y border-border py-24">
        <div className="container-x">
          <p className="eyebrow">Gift occasions</p>
          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {OCCASIONS.map((o) => (
              <Link key={o} to="/gift-finder" className="font-serif text-3xl text-foreground/70 transition-colors hover:text-foreground md:text-5xl">{o}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x py-32 text-center">
        <p className="eyebrow">Manifesto</p>
        <p className="mx-auto mt-10 max-w-3xl font-serif text-3xl italic leading-relaxed md:text-4xl">
          Every memory deserves to live. Keep the moment, relive the feeling. Some moments should never fade — so we
          make them into things you can touch, and doors you can open, beyond time.
        </p>
      </section>

      <section className="bg-cream py-28">
        <div className="container-x">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Voices</p>
            <span className="text-xs text-muted-foreground">Demonstration content — real testimonials coming soon</span>
          </div>
          <div className="mt-12 grid gap-12 md:grid-cols-3">
            {[
              ["My grandmother heard my grandfather's voice again. She cried, then she laughed.", "Yasmine, Tunis"],
              ["The most meaningful wedding gift we received. Our guests still scan it.", "Mehdi & Ines, Sousse"],
              ["Our travel year, finally somewhere other than my phone.", "Clara, Lyon"],
            ].map(([q, a]) => (
              <figure key={a}>
                <blockquote className="font-serif text-2xl leading-snug">“{q}”</blockquote>
                <figcaption className="mt-6 text-sm text-muted-foreground">{a}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x py-36 text-center">
        <h2 className="mx-auto max-w-3xl text-5xl leading-tight md:text-7xl">Your story deserves a place in the world.</h2>
        <Link to="/shop" className="mt-12 inline-block bg-primary px-10 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal">Begin your creation</Link>
      </section>
    </>
  );
}
