import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { fr, type Dict } from "./fr";
import { en } from "./en";
import { ar } from "./ar";

export type Lang = "fr" | "en" | "ar";
export type { Dict };

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "fr", label: "Français", short: "FR" },
  { code: "en", label: "English", short: "EN" },
  { code: "ar", label: "العربية", short: "عربي" },
];

const DICTS: Record<Lang, Dict> = { fr, en, ar };
const COOKIE = "memora_lang";

/** Pages pas encore traduites : elles restent en français, de gauche à droite */
const FRENCH_ONLY = ["/editeasy", "/create"];

export function parseLang(value: string | null | undefined): Lang {
  return value === "en" || value === "ar" ? value : "fr";
}

export const dirOf = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

export function effectiveLang(lang: Lang, pathname: string): Lang {
  return FRENCH_ONLY.some((p) => pathname.startsWith(p)) ? "fr" : lang;
}

/** Première visite : la langue du téléphone (arabe ou anglais), sinon le français */
function fromAcceptLanguage(header: string | undefined): Lang {
  const first = header?.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return first === "ar" || first === "en" ? first : "fr";
}

/**
 * Langue choisie, lue dans un cookie : le serveur rend directement la bonne
 * langue (et le bon sens de lecture), sans clignotement au chargement.
 * Sans cookie, le serveur part de la langue du téléphone et l'enregistre,
 * pour que le navigateur retrouve la même langue ensuite.
 */
export const readLang = createIsomorphicFn()
  .server(() => {
    const saved = getCookie(COOKIE);
    if (saved) return parseLang(saved);
    const lang = fromAcceptLanguage(getRequestHeader("accept-language"));
    setCookie(COOKIE, lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
    return lang;
  })
  .client(() => parseLang(document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))?.[1]));

const LangContext = createContext<Lang>("fr");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => DICTS[useContext(LangContext)];
export const dictFor = (lang: Lang) => DICTS[lang];

/** Change de langue : enregistre le choix pour un an et recharge les données de la page */
export function useSetLang() {
  const router = useRouter();
  return (lang: Lang) => {
    document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    void router.invalidate();
  };
}

/** Pour les balises <title> : la langue est dans les données de la route racine */
export function dictFromMatches(matches: readonly { loaderData?: unknown }[]): Dict {
  const data = matches[0]?.loaderData as { lang?: Lang } | undefined;
  return DICTS[data?.lang ?? "fr"];
}
