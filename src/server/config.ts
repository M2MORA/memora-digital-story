/**
 * Lecture unique de la configuration serveur : binding Cloudflare (env) puis process.env (Vercel/Node).
 * Une configuration manquante lève une erreur ; chaque route décide de la réponse (503, null…).
 */

export function readEnv(env: unknown, name: string): string {
  const fromBinding = (env as Record<string, unknown> | null | undefined)?.[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  if (typeof process !== "undefined") {
    const fromProcess = process.env?.[name];
    if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  }
  return "";
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

/** Pas de bucket par défaut : un R2_BUCKET_NAME absent est une erreur de configuration. */
export function readR2Config(env: unknown): R2Config {
  const config = {
    accountId: readEnv(env, "R2_ACCOUNT_ID"),
    accessKeyId: readEnv(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: readEnv(env, "R2_SECRET_ACCESS_KEY"),
    bucketName: readEnv(env, "R2_BUCKET_NAME"),
  };
  const missing: string[] = [];
  if (!config.accountId) missing.push("R2_ACCOUNT_ID");
  if (!config.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!config.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!config.bucketName) missing.push("R2_BUCKET_NAME");
  if (missing.length) {
    throw new Error(`Configuration Cloudflare R2 manquante (variables requises : ${missing.join(", ")})`);
  }
  return config;
}

export type SupabaseServerConfig = { url: string; serviceRoleKey: string };

/** SUPABASE_URL (variable serveur) l'emporte sur VITE_SUPABASE_URL (variable publique). */
export function readSupabaseConfig(env: unknown): SupabaseServerConfig {
  const url = readEnv(env, "SUPABASE_URL") || readEnv(env, "VITE_SUPABASE_URL");
  const serviceRoleKey = readEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Configuration Supabase serveur manquante (URL ou SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url, serviceRoleKey };
}
