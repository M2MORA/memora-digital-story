/**
 * Règles métier de l'admin, sans dépendance au navigateur ni à Supabase,
 * pour pouvoir les tester (voir rules.test.ts).
 */

type StatOrder = { status: string; total: number | string };
type StatMemory = { view_count: number | null };

/**
 * « À faire » = toute commande qui n'est ni encaissée (Payée) ni annulée :
 * une commande livrée attend encore l'argent.
 * « Encaissé » = argent reçu (Payée). « À encaisser » = expédié ou livré, pas encore payé.
 * Les commandes en attente ne comptent pas comme chiffre : elles ne sont pas confirmées.
 */
export function computeStats(orders: StatOrder[], memories: StatMemory[]) {
  const sum = (list: StatOrder[]) => list.reduce((s, o) => s + Number(o.total || 0), 0);
  return {
    count: orders.length,
    todo: orders.filter((o) => o.status !== "paid" && o.status !== "cancelled").length,
    collected: sum(orders.filter((o) => o.status === "paid")),
    toCollect: sum(orders.filter((o) => o.status === "shipped" || o.status === "delivered")),
    views: memories.reduce((s, m) => s + (m.view_count ?? 0), 0),
  };
}

/** Adresse relative d'un média client : valable quel que soit l'appareil ou le serveur. */
export const mediaPath = (storageKey: string) => `/api/media?key=${encodeURIComponent(storageKey)}`;

/**
 * Média reçu sur WhatsApp et rattaché à un article (items[i].media, écrit par Ballech) :
 * clé R2 de la dernière photo ou vidéo reçue.
 */
export function whatsappMediaKey(item: Record<string, unknown>, kind: "photo" | "video"): string | undefined {
  const media = item["media"];
  if (!Array.isArray(media)) return undefined;
  const matches = media.filter(
    (m): m is { kind: string; storage_key: string } =>
      !!m && typeof m === "object" && (m as { kind?: unknown }).kind === kind &&
      typeof (m as { storage_key?: unknown }).storage_key === "string",
  );
  return matches[matches.length - 1]?.storage_key;
}

/** Plus de 24 h depuis le dernier message du client : WhatsApp refuse une réponse libre. */
export function whatsappWindowClosed(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return true;
  return now - new Date(lastInboundAt).getTime() > 24 * 60 * 60 * 1000;
}

/**
 * Un souvenir peut contenir une adresse complète enregistrée depuis un autre poste
 * (ex. une ancienne adresse de test, ou memora.tn/api/media?… sans https).
 * Pour l'affichage, on garde seulement la clé et on la sert depuis le serveur actuel.
 * Toute autre adresse (data:, stockage public Supabase…) est rendue telle quelle.
 */
export function displayMediaUrl(stored: string | null | undefined, apiBase: string): string | undefined {
  if (!stored) return undefined;
  if (stored.startsWith("data:") || stored.startsWith("blob:")) return stored;

  const withScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) || stored.startsWith("/") ? stored : `https://${stored}`;
  let url: URL;
  try {
    url = new URL(withScheme, "https://placeholder.invalid");
  } catch {
    return stored;
  }
  const key = url.searchParams.get("key");
  if (url.pathname !== "/api/media" || !key) return stored;
  return `${apiBase.replace(/\/+$/, "")}${mediaPath(key)}`;
}

/**
 * Suppression d'une commande par le serveur, seul autorisé à supprimer.
 * Aucun repli direct sur la base : sans politique DELETE, Supabase ne supprime rien
 * et ne renvoie pas d'erreur, ce qui faisait croire à une suppression réussie.
 */
export async function deleteOrderViaApi(params: {
  apiBase: string;
  accessToken: string;
  orderId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = params.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${params.apiBase}/api/admin/orders?id=${encodeURIComponent(params.orderId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
  } catch {
    throw new Error("Serveur injoignable. Rien n'a été supprimé.");
  }
  if (res.ok) return;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(data?.error || `Le serveur a refusé la suppression (code ${res.status}). Rien n'a été supprimé.`);
}
