/**
 * Interface commune aux fournisseurs LLM de Ballech (Gemini par défaut, Anthropic en option).
 * L'agent ne connaît que ces types : changer de fournisseur ne touche pas à sa logique.
 */

/** Un tour de conversation déjà nettoyé (texte seul, médias remplacés par un marqueur). */
export type ChatTurn = { role: "user" | "assistant"; text: string };

/** Définition neutre d'un outil : un seul JSON Schema, traduit par chaque fournisseur. */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type ToolResult = { id: string; name: string; result: Record<string, unknown> };

/** Réponse d'un tour du modèle : du texte pour le client, et/ou des appels d'outils. */
export type LlmTurn = { text: string; toolCalls: ToolCall[] };

/**
 * Une session = un traitement de message. Elle garde l'historique au format natif du
 * fournisseur (ex. signatures de pensée Gemini) le temps de la boucle d'outils.
 */
export interface LlmSession {
  send(): Promise<LlmTurn>;
  addToolResults(results: ToolResult[]): void;
}

export interface LlmProvider {
  readonly name: "gemini" | "anthropic";
  readonly model: string;
  createSession(input: {
    system: string;
    history: ChatTurn[];
    tools: ToolDefinition[];
  }): LlmSession;
}

/** Erreur de quota / limite de débit (HTTP 429), quel que soit le fournisseur. */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  return status === 429;
}

/**
 * Les deux API exigent un premier tour « user » et préfèrent des rôles alternés :
 * on fusionne les tours consécutifs du même auteur.
 */
export function normalizeHistory(history: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const turn of history) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n${text}`;
    else merged.push({ role: turn.role, text });
  }
  while (merged[0] && merged[0].role !== "user") merged.shift();
  return merged;
}
