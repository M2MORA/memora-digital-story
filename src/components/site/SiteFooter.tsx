import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  const cols = [
    {
      title: "Discover",
      links: [
        { to: "/shop", label: "Shop" },
        { to: "/gift-finder", label: "Gift finder" },
        { to: "/digital-memories", label: "Digital memories" },
      ],
    },
    {
      title: "MÉMORA",
      links: [
        { to: "/our-story", label: "Our story" },
        { to: "/how-it-works", label: "How it works" },
        { to: "/faq", label: "FAQ" },
        { to: "/contact", label: "Contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { to: "/privacy-policy", label: "Privacy policy" },
        { to: "/terms", label: "Terms" },
        { to: "/refund-policy", label: "Refund policy" },
        { to: "/shipping-policy", label: "Shipping policy" },
      ],
    },
  ] as const;
  return (
    <footer className="bg-charcoal text-ivory">
      <div className="container-x grid gap-14 py-20 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <p className="font-serif text-3xl tracking-[0.25em]">MÉMORA</p>
          <p className="mt-6 max-w-xs font-serif text-xl italic text-sand">
            More than a memory. A story that lives forever.
          </p>
          <p className="mt-8 text-xs uppercase tracking-[0.25em] text-taupe">Born in Tunisia. Made for the world.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs uppercase tracking-[0.25em] text-taupe">{c.title}</p>
            <ul className="mt-6 space-y-3">
              {c.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ivory/80 hover:text-ivory">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-x flex flex-col justify-between gap-3 border-t border-ivory/10 py-6 text-xs text-taupe md:flex-row">
        <span>© {new Date().getFullYear()} MÉMORA. All rights reserved.</span>
        <span>Prices in TND · Tunis, Tunisia</span>
      </div>
    </footer>
  );
}
