import { readEnv } from "../env";
import { isRateLimitError, type LlmProvider } from "./types";

export * from "./types";

/**
 * Fournisseur choisi par BALLECH_PROVIDER (gemini par défaut).
 * BALLECH_MODEL remplace le modèle par défaut du fournisseur.
 * Les SDK sont chargés à la demande : ils ne pèsent pas sur les autres routes du site.
 */
export async function providerFromEnv(env: unknown): Promise<LlmProvider> {
  const provider = (readEnv(env, "BALLECH_PROVIDER") || "gemini").toLowerCase();
  const model = readEnv(env, "BALLECH_MODEL") || undefined;

  if (provider === "anthropic") {
    const apiKey = readEnv(env, "ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquante (BALLECH_PROVIDER=anthropic)");
    const { createAnthropicProvider } = await import("./anthropic");
    return createAnthropicProvider({ apiKey, model });
  }
  if (provider !== "gemini") throw new Error(`BALLECH_PROVIDER inconnu : ${provider}`);

  const apiKey = readEnv(env, "GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante");
  const { createGeminiProvider } = await import("./gemini");
  return createGeminiProvider({ apiKey, model });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Appel avec la politique du free tier : sur 429, un seul nouvel essai après un délai,
 * puis l'erreur remonte (l'agent envoie alors le message de secours + passage à l'humain).
 */
export async function withRateLimitRetry<T>(
  call: () => Promise<T>,
  options: { backoffMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    await (options.wait ?? sleep)(options.backoffMs ?? 2000);
    return await call();
  }
}
