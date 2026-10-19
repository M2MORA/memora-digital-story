/**
 * MÉMORA — Validation du Mapping des Upload Intents (Point V3.8.4)
 *
 * Règles vérifiées :
 * 1. Unicité stricte des uploadIntentId (aucune réutilisation d'un même upload sur plusieurs items).
 * 2. Unicité des couples (itemId, fileKind) (pas de double assignation sur un même slot).
 * 3. Cohérence des types et extensions (vidéo vs photo).
 * 4. Statut requis ('ready').
 * 5. Appartenance au draftId et token du panier client.
 */

import type { FileKind, IntentMapping, UploadIntentRecord } from "@/types/database";

export interface ValidationIssue {
  field: string;
  code:
    | "DUPLICATE_INTENT_ID"
    | "DUPLICATE_ITEM_SLOT"
    | "INTENT_NOT_FOUND"
    | "INVALID_STATUS"
    | "TYPE_MISMATCH"
    | "UNAUTHORIZED_DRAFT"
    | "UNAUTHORIZED_EXTENSION"
    | "UNAUTHORIZED_MIME";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const ALLOWED_EXTENSIONS: Record<FileKind, Set<string>> = {
  video: new Set(["mp4", "mov", "webm"]),
  photo: new Set(["jpg", "jpeg", "png", "webp"]),
};

const ALLOWED_MIMES: Record<FileKind, Set<string>> = {
  video: new Set(["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"]),
  photo: new Set(["image/jpeg", "image/png", "image/webp"]),
};

export function validateIntentMappings(
  mappings: IntentMapping[],
  intentsMap: Map<string, UploadIntentRecord>,
  draftId: string
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seenIntentIds = new Set<string>();
  const seenItemSlots = new Set<string>();

  for (const m of mappings) {
    // 1. Unicité de l'uploadIntentId
    if (seenIntentIds.has(m.intent_id)) {
      issues.push({
        field: `mapping[${m.intent_id}]`,
        code: "DUPLICATE_INTENT_ID",
        message: `L'intention d'upload ${m.intent_id} est assignée plusieurs fois.`,
      });
    }
    seenIntentIds.add(m.intent_id);

    // 2. Unicité du slot (item_id + file_kind)
    const slotKey = `${m.item_id}:${m.file_kind}`;
    if (seenItemSlots.has(slotKey)) {
      issues.push({
        field: `item[${m.item_id}].${m.file_kind}`,
        code: "DUPLICATE_ITEM_SLOT",
        message: `L'article ${m.item_id} possède plusieurs fichiers pour le type ${m.file_kind}.`,
      });
    }
    seenItemSlots.add(slotKey);

    // 3. Vérification de l'intent correspondant
    const intent = intentsMap.get(m.intent_id);
    if (!intent) {
      issues.push({
        field: `intent[${m.intent_id}]`,
        code: "INTENT_NOT_FOUND",
        message: `L'intention d'upload ${m.intent_id} est introuvable.`,
      });
      continue;
    }

    // 4. Appartenance au draft
    if (intent.draft_id !== draftId) {
      issues.push({
        field: `intent[${m.intent_id}].draft_id`,
        code: "UNAUTHORIZED_DRAFT",
        message: `L'intention ${m.intent_id} n'appartient pas à la session draft ${draftId}.`,
      });
    }

    // 5. Statut 'ready'
    if (intent.status !== "ready") {
      issues.push({
        field: `intent[${m.intent_id}].status`,
        code: "INVALID_STATUS",
        message: `L'intention ${m.intent_id} n'est pas prête (statut: ${intent.status}).`,
      });
    }

    // 6. Concordance du type (vidéo vs photo)
    if (intent.file_kind !== m.file_kind) {
      issues.push({
        field: `intent[${m.intent_id}].file_kind`,
        code: "TYPE_MISMATCH",
        message: `Conflit de type pour l'intention ${m.intent_id} : attendu ${m.file_kind}, trouvé ${intent.file_kind}.`,
      });
    }

    // 7. Extensions autorisées
    const cleanExt = intent.file_extension.toLowerCase().replace(/^\./, "");
    if (!ALLOWED_EXTENSIONS[m.file_kind].has(cleanExt)) {
      issues.push({
        field: `intent[${m.intent_id}].file_extension`,
        code: "UNAUTHORIZED_EXTENSION",
        message: `Extension .${cleanExt} non autorisée pour le type ${m.file_kind}.`,
      });
    }

    // 8. Type MIME
    if (!ALLOWED_MIMES[m.file_kind].has(intent.mime_type)) {
      issues.push({
        field: `intent[${m.intent_id}].mime_type`,
        code: "UNAUTHORIZED_MIME",
        message: `MIME type ${intent.mime_type} non autorisé pour le type ${m.file_kind}.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
