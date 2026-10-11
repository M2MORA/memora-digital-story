import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock, Film, Images, Lock, Mic, Shield, Users } from "lucide-react";
import moments from "@/assets/product-moments.jpg";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/digital-memories")({
  head: () => ({
    meta: [
      { title: "Digital memories — MÉMORA" },
      { name: "description", content: "Private galleries, video memories, voice messages, letters and timelines connected to your MÉMORA object." },
      { property: "og:title", content: "Digital memories by MÉMORA" },
      { property: "og:description", content: "A private space for your story, opened by a tap." },
    ],
  }),
  component: Digital,
});

const FEATURES = [
  [Images, "Private photo galleries"],
  [Film, "Video memories"],
  [Mic, "Voice messages"],
  [BookOpen, "Personal letters"],
  [Clock, "Chronological timelines"],
  [Users, "Sharing with family"],
  [Shield, "Long-term preservation"],
  [Lock, "Secure access"],
] as const;

function Digital() {
  return (
    <>
      <PageHero eyebrow="Digital memories" title="The story behind the object, kept safe." intro="Every MÉMORA piece opens a private page that you can fill, share and keep growing for years." />
      <section className="container-x grid gap-px bg-border md:grid-cols-4">
        {FEATURES.map(([Icon, t]) => (
          <div key={t} className="bg-background p-10">
            <Icon className="h-6 w-6 text-taupe" strokeWidth={1.2} />
            <p className="mt-6 font-serif text-2xl">{t}</p>
          </div>
        ))}
      </section>
      <section className="container-x grid items-center gap-16 py-28 md:grid-cols-2">
        <div>
          <h2 className="text-4xl md:text-5xl">Private by default.</h2>
          <p className="mt-6 text-muted-foreground">Choose who can open your memory: only you, anyone with the unlisted link, or guests who know the password.</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/shop" className="bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground">Create your digital memory</Link>
            <Link to="/m/$memorySlug" params={{ memorySlug: "demo-leila-and-sami" }} className="border border-foreground px-8 py-4 text-xs uppercase tracking-[0.2em]">View demo</Link>
          </div>
        </div>
        <img src={moments} alt="MÉMORA Moments plaque" loading="lazy" className="w-full bg-cream" />
      </section>
    </>
  );
}
