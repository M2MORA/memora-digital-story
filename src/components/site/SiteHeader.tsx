import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShoppingBag, X, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/cart";

const NAV = [
  { to: "/how-it-works", label: "Comment ça marche" },
  { to: "/shop", label: "Boutique" },
  { to: "/m/$memorySlug", params: { memorySlug: "demo-leila-and-sami" }, label: "Démo NFC" },
  { to: "/faq", label: "FAQ" },
] as const;

const EXTRA_MOBILE_NAV = [
  { to: "/editeasy", label: "Montage Auto Gratuit" },
  { to: "/espace-entreprise", label: "Entreprises & Événements" },
  { to: "/our-story", label: "Notre Histoire" },
] as const;

export function SiteHeader() {
  const { items } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 60);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const isHidden = isHome && !scrolled && !open;
  const count = items.reduce((n, i) => n + i.qty, 0);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/80 transition-all duration-500 ease-out after:absolute after:bottom-0 after:inset-x-0 after:h-px after:bg-linear-to-r after:from-transparent after:via-champagne/30 after:to-transparent ${
        isHidden
          ? "-translate-y-full opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100 pointer-events-auto shadow-[0_2px_16px_rgba(44,36,32,0.03)]"
      }`}
    >
      <div className="container-x flex h-20 items-center justify-between">
        <Link
          to="/"
          className="font-serif text-2xl tracking-[0.28em] font-normal text-charcoal hover:opacity-80 transition-opacity"
        >
          MÉMORA
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((n) => {
            const isDemo = "params" in n;
            return isDemo ? (
              <Link
                key={n.to}
                to={n.to}
                params={n.params}
                className="text-[11px] uppercase tracking-[0.2em] font-medium text-foreground/70 transition-colors hover:text-charcoal py-1"
                activeProps={{ className: "text-charcoal font-semibold underline underline-offset-8 decoration-champagne/70" }}
              >
                {n.label}
              </Link>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                className="text-[11px] uppercase tracking-[0.2em] font-medium text-foreground/70 transition-colors hover:text-charcoal py-1"
                activeProps={{ className: "text-charcoal font-semibold underline underline-offset-8 decoration-champagne/70" }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Icons */}
        <div className="flex items-center gap-4">
          <Link
            to="/cart"
            aria-label="Mon Panier"
            className="relative p-2.5 rounded-full text-charcoal hover:text-deep-brown hover:bg-cream/60 transition-all"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute 0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-deep-brown px-1 text-[10px] text-ivory font-bold shadow-xs ring-2 ring-background">
                {count}
              </span>
            )}
          </Link>

          <Link
            to="/commander"
            className="hidden rounded-full bg-deep-brown px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] font-semibold text-ivory hover:bg-charcoal transition-all md:inline-flex items-center gap-2 shadow-xs hover:shadow-md ring-1 ring-champagne/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-champagne" />
            <span>Créer mon MÉMORA</span>
          </Link>

          <button
            className="p-2.5 rounded-full lg:hidden text-charcoal hover:bg-cream/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {open && (
        <nav className="container-x flex flex-col gap-2 pb-8 pt-2 lg:hidden animate-in fade-in slide-in-from-top-2 duration-200 border-t border-border/40">
          {NAV.map((n) => {
            const isDemo = "params" in n;
            return isDemo ? (
              <Link
                key={n.to}
                to={n.to}
                params={n.params}
                onClick={() => setOpen(false)}
                className="font-serif text-2xl py-2.5 text-charcoal hover:text-deep-brown transition-colors min-h-[48px] flex items-center"
              >
                {n.label}
              </Link>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="font-serif text-2xl py-2.5 text-charcoal hover:text-deep-brown transition-colors min-h-[48px] flex items-center"
              >
                {n.label}
              </Link>
            );
          })}

          <div className="my-3 border-t border-border/60 pt-3 flex flex-col gap-1">
            {EXTRA_MOBILE_NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-xs uppercase tracking-wider font-medium text-muted-foreground hover:text-charcoal py-2 min-h-[44px] flex items-center"
              >
                {n.label}
              </Link>
            ))}
          </div>

          <Link
            to="/cart"
            onClick={() => setOpen(false)}
            className="font-serif text-xl py-2 text-charcoal hover:text-deep-brown flex items-center justify-between border-t border-border/60 pt-3 min-h-[48px]"
          >
            <span>Mon Panier</span>
            {count > 0 && (
              <span className="rounded-full bg-deep-brown px-2.5 py-0.5 text-xs text-ivory font-medium">
                {count} {count > 1 ? "articles" : "article"}
              </span>
            )}
          </Link>

          <Link
            to="/commander"
            onClick={() => setOpen(false)}
            className="mt-4 text-center rounded-full bg-deep-brown py-4 text-xs uppercase tracking-widest text-ivory font-semibold shadow-md flex items-center justify-center gap-2 hover:bg-charcoal transition-colors min-h-[48px]"
          >
            <Sparkles className="h-4 w-4 text-champagne" />
            <span>Créer mon tirage MÉMORA</span>
          </Link>
        </nav>
      )}
    </header>
  );
}
