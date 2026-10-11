import { Link } from "@tanstack/react-router";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/cart";

const NAV = [
  { to: "/shop", label: "Shop" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/digital-memories", label: "Digital memories" },
  { to: "/gift-finder", label: "Gift finder" },
  { to: "/our-story", label: "Our story" },
] as const;

export function SiteHeader() {
  const { items } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 20);
    on();
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  const count = items.reduce((n, i) => n + i.qty, 0);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled || open ? "bg-background/90 backdrop-blur-md border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="container-x flex h-20 items-center justify-between">
        <Link to="/" className="font-serif text-2xl tracking-[0.25em]">
          MÉMORA
        </Link>
        <nav className="hidden items-center gap-9 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-sm text-foreground/75 transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link to="/cart" aria-label="Cart" className="relative p-2">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.4} />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
          <Link
            to="/shop"
            className="hidden border border-foreground px-5 py-2.5 text-xs uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background md:inline-block"
          >
            Create
          </Link>
          <button className="p-2 lg:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" strokeWidth={1.4} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="container-x flex flex-col gap-5 pb-8 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="font-serif text-3xl">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
