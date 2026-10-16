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
      className={`fixed inset-x-0 top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border transition-all duration-500 ease-out ${
        isHidden
          ? "-translate-y-full opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100 pointer-events-auto shadow-xs"
      }`}
    >
      <div className="container-x flex h-20 items-center justify-between">
        <Link to="/" className="font-serif text-2xl tracking-[0.25em] font-normal text-charcoal">
          MÉMORA
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((n) => {
            const isDemo = "params" in n;
            return isDemo ? (
              <Link
                key={n.to}
                to={n.to}
                params={n.params}
                className="text-xs uppercase tracking-wider text-foreground/75 transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-semibold" }}
              >
                {n.label}
              </Link>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                className="text-xs uppercase tracking-wider text-foreground/75 transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-semibold" }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Icons */}
        <div className="flex items-center gap-4">
          <Link to="/cart" aria-label="Mon Panier" className="relative p-2 text-charcoal hover:text-deep-brown transition-colors">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.4} />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-deep-brown px-1 text-[10px] text-ivory font-bold">
                {count}
              </span>
            )}
          </Link>

          <Link
            to="/commander"
            className="hidden rounded-full bg-deep-brown px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-semibold text-ivory hover:bg-charcoal transition-all md:inline-flex items-center gap-2 shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-sand" />
            <span>Créer mon MÉMORA</span>
          </Link>

          <button
            className="p-2 lg:hidden text-charcoal"
            aria-label="Menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" strokeWidth={1.4} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {open && (
        <nav className="container-x flex flex-col gap-2 pb-8 lg:hidden animate-in fade-in">
          {NAV.map((n) => {
            const isDemo = "params" in n;
            return isDemo ? (
              <Link
                key={n.to}
                to={n.to}
                params={n.params}
                onClick={() => setOpen(false)}
                className="font-serif text-2xl py-1 text-charcoal hover:text-deep-brown"
              >
                {n.label}
              </Link>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="font-serif text-2xl py-1 text-charcoal hover:text-deep-brown"
              >
                {n.label}
              </Link>
            );
          })}

          <div className="my-2 border-t border-border/60 pt-2 flex flex-col gap-1">
            {EXTRA_MOBILE_NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-charcoal py-1"
              >
                {n.label}
              </Link>
            ))}
          </div>

          <Link
            to="/cart"
            onClick={() => setOpen(false)}
            className="font-serif text-xl py-1 text-charcoal hover:text-deep-brown flex items-center justify-between border-t border-border/60 pt-3"
          >
            <span>Mon Panier</span>
            {count > 0 && (
              <span className="rounded-full bg-deep-brown px-2 py-0.5 text-xs text-ivory">
                {count}
              </span>
            )}
          </Link>

          <Link
            to="/commander"
            onClick={() => setOpen(false)}
            className="mt-4 text-center rounded-full bg-deep-brown py-3.5 text-xs uppercase tracking-widest text-ivory font-semibold shadow-md flex items-center justify-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-sand" />
            <span>Créer mon tirage MÉMORA</span>
          </Link>
        </nav>
      )}
    </header>
  );
}
