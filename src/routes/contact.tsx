import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL, INSTAGRAM_URL, mailtoLink, whatsappLink } from "@/lib/contact";
import { Field, PageHero, buttonStyles } from "@/components/site/kit";
import { dictFromMatches, useT } from "@/i18n";

export const Route = createFileRoute("/contact")({
  head: ({ matches }) => {
    const t = dictFromMatches(matches);
    return {
      meta: [
        { title: `${t.nav.contact} — MÉMORA` },
        { name: "description", content: t.contact.lead },
      ],
    };
  },
  component: Contact,
});

const LINK = "font-semibold text-m-wine underline decoration-m-rose underline-offset-4";

function Contact() {
  const t = useT();
  const c = t.contact;
  const [opened, setOpened] = useState(false);

  // Pas encore de serveur pour recevoir ce formulaire : il prépare le message
  // et l'ouvre dans WhatsApp, où l'équipe répond réellement.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = `${c.intro(String(data.get("name")))}\n\n${String(data.get("message"))}`;
    window.open(whatsappLink(text), "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  return (
    <>
      <PageHero title={c.title} intro={c.lead} />
      <section className="container-x grid gap-12 pb-20 md:grid-cols-[1fr_1.3fr]">
        <div className="space-y-8">
          <div>
            <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold tracking-normal text-m-wine">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {c.fastest}
            </h2>
            <a
              href={whatsappLink(t.common.whatsappHello)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ className: "mt-3" })}
            >
              {t.common.whatsapp}
            </a>
          </div>
          <div>
            <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold tracking-normal text-m-wine">
              <Mail className="h-5 w-5" aria-hidden="true" />
              {c.byEmail}
            </h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              dir="ltr"
              className="mt-2 inline-block font-serif text-[26px] text-m-ink underline decoration-m-rose underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK} text-[17px]`}
          >
            {c.instagram}
          </a>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-[20px] border border-m-line bg-m-paper p-6 sm:p-8"
        >
          <h2 className="font-serif text-[28px] text-m-ink">{c.formTitle}</h2>
          <Field
            id="contact-name"
            name="name"
            label={c.name}
            required
            maxLength={80}
            autoComplete="given-name"
          />
          <Field
            id="contact-message"
            name="message"
            label={c.message}
            multiline
            rows={5}
            required
            maxLength={2000}
          />
          <button type="submit" className={buttonStyles({ className: "w-full sm:w-auto" })}>
            {c.send}
          </button>
          <p className="text-sm text-m-step" role="status">
            {opened ? c.hintAfter : c.hintBefore}{" "}
            <a href={mailtoLink(c.emailSubject, "")} className={LINK}>
              {c.preferEmail}
            </a>
          </p>
        </form>
      </section>
    </>
  );
}
