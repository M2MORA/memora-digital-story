/** Lecture d'une variable d'environnement : binding Cloudflare (env) puis process.env (Vercel/Node). */
export function readEnv(env: unknown, name: string): string {
  const fromBinding = (env as Record<string, unknown> | null | undefined)?.[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  if (typeof process !== "undefined") {
    const fromProcess = process.env?.[name];
    if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  }
  return "";
}

export type WhatsAppConfig = {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
};

export function whatsappConfig(env: unknown): WhatsAppConfig {
  return {
    verifyToken: readEnv(env, "WHATSAPP_VERIFY_TOKEN"),
    appSecret: readEnv(env, "WHATSAPP_APP_SECRET"),
    accessToken: readEnv(env, "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: readEnv(env, "WHATSAPP_PHONE_NUMBER_ID"),
    graphVersion: readEnv(env, "WHATSAPP_GRAPH_VERSION") || "v23.0",
  };
}
