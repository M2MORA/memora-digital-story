import { createFileRoute, Link } from "@tanstack/react-router";
import scan from "@/assets/scan.jpg";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — MÉMORA" },
      { name: "description", content: "From choosing your object to scanning its NFC tag or QR code: the full MÉMORA experience in six steps." },
      { property: "og:title", content: "How MÉMORA works" },
      { property: "og:description", content: "Six steps from a memory to a timeless connected object." },
    ],
  }),
  component: How,
});

const STEPS = [
  ["Select a physical product", "A plaque, a box, an album or a frame — each made to last."],
  ["Upload your memories", "Photos, videos, voice notes and letters, stored securely."],
  ["Personalize your creation", "Title, date, message, template and finish in our studio."],
  ["Receive your product", "Crafted in Tunisia and delivered with care."],
  ["Scan its NFC or QR code", "Hold a phone close or open the camera."],
  ["Open your private memory page", "Your story, protected by the privacy you choose."],
];

function How() {
  return (
    <>
      <PageHero eyebrow="How it works" title="From a moment to an object that remembers." />
      <section className="container-x grid gap-px bg-border pb-px md:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="bg-background p-10">
            <span className="font-serif text-5xl text-taupe">0{i + 1}</span>
            <h2 className="mt-6 text-3xl">{t}</h2>
            <p className="mt-3 text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <section className="container-x grid items-center gap-16 py-28 md:grid-cols-2">
        <img src={scan} alt="Scanning a MÉMORA frame with a smartphone" loading="lazy" className="w-full" />
        <div>
          <h2 className="text-4xl md:text-5xl">A tap, a scan, a story.</h2>
          <p className="mt-6 text-muted-foreground">
            <strong className="font-medium text-foreground">QR codes</strong> work with the camera of almost every modern smartphone.
          </p>
          <p className="mt-4 text-muted-foreground">
            <strong className="font-medium text-foreground">NFC</strong> lets you simply tap your phone on the object. Availability depends on your device — most recent iPhones and Android phones support it.
          </p>
          <Link to="/shop" className="mt-10 inline-block bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground">Start creating</Link>
        </div>
      </section>
    </>
  );
}
