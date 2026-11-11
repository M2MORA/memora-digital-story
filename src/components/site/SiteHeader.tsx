import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/cart";
import { useHeroPassed } from "@/hooks/use-hero-passed";
import { PRODUCTS } from "@/lib/products";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { buttonStyles } from "./kit";
import { LangSwitch } from "./LangSwitch";

const PRODUCT_SLUG = PRODUCTS[0]!.slug;
const DEMO = { memorySlug: "demo-leila-and-sami" };

const LINK =
  "text-[15px] font-medium text-m-muted transition-colors hover:text-m-ink py-2 group-data-[overlay]/header:text-m-linen/85 group-data-[overlay]/header:hover:text-m-linen";
const ICON_BUTTON =
  "relative flex h-11 w-11 items-center justify-center rounded-full text-m-ink transition-colors hover:bg-m-blush group-data-[overlay]/header:text-m-linen group-data-[overlay]/header:hover:bg-m-linen/15";
const ACTIVE = {
  className: "text-m-ink underline decoration-m-rose decoration-2 underline-offset-8",
};
const MENU_LINK =
  "flex min-h-12 items-center border-b border-m-line font-serif text-[24px] text-m-ink";

export function SiteHeader() {
  const t = useT();
  const { items } = useStore();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const count = items.reduce((n, i) => n + i.qty, 0);

  // Sur l'accueil, l'en-tête reste transparent tant que la photo du hero est à
  // l'écran, puis devient opaque. Il reste toujours visible.
  const heroPassed = useHeroPassed();
  const overlay = pathname === "/" && !heroPassed && !open;

  // Le menu se ferme à chaque changement de page et avec Échap
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      data-overlay={overlay || undefined}
      className={cn(
        "group/header sticky top-0 z-50 border-b transition-colors duration-300",
        overlay
          ? "border-transparent bg-transparent"
          : "border-m-line bg-m-linen/95 backdrop-blur-sm",
      )}
    >
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="MÉMORA"
          className={cn(
            "keep-tracking font-serif text-[24px] font-semibold tracking-[0.18em] transition-colors",
            overlay ? "text-m-linen" : "text-m-wine",
          )}
        >
          MÉMORA
        </Link>

        <nav aria-label={t.nav.main} className="hidden items-center gap-7 xl:flex">
          <Link to="/how-it-works" className={LINK} activeProps={ACTIVE}>
            {t.nav.how}
          </Link>
          <Link
            to="/product/$slug"
            params={{ slug: PRODUCT_SLUG }}
            className={LINK}
            activeProps={ACTIVE}
          >
            {t.nav.product}
          </Link>
          <Link to="/m/$memorySlug" params={DEMO} className={LINK}>
            {t.nav.demo}
          </Link>
          <Link to="/faq" className={LINK} activeProps={ACTIVE}>
            {t.nav.faq}
          </Link>
        </nav>

        <div className="flex items-center gap-1.5">
          <LangSwitch tone={overlay ? "light" : "dark"} className="hidden md:flex" />
          <Link
            to="/cart"
            aria-label={count > 0 ? t.nav.cartCount(count) : t.nav.cart}
            className={ICON_BUTTON}
          >
            <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
            {count > 0 && (
              <span className="absolute end-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-m-wine px-1 text-[12px] font-bold text-m-linen">
                {count}
              </span>
            )}
          </Link>

          <Link
            to="/commander"
            className={buttonStyles({
              variant: overlay ? "inverse" : "primary",
              size: "md",
              className: "ms-1 hidden md:inline-flex",
            })}
          >
            {t.common.create}
          </Link>

          <button
            type="button"
            className={cn(ICON_BUTTON, "xl:hidden")}
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="menu-mobile"
          aria-label={t.nav.menu}
          className="container-x max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-m-line bg-m-linen pb-6 pt-3 xl:hidden"
        >
          <LangSwitch className="mb-2 md:hidden" />
          <ul className="flex flex-col">
            <li>
              <Link to="/how-it-works" className={MENU_LINK}>
                {t.nav.how}
              </Link>
            </li>
            <li>
              <Link to="/product/$slug" params={{ slug: PRODUCT_SLUG }} className={MENU_LINK}>
                {t.nav.product}
              </Link>
            </li>
            <li>
              <Link to="/m/$memorySlug" params={DEMO} className={MENU_LINK}>
                {t.nav.demo}
              </Link>
            </li>
            <li>
              <Link to="/faq" className={MENU_LINK}>
                {t.nav.faq}
              </Link>
            </li>
            <li>
              <Link to="/our-story" className={MENU_LINK}>
                {t.nav.story}
              </Link>
            </li>
            <li>
              <Link to="/espace-entreprise" className={MENU_LINK}>
                {t.nav.business}
              </Link>
            </li>
            <li>
              <Link to="/contact" className={cn(MENU_LINK, "border-b-0")}>
                {t.nav.contact}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
