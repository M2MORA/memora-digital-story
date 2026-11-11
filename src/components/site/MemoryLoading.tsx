import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Écran d'attente de la page souvenir (/m/…) : la personne qui pose son
 * téléphone sur la photo voit tout de suite MÉMORA au lieu d'un écran vide,
 * même sur une connexion lente. Utilisé pendant le chargement de la page,
 * puis en surimpression tant que la vidéo n'est pas prête à jouer.
 */
export function MemoryLoading({ hidden = false }: { hidden?: boolean }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-hidden={hidden || undefined}
      className={cn(
        "fixed inset-0 z-20 flex flex-col items-center justify-center bg-m-night px-6 text-center text-m-linen transition-opacity duration-500",
        hidden ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <p className="keep-tracking font-serif text-[32px] font-semibold tracking-[0.18em]">MÉMORA</p>
      {/* Fine ligne qui respire pendant l'attente */}
      <span className="mt-5 block h-px w-24 overflow-hidden bg-m-linen/20">
        <span className="block h-full w-full origin-left animate-pulse bg-m-rose" />
      </span>
      <p className="mt-5 font-serif text-[20px] italic text-m-linen/80">{t.memory.arriving}</p>
    </div>
  );
}
