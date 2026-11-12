/**
 * Contrôle d'accès des routes admin appelées avec le client Supabase service role :
 * le service role contourne le RLS, donc le jeton de l'appelant doit être validé ici.
 * Seul app_metadata fait foi, user_metadata étant modifiable par l'utilisateur.
 */

type SupabaseAuthLike = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { app_metadata?: Record<string, unknown> } | null };
      error: unknown;
    }>;
  };
};

export type AdminCheck<S> =
  { ok: true; supabase: S } | { ok: false; status: number; error: string };

export async function requireAdmin<S extends SupabaseAuthLike>(
  request: Request,
  getSupabase: () => S | null,
  logPrefix = "[admin]",
): Promise<AdminCheck<S>> {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return { ok: false, status: 401, error: "Authentification requise" };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, status: 500, error: "Supabase service role non configuré" };

  let caller: { app_metadata?: Record<string, unknown> } | null | undefined;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) return { ok: false, status: 401, error: "Session invalide ou expirée" };
    caller = data?.user;
  } catch (err) {
    console.error(`${logPrefix} Échec de vérification de la session:`, err);
    return { ok: false, status: 503, error: "Vérification de la session indisponible" };
  }
  if (!caller) return { ok: false, status: 401, error: "Session invalide ou expirée" };
  if (caller.app_metadata?.["role"] !== "admin")
    return { ok: false, status: 403, error: "Accès administrateur requis" };

  return { ok: true, supabase };
}
