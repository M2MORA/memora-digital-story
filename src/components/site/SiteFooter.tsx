import { Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, INSTAGRAM_URL, whatsappLink } from "@/lib/contact";
import { PRODUCTS } from "@/lib/products";
import { useT, type Dict } from "@/i18n";
import { LangSwitch } from "./LangSwitch";

type FooterLink = { label: string; to: string; params?: Record<string, string> };

function columns(t: Dict): { title: string; links: FooterLink[] }[] {
  return [
    {
      title: t.footer.order,
      links: [
        { to: "/commander", label: t.common.create },
        {
          to: "/product/$slug",
          params: { slug: PRODUCTS[0]!.slug },
          label: t.footer.productPrices,
        },
        { to: "/editeasy", label: t.footer.editor },
        { to: "/cart", label: t.footer.myCart },
      ],
    },
    {
      title: t.footer.discover,
      links: [
        { to: "/how-it-works", label: t.nav.how },
        { to: "/m/$memorySlug", params: { memorySlug: "demo-leila-and-sami" }, label: t.nav.demo },
        { to: "/our-story", label: t.nav.story },
        { to: "/espace-entreprise", label: t.nav.business },
      ],
    },
    {
      title: t.footer.help,
      links: [
        { to: "/faq", label: t.footer.faq },
        { to: "/contact", label: t.nav.contact },
        { to: "/shipping-policy", label: t.footer.shipping },
        { to: "/refund-policy", label: t.footer.refund },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { to: "/terms", label: t.footer.terms },
        { to: "/privacy-policy", label: t.footer.privacy },
      ],
    },
  ];
}

const LINK =
  "inline-flex min-h-11 items-center text-[15px] text-m-linen/75 transition-colors hover:text-m-linen md:min-h-9";

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="bg-m-night text-m-linen">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.3fr_repeat(4,1fr)] md:gap-8">
        <div>
          <p className="keep-tracking font-serif text-[28px] font-semibold tracking-[0.18em]">
            MÉMORA
          </p>
          <p className="mt-3 max-w-xs font-serif text-[20px] italic leading-snug text-m-linen/85">
            {t.footer.tagline}
          </p>
          <ul className="mt-6 space-y-1 text-[15px]">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className={LINK} dir="ltr">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className={LINK}>
                WhatsApp
              </a>
            </li>
            <li>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                Instagram
              </a>
            </li>
          </ul>
          <LangSwitch tone="light" className="-ms-2 mt-6" />
        </div>

        {columns(t).map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold text-m-rose">{col.title}</p>
            <ul className="mt-3">
              {col.links.map((l) => (
                <li key={l.to}>
                  {l.params ? (
                    <Link to={l.to} params={l.params} className={LINK}>
                      {l.label}
                    </Link>
                  ) : (
                    <Link to={l.to} className={LINK}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container-x flex flex-col gap-2 border-t border-m-linen/10 py-6 text-sm text-m-linen/60 md:flex-row md:justify-between">
        <p>
          © {new Date().getFullYear()} MÉMORA. {t.footer.made}
        </p>
        <p>{t.footer.prices}</p>
      </div>
    </footer>
  );
}
