import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — MÉMORA" },
      { name: "description", content: "Answers about MÉMORA products, personalization, NFC and QR, digital memories, privacy, delivery and payments." },
      { property: "og:title", content: "Frequently asked questions — MÉMORA" },
      { property: "og:description", content: "Everything you need to know before creating your memory." },
    ],
  }),
  component: Faq,
});

const FAQ: [string, [string, string][]][] = [
  ["Products", [["What are MÉMORA pieces made of?", "Solid oak, glass, archival paper, linen and leather, crafted in Tunisia."]]],
  ["Personalization", [["Can I preview my creation?", "Yes — the studio shows a live preview as you choose photos, text and finish."]]],
  ["NFC and QR", [["Will it work with my phone?", "QR codes work with almost every smartphone camera. NFC depends on your device; most recent phones support it."]]],
  ["Digital memories", [["Can I add content later?", "Yes. You can keep adding photos, videos and letters to your memory page from your account."]]],
  ["Privacy and security", [["Who can see my memory?", "You decide: private, unlisted link, or password-protected. Memories are never listed publicly."]]],
  ["Orders and delivery", [["How long does it take?", "Most pieces are crafted in 5–8 days, then delivered across Tunisia in 2–3 days."]]],
  ["Payments", [["Which payment methods are accepted?", "Online payment is being set up. In the meantime, contact us to place an order."]]],
  ["Storage and preservation", [["How long are memories kept?", "Your memories are preserved for as long as your account is active, with secure backups."]]],
];

function Faq() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions, gently answered." />
      <section className="container-x max-w-4xl pb-32">
        {FAQ.map(([cat, qs]) => (
          <div key={cat} className="mb-14">
            <p className="eyebrow mb-4">{cat}</p>
            {qs.map(([q, a]) => (
              <details key={q} className="group border-b border-border py-6">
                <summary className="flex cursor-pointer list-none justify-between font-serif text-2xl">
                  {q}
                  <span className="text-taupe transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}
