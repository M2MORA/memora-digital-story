import Anthropic from "@anthropic-ai/sdk";
import {
  normalizeHistory,
  type LlmProvider,
  type LlmSession,
  type LlmTurn,
  type ToolDefinition,
} from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export function createAnthropicProvider(options: {
  apiKey: string;
  model?: string | undefined;
  /** Injection pour les tests (client mocké). */
  createMessage?: CreateMessage;
}): LlmProvider {
  const model = options.model || DEFAULT_ANTHROPIC_MODEL;
  const createMessage: CreateMessage =
    options.createMessage ??
    (() => {
      // Pas de retry automatique du SDK : la politique (1 retry sur 429) est gérée par l'agent.
      const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0, timeout: 30_000 });
      return (params) => client.messages.create(params);
    })();

  return {
    name: "anthropic",
    model,
    createSession({ system, history, tools }) {
      const messages: Anthropic.MessageParam[] = normalizeHistory(history).map((turn) => ({
        role: turn.role,
        content: turn.text,
      }));
      const anthropicTools: Anthropic.Tool[] = tools.map((tool: ToolDefinition) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));

      const session: LlmSession = {
        async send(): Promise<LlmTurn> {
          const response = await createMessage({
            model,
            max_tokens: 2048,
            // Prompt système stable (connaissances du site) mis en cache.
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools: anthropicTools,
            output_config: { effort: "low" },
            messages,
          });
          messages.push({ role: "assistant", content: response.content });

          const toolCalls = response.content
            .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
            .map((b) => ({
              id: b.id,
              name: b.name,
              args: (b.input ?? {}) as Record<string, unknown>,
            }));
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("")
            .trim();
          return { text, toolCalls };
        },
        addToolResults(results) {
          messages.push({
            role: "user",
            content: results.map((r) => ({
              type: "tool_result" as const,
              tool_use_id: r.id,
              content: JSON.stringify(r.result),
            })),
          });
        },
      };
      return session;
    },
  };
}
