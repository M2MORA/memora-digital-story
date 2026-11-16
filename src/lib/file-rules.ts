export type UploadKind = "video" | "photo";

/**
 * Règles de fichiers partagées : page de commande (commander.tsx) et route
 * /api/upload/intent (src/server/upload-intents.ts). La fonction SQL create_upload_intent
 * (supabase/migrations/20261018220000_phase1_upload_intents_and_order_finalization.sql)
 * applique les mêmes limites : toute modification ici doit y être reportée.
 */
export const FILE_RULES = {
  video: {
    extensions: ["mp4", "mov", "webm"],
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"],
    /** Tout `video/*` est aussi accepté (SQL : `LIKE 'video/%'`). */
    mimePrefix: "video/",
    maxBytes: 5368709120, // 5 Go
    /** Envoyé par r2-upload-client quand le navigateur ne donne pas de type. */
    defaultMime: "video/mp4",
  },
  photo: {
    extensions: ["jpg", "jpeg", "png", "webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    mimePrefix: null,
    maxBytes: 26214400, // 25 Mo
    defaultMime: "image/jpeg",
  },
} as const satisfies Record<
  UploadKind,
  {
    extensions: readonly string[];
    mimeTypes: readonly string[];
    mimePrefix: string | null;
    maxBytes: number;
    defaultMime: string;
  }
>;

export type FileRuleError = "extension" | "mime" | "size" | "empty";

/** " .MP4" → "mp4", comme la route et la fonction SQL. */
export function normalizeExtension(ext: string): string {
  return ext.trim().toLowerCase().replace(/^\.+/, "");
}

/** Première règle enfreinte, ou null si le fichier est accepté. */
export function checkFile(
  kind: UploadKind,
  file: { extension: string; mimeType: string; sizeBytes: number },
): FileRuleError | null {
  const rules = FILE_RULES[kind];
  const mime = file.mimeType.trim().toLowerCase();
  if (!(rules.extensions as readonly string[]).includes(normalizeExtension(file.extension))) {
    return "extension";
  }
  if (
    !(rules.mimeTypes as readonly string[]).includes(mime) &&
    !(rules.mimePrefix && mime.startsWith(rules.mimePrefix))
  ) {
    return "mime";
  }
  if (file.sizeBytes > rules.maxBytes) return "size";
  if (file.sizeBytes <= 0) return "empty";
  return null;
}

/** Vérifie un File du navigateur avec l'extension et le type qu'enverra r2-upload-client. */
export function checkBrowserFile(kind: UploadKind, file: File): FileRuleError | null {
  return checkFile(kind, {
    extension: file.name.split(".").pop() ?? "",
    mimeType: file.type || FILE_RULES[kind].defaultMime,
    sizeBytes: file.size,
  });
}

/** Valeur de l'attribut `accept` d'un <input type="file">. */
export function acceptAttribute(kind: UploadKind): string {
  const rules = FILE_RULES[kind];
  // application/octet-stream laisserait choisir n'importe quel fichier dans le sélecteur
  const mimes = rules.mimeTypes.filter((m) => m !== "application/octet-stream");
  return [...rules.extensions.map((e) => `.${e}`), ...mimes].join(",");
}
