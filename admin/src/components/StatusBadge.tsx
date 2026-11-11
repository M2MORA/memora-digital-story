import { Lock } from "lucide-react";
import type { OrderStatus } from "../lib/supabase";
import { statusLabel } from "../lib/format";

/** Statut d'une commande : un point de couleur et un mot, jamais la couleur seule. */
export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge s-${status}`}>
      {status === "paid" ? <Lock size={12} strokeWidth={2.25} aria-hidden /> : <span className="dot" aria-hidden />}
      {statusLabel(status)}
    </span>
  );
}
