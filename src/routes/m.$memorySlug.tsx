import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Lock, Pause, Play, Share2 } from "lucide-react";
import { toast } from "sonner";
import hero from "@/assets/hero.jpg";
import moments from "@/assets/product-moments.jpg";
import box from "@/assets/product-box.jpg";
import scan from "@/assets/scan.jpg";

type Memory = {
  slug: string;
  title: string;
  date: string;
  message: string;
  cover: string;
  privacy: "unlisted" | "password";
  password?: string;
  gallery: string[];
  timeline: { date: string; text: string }[];
  letter: string;
};

// Demonstration memories. Real memories will be loaded securely per owner and privacy setting.
const MEMORIES: Record<string, Memory> = {
  "demo-leila-and-sami": {
    slug: "demo-leila-and-sami",
    title: "Leila & Sami",
    date: "14 June 2026 · Sidi Bou Saïd",
    message: "The day the sea stood still, and so did we.",
    cover: moments,
    privacy: "unlisted",
    gallery: [hero, box, scan, moments],
    timeline: [
      { date: "2019", text: "We met on a rooftop in the medina." },
      { date: "2022", text: "Our first journey together — Djerba, in a borrowed car." },
      { date: "2026", text: "We said yes, facing the sea." },
    ],
    letter:
      "Sami, I wanted to keep this day somewhere it couldn't be lost between thousands of photos. Whenever you hold this frame, I hope you hear the waves again. — Leila",
  },
  "demo-family": {
    slug: "demo-family",
    title: "Our family",
    date: "Since 1978",
    message: "A home is a collection of moments.",
    cover: scan,
    privacy: "password",
    password: "memora",
    gallery: [scan, hero],
    timeline: [{ date: "1978", text: "Grandpa opened the bakery." }],
    letter: "To everyone who carries our name.",
  },
};

export const Route = createFileRoute("/m/$memorySlug")({
  loader: ({ params }) => {
    const m = MEMORIES[params.memorySlug];
    if (!m) throw notFound();
    const { password: _p, ...safe } = m;
    return { memory: safe, locked: m.privacy === "password" };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.memory.title} — a MÉMORA memory` : "Memory — MÉMORA" },
      { name: "description", content: "A private digital memory preserved by MÉMORA." },
      { property: "og:title", content: loaderData?.memory.title ?? "A MÉMORA memory" },
      { property: "og:description", content: "A story that lives forever." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal text-ivory">
      <p className="font-serif text-4xl">This memory is not available.</p>
      <Link to="/" className="mt-6 text-sm text-sand underline">MÉMORA</Link>
    </div>
  ),
  component: MemoryPage,
});

function MemoryPage() {
  const { memory, locked } = Route.useLoaderData();
  const [unlocked, setUnlocked] = useState(!locked);
  const [pw, setPw] = useState("");
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal px-6 text-ivory">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Demo-only check; real memories verify the password on the server.
            if (pw === "memora") setUnlocked(true);
            else toast.error("Incorrect password");
          }}
          className="w-full max-w-sm text-center"
        >
          <Lock className="mx-auto h-6 w-6 text-sand" strokeWidth={1.2} />
          <h1 className="mt-6 text-4xl">{memory.title}</h1>
          <p className="mt-2 text-sm text-taupe">This memory is protected. (Demo password: memora)</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-8 w-full border-b border-taupe bg-transparent py-3 text-center outline-hidden" placeholder="Password" />
          <button className="mt-8 w-full bg-ivory py-3 text-xs uppercase tracking-[0.2em] text-charcoal">Open memory</button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-charcoal text-ivory">
      <audio ref={audio} loop src="https://cdn.pixabay.com/download/audio/2022/02/23/audio_ea70ad08e3.mp3" preload="none" />
      <div className="fixed right-4 top-4 z-40 flex gap-2">
        <button
          aria-label={playing ? "Pause music" : "Play music"}
          onClick={() => {
            if (!audio.current) return;
            if (playing) audio.current.pause();
            else audio.current.play().catch(() => toast("Music unavailable"));
            setPlaying(!playing);
          }}
          className="rounded-full bg-charcoal/60 p-3 backdrop-blur"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          aria-label="Share"
          onClick={async () => {
            const url = window.location.href;
            if (navigator.share) await navigator.share({ title: memory.title, url }).catch(() => {});
            else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
          }}
          className="rounded-full bg-charcoal/60 p-3 backdrop-blur"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      <section className="relative flex min-h-screen items-end">
        <img src={memory.cover} alt={memory.title} className="absolute inset-0 h-full w-full animate-slow-zoom object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-charcoal via-charcoal/40 to-transparent" />
        <div className="relative mx-auto w-full max-w-2xl px-6 pb-20 text-center">
          <p className="eyebrow text-sand">{memory.date}</p>
          <h1 className="mt-4 animate-rise text-6xl md:text-8xl">{memory.title}</h1>
          <p className="mt-6 font-serif text-2xl italic text-ivory/80">{memory.message}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
        <p className="eyebrow mb-8 text-center text-sand">Gallery</p>
        <div className="columns-2 gap-3 md:columns-3">
          {memory.gallery.map((g, i) => (
            <img key={i} src={g} alt="" loading="lazy" className="mb-3 w-full" />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 py-20">
        <p className="eyebrow mb-10 text-center text-sand">Timeline</p>
        <ol className="border-l border-ivory/20">
          {memory.timeline.map((t) => (
            <li key={t.date} className="relative pb-10 pl-8">
              <span className="absolute -left-1 top-2 h-2 w-2 rounded-full bg-sand" />
              <p className="font-serif text-3xl text-sand">{t.date}</p>
              <p className="mt-2 text-ivory/80">{t.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-ivory px-6 py-24 text-charcoal">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow text-center">A letter</p>
          <p className="mt-8 font-serif text-2xl italic leading-relaxed">{memory.letter}</p>
        </div>
      </section>

      <footer className="py-12 text-center text-xs uppercase tracking-[0.3em] text-taupe">
        Preserved by <Link to="/" className="text-sand">MÉMORA</Link>
      </footer>
    </div>
  );
}
