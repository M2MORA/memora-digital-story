import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { WhatsAppFloat } from "@/components/site/WhatsAppFloat";
import { MobileOrderBar, MobileOrderBarSpacer } from "@/components/site/MobileOrderBar";
import { buttonStyles } from "@/components/site/kit";
import { LangProvider, dictFor, dirOf, effectiveLang, readLang, useT, type Lang } from "@/i18n";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-[40px] leading-tight text-m-ink">{t.notFound.title}</h1>
        <p className="mt-3 text-[17px] text-m-muted">{t.notFound.text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className={buttonStyles({ variant: "secondary" })}>
            {t.common.home}
          </Link>
          <Link to="/commander" className={buttonStyles()}>
            {t.common.create}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const t = useT();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-[36px] leading-tight text-m-ink">{t.error.title}</h1>
        <p className="mt-3 text-[17px] text-m-muted">{t.error.text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={buttonStyles()}
          >
            {t.error.retry}
          </button>
          <a href="/" className={buttonStyles({ variant: "secondary" })}>
            {t.common.home}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Langue choisie (cookie), relue à chaque navigation et après un changement de langue
  loader: (): { lang: Lang } => ({ lang: readLang() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MÉMORA — Les instants passent. Les souvenirs restent." },
      {
        name: "description",
        content:
          "Une photo imprimée avec une puce NFC invisible : posez un téléphone dessus et votre vidéo se lance, sans application. Fabriqué en Tunisie.",
      },
      { name: "theme-color", content: "#F5F0E8" },
      { property: "og:site_name", content: "MÉMORA" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** Langue de la page affichée : celle choisie, sauf sur les pages encore en français */
function useActiveLang(): Lang {
  const data = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return effectiveLang(data?.lang ?? "fr", pathname);
}

function RootShell({ children }: { children: ReactNode }) {
  const lang = useActiveLang();
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Le parcours de commande a son propre en-tête et son bouton fixé en bas
  const isOrderFlow = pathname === "/commander";
  const immersive = pathname.startsWith("/m/") || isOrderFlow;
  const lang = useActiveLang();
  // Le fournisseur de langue est rendu ici : on lit donc le dictionnaire directement
  const t = dictFor(lang);

  return (
    <LangProvider lang={lang}>
      <QueryClientProvider client={queryClient}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        {!immersive && (
          <a
            href="#contenu"
            className="sr-only z-[60] rounded-full bg-m-wine px-5 py-3 text-m-linen focus:not-sr-only focus:fixed focus:start-4 focus:top-3"
          >
            {t.common.skip}
          </a>
        )}
        {!immersive && <SiteHeader />}
        <main id="contenu">
          <Outlet />
        </main>
        {!immersive && <SiteFooter />}
        {!immersive && <WhatsAppFloat />}
        {!immersive && pathname !== "/cart" && (
          <>
            <MobileOrderBarSpacer />
            <MobileOrderBar />
          </>
        )}
        <Toaster position={isOrderFlow ? "top-center" : "bottom-right"} />
      </QueryClientProvider>
    </LangProvider>
  );
}
