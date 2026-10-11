import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ImagePlus, Mic } from "lucide-react";
import { toast } from "sonner";
import { cart } from "@/lib/cart";
import { formatPrice, getProduct } from "@/lib/products";

export const Route = createFileRoute("/create/$productId")({
  loader: ({ params }) => {
    const product = getProduct(params.productId);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Create your ${loaderData.product.name} — MÉMORA Studio` : "Studio — MÉMORA" },
      { name: "description", content: "Personalize your MÉMORA piece with photos, a title, a date and a personal message." },
      { property: "og:title", content: "MÉMORA Studio" },
      { property: "og:description", content: "Shape your memory into a timeless object." },
    ],
  }),
  component: Studio,
});

const TEMPLATES = ["Éternel", "Minimal", "Lettre", "Galerie"];
const COLORS = [
  { id: "ivory", cls: "bg-ivory" },
  { id: "sand", cls: "bg-sand" },
  { id: "taupe", cls: "bg-taupe" },
  { id: "brown", cls: "bg-deep-brown" },
  { id: "charcoal", cls: "bg-charcoal" },
];
const DRAFT = "memora-studio-draft";

function Studio() {
  const { product } = Route.useLoaderData();
  const nav = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState("Leila & Sami");
  const [date, setDate] = useState("2026-06-14");
  const [message, setMessage] = useState("The day the sea stood still.");
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [color, setColor] = useState("ivory");
  const [conn, setConn] = useState(product.connectivity.length > 1 ? "both" : product.connectivity[0]);
  const [media, setMedia] = useState<string | null>(null);

  useEffect(() => {
    const d = localStorage.getItem(`${DRAFT}-${product.id}`);
    if (d) {
      const v = JSON.parse(d);
      setTitle(v.title); setDate(v.date); setMessage(v.message); setTemplate(v.template); setColor(v.color);
    }
  }, [product.id]);
  useEffect(() => {
    localStorage.setItem(`${DRAFT}-${product.id}`, JSON.stringify({ title, date, message, template, color }));
  }, [product.id, title, date, message, template, color]);

  const frame = COLORS.find((c) => c.id === color)!.cls;
  const dark = color === "brown" || color === "charcoal";

  return (
    <section className="container-x grid gap-14 pb-24 pt-32 lg:grid-cols-[1.2fr_1fr]">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="eyebrow">Live preview · {product.name}</p>
        <div className="mt-6 flex aspect-[4/5] items-center justify-center bg-cream p-10">
          <div className={`flex h-full w-full flex-col p-6 shadow-2xl transition-colors duration-700 ${frame}`}>
            <div className="relative flex-1 overflow-hidden bg-muted">
              {photos[0] ? (
                <img src={photos[0]} alt="Your photograph" className="h-full w-full object-cover sepia-[.15]" />
              ) : (
                <img src={product.images[0]} alt="" className="h-full w-full object-cover opacity-60" />
              )}
              {template === "Galerie" && photos.length > 1 && (
                <div className="absolute bottom-3 right-3 flex gap-2">
                  {photos.slice(1, 4).map((p) => <img key={p} src={p} alt="" className="h-14 w-14 border-2 border-ivory object-cover" />)}
                </div>
              )}
            </div>
            <div className={`pt-5 text-center ${dark ? "text-ivory" : "text-charcoal"}`}>
              <p className={`font-serif ${template === "Lettre" ? "italic" : ""} text-3xl`}>{title || "Your title"}</p>
              {date && <p className="mt-1 text-[10px] uppercase tracking-[0.3em] opacity-70">{new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>}
              {template !== "Minimal" && message && <p className="mt-2 font-serif text-sm italic opacity-80">{message}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        <div>
          <h1 className="text-5xl">The Studio</h1>
          <p className="mt-3 text-muted-foreground">Shape your memory. Your choices are saved as you go.</p>
        </div>

        <Field n="01" label="Photographs">
          <label className="flex cursor-pointer flex-col items-center gap-3 border border-dashed border-taupe py-10 text-sm text-muted-foreground hover:bg-cream">
            <ImagePlus className="h-6 w-6" strokeWidth={1.2} />
            {photos.length ? `${photos.length} photo(s) selected` : "Upload your photographs"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setPhotos(Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f)))} />
          </label>
        </Field>

        <Field n="02" label="Title & date">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} className="w-full border-b border-border bg-transparent py-3 font-serif text-2xl outline-hidden focus:border-foreground" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-4 w-full border-b border-border bg-transparent py-3 outline-hidden" />
        </Field>

        <Field n="03" label="Personal message">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} rows={3} className="w-full border border-border bg-transparent p-4 font-serif text-lg italic outline-hidden focus:border-foreground" />
        </Field>

        <Field n="04" label="Template">
          <div className="grid grid-cols-4 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t} onClick={() => setTemplate(t)} className={`border py-3 text-sm ${template === t ? "border-foreground bg-foreground text-background" : "border-border"}`}>{t}</button>
            ))}
          </div>
        </Field>

        <Field n="05" label="Finish">
          <div className="flex gap-3">
            {COLORS.map((c) => (
              <button key={c.id} aria-label={c.id} onClick={() => setColor(c.id)} className={`h-10 w-10 rounded-full border ${c.cls} ${color === c.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "border-border"}`} />
            ))}
          </div>
        </Field>

        <Field n="06" label="Audio or video (optional)">
          <label className="flex cursor-pointer items-center gap-3 border border-border px-4 py-4 text-sm text-muted-foreground hover:bg-cream">
            <Mic className="h-5 w-5" strokeWidth={1.2} />
            {media ?? "Add a voice message or a short video"}
            <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => setMedia(e.target.files?.[0]?.name ?? null)} />
          </label>
        </Field>

        <Field n="07" label="Connection">
          <div className="grid grid-cols-3 gap-2">
            {(["qr", "nfc", "both"] as const).map((c) => {
              const ok = c === "both" ? product.connectivity.length > 1 : product.connectivity.includes(c);
              return (
                <button key={c} disabled={!ok} onClick={() => setConn(c)} className={`border py-3 text-sm uppercase disabled:opacity-30 ${conn === c ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                  {c === "both" ? "NFC + QR" : c}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex items-center justify-between border-t border-border pt-8">
          <span className="text-2xl">{formatPrice(product.price)}</span>
          <button
            onClick={() => {
              cart.add(product.id, { title, date, message, template, color, connectivity: conn, photoCount: photos.length });
              toast.success("Your creation was added to the cart");
              nav({ to: "/cart" });
            }}
            className="bg-primary px-10 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal"
          >
            Add to cart
          </button>
        </div>
        <Link to="/product/$slug" params={{ slug: product.slug }} className="block text-sm text-muted-foreground underline">Back to product</Link>
      </div>
    </section>
  );
}

function Field({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-4 flex gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"><span className="text-taupe">{n}</span>{label}</p>
      {children}
    </div>
  );
}
