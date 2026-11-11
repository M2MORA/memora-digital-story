import { LANGS, useLang, useSetLang, useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** Choix de la langue : FR, EN, ع. Le libellé complet est lu par les lecteurs d'écran. */
export function LangSwitch({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  const lang = useLang();
  const setLang = useSetLang();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t.lang.label}
      className={cn("flex items-center gap-0.5", className)}
    >
      {LANGS.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-label={l.label}
            aria-pressed={active}
            onClick={() => !active && setLang(l.code)}
            className={cn(
              "flex h-11 min-w-10 items-center justify-center rounded-full px-2 text-[14px] font-semibold transition-colors",
              tone === "dark"
                ? active
                  ? "bg-m-blush text-m-wine"
                  : "text-m-muted hover:text-m-ink"
                : active
                  ? "bg-m-linen/20 text-m-linen"
                  : "text-m-linen/75 hover:text-m-linen",
            )}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
