import { supabase } from "./supabase";

// Le site public : adresse écrite sur les puces NFC, et serveur appelé par l'admin
// (médias, suppression). Toujours en https://www.memora.tn : memora.tn redirige vers www,
// et le navigateur bloque une suppression redirigée.
export const publicSiteUrl = String(import.meta.env["VITE_PUBLIC_SITE_URL"] ?? "https://www.memora.tn").replace(/\/+$/, "");

type ApiErrors = { unreachable: string; refused: (status: number) => string };

const DEFAULT_ERRORS: ApiErrors = {
  unreachable: "Serveur injoignable.",
  refused: (status) => `Erreur serveur (code ${status}).`,
};

/**
 * Appel authentifié au serveur du site. Le jeton vient de la session admin,
 * sauf s'il est fourni (tests). L'erreur renvoyée par le serveur est relayée telle quelle.
 */
export async function callApi<T>(
  path: string,
  init: RequestInit = {},
  options: { accessToken?: string; apiBase?: string; fetchImpl?: typeof fetch; errors?: ApiErrors } = {},
): Promise<T> {
  const errors = options.errors ?? DEFAULT_ERRORS;
  let token = options.accessToken;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Session expirée, reconnecte-toi.");
    token = data.session.access_token;
  }
  const doFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${options.apiBase ?? publicSiteUrl}${path}`, {
      ...init,
      headers: {
        ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error(errors.unreachable);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error || errors.refused(res.status));
  return data as T;
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
  await callApi(`/api/admin/orders?id=${encodeURIComponent(params.orderId)}`, { method: "DELETE" }, {
    accessToken: params.accessToken,
    apiBase: params.apiBase,
    fetchImpl: params.fetchImpl,
    errors: {
      unreachable: "Serveur injoignable. Rien n'a été supprimé.",
      refused: (status) => `Le serveur a refusé la suppression (code ${status}). Rien n'a été supprimé.`,
    },
  });
}
