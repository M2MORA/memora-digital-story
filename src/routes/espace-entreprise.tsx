import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import scan from "@/assets/scan-v2.jpg";
import { mailtoLink, whatsappLink } from "@/lib/contact";
import { Field, PageHero, SectionTitle, SelectField, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";

export const Route = createFileRoute("/espace-entreprise")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [
        { title: t.b2b.metaTitle },
        { name: "description", content: `${t.b2b.title} ${t.b2b.lead}` },
      ],
    };
  },
  component: EspaceEntreprisePage,
});

function EspaceEntreprisePage() {
  const t = useT();
  const b = t.b2b;
  const [opened, setOpened] = useState(false);

  // Pas encore de serveur pour recevoir ce formulaire : il prépare un email complet.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const qty = b.quantities.find(([v]) => v === d.get("quantity"))?.[1] ?? "";
    const values = [d.get("name"), d.get("company"), d.get("email"), d.get("phone") ?? "", qty];
    const body = [
      ...b.emailLabels.map((label, i) => `${label} : ${String(values[i] ?? "")}`),
      "",
      String(d.get("details") ?? ""),
    ].join("\n");
    window.location.href = mailtoLink(b.emailSubject(String(d.get("company"))), body);
    setOpened(true);
  };

  return (
    <>
      <PageHero title={b.title} intro={b.lead}>
        <a href="#demande" className={buttonStyles({ className: "mt-8" })}>
          {b.cta}
        </a>
      </PageHero>

      <section className="border-y border-m-line bg-m-paper">
        <div className="container-x grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
          <div>
            <SectionTitle title={b.usesTitle} />
            <dl className="mt-8 space-y-6">
              {b.uses.map(([title, text]) => (
                <div key={title}>
                  <dt className="font-serif text-[24px] font-semibold text-m-ink">{title}</dt>
                  <dd className="mt-1 text-[17px] text-m-muted">{text}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-8 space-y-2.5 text-[17px] text-m-ink">
              {b.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-m-sage" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <img
            src={scan}
            alt={b.imageAlt}
            width={1254}
            height={1254}
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-[4px] object-cover"
          />
        </div>
      </section>

      <section
        id="demande"
        aria-labelledby="demande-titre"
        className="container-x max-w-3xl scroll-mt-24 py-16 md:py-24"
      >
        <SectionTitle id="demande-titre" title={b.formTitle} intro={b.formLead} />
        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-5 rounded-[20px] border border-m-line bg-m-paper p-6 sm:p-8"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="b2b-name" name="name" label={b.name} required autoComplete="name" />
            <Field
              id="b2b-company"
              name="company"
              label={b.company}
              required
              autoComplete="organization"
            />
            <Field
              id="b2b-email"
              name="email"
              type="email"
              label={b.email}
              required
              autoComplete="email"
              dir="ltr"
            />
            <Field
              id="b2b-phone"
              name="phone"
              type="tel"
              label={b.phone}
              autoComplete="tel"
              dir="ltr"
            />
          </div>
          <SelectField
            id="b2b-quantity"
            name="quantity"
            label={b.quantity}
            options={b.quantities}
          />
          <Field
            id="b2b-details"
            name="details"
            label={b.details}
            hint={b.detailsHint}
            multiline
            rows={4}
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="submit" className={buttonStyles()}>
              {b.send}
            </button>
            <a
              href={whatsappLink(b.whatsappHello)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "link", size: "inline" })}
            >
              {b.orWhatsapp}
            </a>
          </div>
          <p className="text-sm text-m-step" role="status">
            {opened ? b.hintAfter : b.hintBefore}
          </p>
        </form>
      </section>
    </>
  );
}
