import type { CSSProperties } from "react";

export type RevealKind = "rise" | "print" | "line";

/**
 * Attributs d'apparition au défilement (styles dans styles.css, observateur
 * dans __root.tsx). `delay` en ms pour une cascade ; `toss` = inclinaison de
 * départ d'une photo (« print »).
 */
export function reveal(kind: RevealKind = "rise", delay = 0, toss?: number) {
  const style: Record<string, string> = {};
  if (delay) style["--d"] = `${delay}ms`;
  if (toss !== undefined) style["--toss"] = `${toss}deg`;
  return { "data-reveal": kind, style: style as CSSProperties };
}

/** Délai d'une cascade, plafonné pour ne jamais faire attendre */
export const stagger = (i: number, step = 90, max = 360) => Math.min(i * step, max);
