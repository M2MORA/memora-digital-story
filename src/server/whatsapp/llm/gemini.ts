import { GoogleGenAI, type Content } from "@google/genai";
import {
  normalizeHistory,
  type LlmProvider,
  type LlmSession,
  type LlmTurn,
  type ToolDefinition,
} from "./types";

/** Alias Google qui pointe toujours vers le dernier modèle Gemini Flash. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

type GenerateContent = GoogleGenAI["models"]["generateContent"];

export function createGeminiProvider(options: {
  apiKey: string;
  model?: string | undefined;
  /** Injection pour les tests (client mocké). */
  generateContent?: GenerateContent;
}): LlmProvider {
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const generateContent: GenerateContent =
    options.generateContent ??
    (() => {
      const ai = new GoogleGenAI({ apiKey: options.apiKey });
      return (params) => ai.models.generateContent(params);
    })();

  return {
    name: "gemini",
    model,
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

      const session: LlmSession = {
        async send(): Promise<LlmTurn> {
          const response = await generateContent({
            model,
            contents,
            config: {
              systemInstruction: system,
              tools: [{ functionDeclarations }],
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          });

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
