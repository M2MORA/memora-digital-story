import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { getProduct } from "@/lib/products";
import { PriceTiers } from "@/components/site/PriceTiers";
import { buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [
        { title: `${t.product.name} — MÉMORA` },
        { name: "description", content: t.product.short },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const t = useT();
  const p = t.productPage;
  const { product } = Route.useLoaderData();
  const [img, setImg] = useState(0);

  const specs: [string, string][] = [
    [p.specs.format, product.dimensions],
    [p.specs.included, t.product.materials.join(", ")],
    [p.specs.video, p.videoSpec],
    [p.specs.phones, p.phonesSpec],
    [p.specs.delivery, p.deliverySpec],
    [p.specs.payment, p.paymentSpec],
  ];

  return (
    <section className="container-x grid gap-10 pb-20 pt-8 md:grid-cols-[1.15fr_1fr] md:gap-14 md:pt-14">
      <div>
        <div className="overflow-hidden rounded-[4px] bg-m-stage shadow-paper">
          <img
            src={product.images[img]}
            alt={t.product.imageLabels[img] ?? t.product.name}
            width={1254}
            height={1254}
            fetchPriority="high"
            className="aspect-square w-full object-cover"
          />
        </div>
        <div className="mt-4 flex gap-3" role="group" aria-label={p.chooseImage}>
          {product.images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setImg(i)}
              aria-label={p.imageN(i + 1, t.product.imageLabels[i] ?? t.product.name)}
              aria-pressed={i === img}
              className={`h-20 w-20 overflow-hidden rounded-[4px] border-2 transition-colors ${
                i === img ? "border-m-wine" : "border-transparent opacity-75 hover:opacity-100"
              }`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="md:sticky md:top-24 md:self-start">
        <h1 className="font-serif text-[40px] leading-[1.05] text-m-ink sm:text-[52px]">
          {t.product.name}
        </h1>
        <p className="mt-3 font-serif text-[32px] font-semibold text-m-wine">
          {t.money(product.priceTND)}
        </p>
        <p className="mt-3 text-[17px] text-m-muted">{t.product.short}</p>

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
