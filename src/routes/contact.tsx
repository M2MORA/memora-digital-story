import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — MÉMORA" },
      { name: "description", content: "Write to the MÉMORA team by email, Instagram, Facebook or WhatsApp." },
      { property: "og:title", content: "Contact MÉMORA" },
      { property: "og:description", content: "We would love to hear your story." },
    ],
  }),
  component: Contact,
});

// Placeholder contact details — to be replaced with the real ones (configurable from admin later).
const CONTACT = {
  email: "hello@memora.tn",
  instagram: "https://instagram.com/memora",
  facebook: "https://facebook.com/memora",
  whatsapp: "https://wa.me/21600000000",
};

function Contact() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageHero eyebrow="Contact" title="We would love to hear your story." />
      <section className="container-x grid gap-16 pb-32 md:grid-cols-[1fr_1.3fr]">
        <ul className="space-y-6 text-lg">
          <li><a href={`mailto:${CONTACT.email}`} className="hover:underline">{CONTACT.email}</a></li>
          <li><a href={CONTACT.instagram} target="_blank" rel="noreferrer" className="hover:underline">Instagram</a></li>
          <li><a href={CONTACT.facebook} target="_blank" rel="noreferrer" className="hover:underline">Facebook</a></li>
          <li><a href={CONTACT.whatsapp} target="_blank" rel="noreferrer" className="hover:underline">WhatsApp</a></li>
        </ul>
        {sent ? (
          <p className="font-serif text-3xl italic">Thank you. We'll write back soon.</p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setSent(true); toast.success("Message received"); }}
            className="space-y-6"
          >
            {["Name", "Email"].map((l) => (
              <input key={l} required type={l === "Email" ? "email" : "text"} placeholder={l} maxLength={120} className="w-full border-b border-border bg-transparent py-3 outline-hidden focus:border-foreground" />
            ))}
            <textarea required placeholder="Your message" rows={5} maxLength={2000} className="w-full border-b border-border bg-transparent py-3 outline-hidden focus:border-foreground" />
            <button className="bg-primary px-10 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground">Send</button>
          </form>
        )}
      </section>
    </>
  );
}
