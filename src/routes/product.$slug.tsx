import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { getProduct, resolveProduct } from "@/lib/products";
import { supabase } from "@/lib/supabase";
import { PriceTiers } from "@/components/site/PriceTiers";
import { buttonStyles } from "@/components/site/kit";
import { langFromMatches, useLang, useT } from "@/i18n";
import { Img } from "@/components/site/Img";
import { IMAGES, type OptimizedImage } from "@/lib/images.gen";
import { getUnitPrice } from "@/lib/pricing";
import { usePricing } from "@/hooks/use-pricing";

// Article sans photo en base (l'article d'origine) : galerie livrée avec le site, à l'identique.
const BUNDLED_GALLERY = [IMAGES.envelope, IMAGES.moments, IMAGES.hero];

/** Photo de la galerie : optimisée si livrée avec le site, simple URL si envoyée depuis l'admin. */
function GalleryImage({
  image,
  alt,
  sizes,
  className,
  priority = false,
}: {
  image: OptimizedImage | string;
  alt: string;
  sizes: string;
  className: string;
  priority?: boolean;
}) {
  if (typeof image !== "string")
    return <Img image={image} alt={alt} sizes={sizes} priority={priority} className={className} />;
  return (
    <img
      src={image}
      alt={alt}
      width={1200}
      height={1200}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
      className={className}
    />
  );
}

export const Route = createFileRoute("/product/$slug")({
  // Article inconnu ou désactivé : page introuvable. Base illisible : page d'erreur.
  loader: async ({ params }) => {
    const product = await getProduct(supabase, params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ matches, loaderData }) => {
    if (!loaderData) return {};
    const product = resolveProduct(loaderData.product, langFromMatches(matches));
    return {
      meta: [
        { title: `${product.name} — MÉMORA` },
        { name: "description", content: product.tagline },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const t = useT();
  const p = t.productPage;
  const product = resolveProduct(Route.useLoaderData().product, useLang());
  const pricing = usePricing();
  const [img, setImg] = useState(0);
  const uploaded = product.images.length > 0;
  const gallery: (OptimizedImage | string)[] = uploaded ? product.images : BUNDLED_GALLERY;
  const label = (i: number) => (uploaded ? `${product.name} ${i + 1}` : (p.imageLabels[i] ?? product.name));
  const shown = img < gallery.length ? img : 0;

  const specs: [string, string][] = [
    [p.specs.format, product.dimensions],
    [p.specs.included, product.materials.join(", ")],
    [p.specs.video, p.videoSpec(pricing)],
    [p.specs.phones, p.phonesSpec],
    [p.specs.delivery, p.deliverySpec(pricing)],
    [p.specs.payment, p.paymentSpec],
  ];

  return (
    <section className="container-x grid gap-10 pb-20 pt-8 md:grid-cols-[1.15fr_1fr] md:gap-14 md:pt-14">
      <div>
        <div className="overflow-hidden rounded-[4px] bg-m-stage shadow-paper">
          <GalleryImage
            key={shown}
            image={gallery[shown]!}
            alt={label(shown)}
            sizes="(min-width: 768px) 55vw, 100vw"
            priority
            className="aspect-square w-full object-cover"
          />
        </div>
        <div className="mt-4 flex gap-3" role="group" aria-label={p.chooseImage}>
          {gallery.map((image, i) => (
            <button
              key={typeof image === "string" ? image : image.src}
              type="button"
              onClick={() => setImg(i)}
              aria-label={p.imageN(i + 1, label(i))}
              aria-pressed={i === shown}
              className={`h-20 w-20 overflow-hidden rounded-[4px] border-2 transition-colors ${
                i === shown ? "border-m-wine" : "border-transparent opacity-75 hover:opacity-100"
              }`}
            >
              <GalleryImage image={image} alt="" sizes="80px" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="md:sticky md:top-24 md:self-start">
        <h1 className="font-serif text-[40px] leading-[1.05] text-m-ink sm:text-[52px]">
          {product.name}
        </h1>
        <p className="mt-3 font-serif text-[32px] font-semibold text-m-wine">
          {t.money(getUnitPrice(pricing, product.formatCode, 1))}
        </p>
        <p className="mt-3 text-[17px] text-m-muted">{product.tagline}</p>

        <Link
          to="/commander"
          search={{ format: product.formatCode, stage: "video" }}
          className={buttonStyles({ className: "mt-8 w-full sm:w-auto" })}
        >
          {t.common.create}
        </Link>
        <ul className="mt-5 space-y-2 text-[15px] text-m-ink">
          {p.reassure.map((r) => (
            <li key={r} className="flex gap-2.5">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-10 divide-y divide-m-line border-y border-m-line">
          {specs.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-[15px] font-semibold text-m-muted">{k}</dt>
              <dd className="text-[15px] leading-relaxed text-m-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-10 font-serif text-[26px] text-m-ink">{t.tiers.title}</h2>
        <p className="mt-1 text-[15px] text-m-muted">{p.tiersNote}</p>
        <div className="mt-3">
          <PriceTiers />
        </div>
      </div>
    </section>
  );
}
