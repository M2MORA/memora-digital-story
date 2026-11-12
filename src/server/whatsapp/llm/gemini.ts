import { GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import {
  normalizeHistory,
  type LlmProvider,
  type LlmSession,
  type LlmTurn,
  type ToolDefinition,
} from "./types";

/**
 * Modèles Gemini Flash essayés dans l'ordre : le plus récent d'abord, puis des modèles
 * plus anciens mais plus disponibles. L'alias « gemini-flash-latest » n'existe pas sur
 * l'API v1 utilisée par le SDK (404), d'où une liste explicite.
 */
export const DEFAULT_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];
export const DEFAULT_GEMINI_MODEL = DEFAULT_GEMINI_MODELS[0]!;

/** Un modèle surchargé (503), épuisé (429) ou retiré (404) est mis de côté quelques minutes. */
export const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const SKIP_TO_NEXT_MODEL = new Set([404, 429, 500, 503]);
/** Au-delà, on abandonne ce modèle pour le suivant (un client WhatsApp n'attend pas une minute). */
export const MODEL_TIMEOUT_MS = 20_000;

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

// Mémoire du processus (partagée entre les messages) : modèle → instant jusqu'auquel l'éviter.
const cooldownUntil = new Map<string, number>();
export function resetGeminiCooldowns(): void {
  cooldownUntil.clear();
}

type GenerateContent = GoogleGenAI["models"]["generateContent"];

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** Liste des modèles : BALLECH_MODEL (s'il est donné) d'abord, puis la liste par défaut. */
export function geminiModelChain(model?: string): string[] {
  const chain = model ? [model, ...DEFAULT_GEMINI_MODELS] : [...DEFAULT_GEMINI_MODELS];
  return [...new Set(chain)];
}

export function createGeminiProvider(options: {
  apiKey: string;
  model?: string | undefined;
  /** Injection pour les tests (client mocké). */
  generateContent?: GenerateContent;
  now?: () => number;
}): LlmProvider {
  const chain = geminiModelChain(options.model);
  const now = options.now ?? Date.now;
  const generateContent: GenerateContent =
    options.generateContent ??
    (() => {
      const ai = new GoogleGenAI({ apiKey: options.apiKey });
      return (params) => ai.models.generateContent(params);
    })();

  return {
    name: "gemini",
    model: chain[0]!,
    createSession({ system, history, tools }) {
      const contents: Content[] = normalizeHistory(history).map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.text }],
      }));
      const functionDeclarations = tools.map((tool: ToolDefinition) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parameters,
      }));
      // Une fois un modèle choisi, la session le garde : les signatures de pensée
      // renvoyées au tour suivant ne sont valables que pour ce modèle.
      let sessionModel: string | null = null;

      const call = (model: string) =>
        generateContent({
          model,
          contents,
          config: {
            systemInstruction: system,
            tools: [{ functionDeclarations }],
            temperature: 0.3,
            maxOutputTokens: 1024,
            // Réponse WhatsApp : courte réflexion, réponse en quelques secondes.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
          },
        });

      const session: LlmSession = {
        async send(): Promise<LlmTurn> {
          let response: Awaited<ReturnType<GenerateContent>> | undefined;
          if (sessionModel) {
            response = await call(sessionModel);
          } else {
            const available = chain.filter((m) => (cooldownUntil.get(m) ?? 0) <= now());
            const candidates = available.length ? available : chain;
            let lastError: unknown;
            for (const model of candidates) {
              try {
                response = await call(model);
                sessionModel = model;
                break;
              } catch (error) {
                lastError = error;
                const status = statusOf(error);
                const skip =
                  isTimeout(error) || (status !== undefined && SKIP_TO_NEXT_MODEL.has(status));
                if (!skip) throw error;
                cooldownUntil.set(model, now() + MODEL_COOLDOWN_MS);
              }
            }
            if (!response) throw lastError;
          }

          // Le contenu du modèle est renvoyé tel quel au tour suivant (signatures de pensée).
          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) contents.push({ role: "model", parts: modelContent.parts ?? [] });

          const toolCalls = (response.functionCalls ?? []).map((call, index) => ({
            id: call.id || `${call.name ?? "tool"}-${index}`,
            name: call.name ?? "",
            args: (call.args ?? {}) as Record<string, unknown>,
          }));
          const text = (modelContent?.parts ?? [])
            .filter((part) => typeof part.text === "string" && !part.thought)
            .map((part) => part.text)
            .join("")
            .trim();
          return { text, toolCalls };
        },
        addToolResults(results) {
          contents.push({
            role: "user",
            parts: results.map((r) => ({
              functionResponse: { id: r.id, name: r.name, response: r.result },
            })),
          });
        },
      };
      return session;
    },
  };
}
