/**
 * MÉMORA — Client R2 Upload Pipeline
 *
 * Orchestre le cycle d'upload direct vers Cloudflare R2 :
 * 1. Création de l'intention d'upload auprès du backend (POST /api/upload/intent)
 * 2. Upload direct du binaire vers Cloudflare R2 via l'URL présignée PUT SigV4
 * 3. Vérification de l'intégrité auprès du backend (POST /api/upload/verify)
 */

export interface CreateIntentRequest {
  draft_id: string;
  draft_token: string;
  item_id: string;
  file_kind: "video" | "photo";
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  file_extension: string;
}

export interface CreateIntentResponse {
  success: boolean;
  intent_id: string;
  upload_url: string;
  required_headers: Record<string, string>;
  expires_at: string;
}

export interface VerifyIntentResponse {
  success: boolean;
  intent_id: string;
  status: string;
  verified_size?: number;
  error?: string;
}

/**
 * Appelle le backend pour créer l'intention d'upload et obtenir l'URL présignée PUT.
 */
export async function requestUploadIntent(
  req: CreateIntentRequest
): Promise<CreateIntentResponse> {
  const response = await fetch("/api/upload/intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody?.error || `Échec création intention d'upload (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = (await response.json()) as CreateIntentResponse;
  if (!data?.success || !data?.intent_id || !data?.upload_url) {
    throw new Error("Réponse d'intention d'upload invalide reçue du serveur");
  }

  return data;
}

/**
 * Téléverse le fichier directement vers Cloudflare R2 avec l'URL présignée.
 * Le fichier ne transite jamais par le backend applicatif.
 */
export async function uploadBinaryToR2(
  uploadUrl: string,
  requiredHeaders: Record<string, string>,
  file: File
): Promise<void> {
  // Respecter strictement les headers exigés (notamment Content-Type exact)
  // Ne JAMAIS ajouter d'en-tête Authorization ou de secrets
  const headers: Record<string, string> = { ...requiredHeaders };

  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Échec du transfert vers Cloudflare R2 (HTTP ${response.status})`);
    }
  } catch (err: any) {
    // Si l'upload direct échoue (ex: CORS browser "Failed to fetch"), basculer de manière transparente vers le proxy local
    const isNetworkOrCors =
      err?.name === "TypeError" ||
      (typeof err?.message === "string" && (
        err.message.includes("fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("CORS")
      ));

    if (isNetworkOrCors) {
      console.warn("[R2 Upload] Upload direct bloqué par CORS, bascule automatique vers le proxy applicatif...");
      const proxyHeaders: Record<string, string> = {
        ...headers,
        "x-upload-url": uploadUrl,
      };

      const proxyResponse = await fetch("/api/upload/proxy-put", {
        method: "PUT",
        headers: proxyHeaders,
        body: file,
      });

      if (!proxyResponse.ok) {
        const errText = await proxyResponse.text().catch(() => "");
        throw new Error(`Échec du transfert via proxy R2 (HTTP ${proxyResponse.status}): ${errText || "Erreur"}`);
      }

      return;
    }

    throw err;
  }
}

/**
 * Demande au backend de vérifier l'existence et la taille de l'objet sur Cloudflare R2.
 */
export async function verifyUploadedIntent(
  intentId: string,
  draftToken: string
): Promise<VerifyIntentResponse> {
  const response = await fetch("/api/upload/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent_id: intentId,
      draft_token: draftToken,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody?.error || `Échec vérification upload (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = (await response.json()) as VerifyIntentResponse;
  if (!data?.success || data?.status !== "ready") {
    throw new Error(data?.error || "L'objet sur R2 n'est pas encore prêt ou vérifié");
  }

  return data;
}

/**
 * Exécute le pipeline complet pour un fichier donné :
 * Intent -> Direct R2 PUT -> Verify
 */
export async function uploadMediaWithR2Intent(params: {
  draftId: string;
  draftToken: string;
  itemId: string;
  fileKind: "photo" | "video";
  file: File;
}): Promise<string> {
  const { draftId, draftToken, itemId, fileKind, file } = params;

  const extension = file.name.split(".").pop()?.toLowerCase() || (fileKind === "video" ? "mp4" : "jpg");
  const mimeType = file.type || (fileKind === "video" ? "video/mp4" : "image/jpeg");

  // 1. Obtenir l'intention et l'URL présignée
  const intent = await requestUploadIntent({
    draft_id: draftId,
    draft_token: draftToken,
    item_id: itemId,
    file_kind: fileKind,
    file_name: file.name,
    mime_type: mimeType,
    file_size_bytes: file.size,
    file_extension: extension,
  });

  // 2. Upload binaire direct vers R2
  await uploadBinaryToR2(intent.upload_url, intent.required_headers, file);

  // 3. Vérification backend HEAD sur R2
  await verifyUploadedIntent(intent.intent_id, draftToken);

  return intent.intent_id;
}
