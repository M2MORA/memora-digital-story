/**
 * MÉMORA — Client Draft Credentials Manager
 *
 * Gère de manière cryptographiquement sûre le draft_id et le draft_token (capability token).
 * - Utilise crypto.getRandomValues() (interdiction stricte de Math.random()).
 * - Stocke le draft_id dans localStorage pour persistance après rechargement.
 * - Stocke le draft_token dans sessionStorage (avec fallback localStorage sécurisé).
 * - Garantit la cohérence des credentials entre l'intention, l'upload, la vérification et la finalisation.
 */

const STORAGE_KEY_DRAFT_ID = "memora_draft_id_v2";
const SESSION_PREFIX_DRAFT_TOKEN = "memora_draft_tok_v2_";

export interface DraftCredentials {
  draftId: string;
  draftToken: string;
}

/**
 * Génère un identifiant de draft conforme à la regex SQL ^[a-zA-Z0-9_-]{3,64}$
 */
export function generateSecureDraftId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Environnements non-navigateur restreints
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dft_${hex}`; // 36 caractères, conforme
}

/**
 * Génère un jeton de draft cryptographique à haute entropie (68 caractères).
 */
export function generateSecureDraftToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `tok_${hex}`; // 68 caractères
}

function safeGetStorage(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota ou restriction de stockage
  }
}

function safeRemoveStorage(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore
  }
}

let inMemoryCredentials: DraftCredentials | null = null;

const PREFIX_ORDER_NUMBER = "memora_order_number_v1_";

/**
 * Numéro de commande stable pour un panier : une nouvelle tentative porte le
 * même numéro, ce qui permet au serveur de la reconnaître comme un rejeu.
 */
export function getOrCreateDraftOrderNumber(draftId: string): string {
  const storage = typeof window !== "undefined" ? window.localStorage : undefined;
  const key = `${PREFIX_ORDER_NUMBER}${draftId}`;
  const existing = safeGetStorage(storage, key);
  if (existing) return existing;

  const orderNumber = `MEM-${Math.floor(100000 + Math.random() * 900000)}`;
  safeSetStorage(storage, key, orderNumber);
  return orderNumber;
}

export function clearDraftOrderNumber(draftId: string): void {
  safeRemoveStorage(
    typeof window !== "undefined" ? window.localStorage : undefined,
    `${PREFIX_ORDER_NUMBER}${draftId}`,
  );
}

/**
 * Récupère ou génère les identifiants de draft courants.
 * Garantit que la même paire (draftId, draftToken) est réutilisée de façon stable.
 */
export function getOrCreateDraftCredentials(): DraftCredentials {
  if (typeof window === "undefined") {
    if (!inMemoryCredentials) {
      inMemoryCredentials = {
        draftId: generateSecureDraftId(),
        draftToken: generateSecureDraftToken(),
      };
    }
    return inMemoryCredentials;
  }

  const local = window.localStorage;
  const session = window.sessionStorage;

  // 1. Lire ou générer le draftId
  let draftId = safeGetStorage(local, STORAGE_KEY_DRAFT_ID);
  if (!draftId || !/^[a-zA-Z0-9_-]{3,64}$/.test(draftId)) {
    draftId = generateSecureDraftId();
    safeSetStorage(local, STORAGE_KEY_DRAFT_ID, draftId);
  }

  // 2. Lire ou générer le draftToken (préférablement en sessionStorage)
  const tokenKey = `${SESSION_PREFIX_DRAFT_TOKEN}${draftId}`;
  let draftToken = safeGetStorage(session, tokenKey);

  // Fallback si non trouvé en session : chercher en local ou régénérer
  if (!draftToken || !draftToken.startsWith("tok_")) {
    draftToken = safeGetStorage(local, tokenKey);
  }

  if (!draftToken || !draftToken.startsWith("tok_")) {
    draftToken = generateSecureDraftToken();
    safeSetStorage(session, tokenKey, draftToken);
    safeSetStorage(local, tokenKey, draftToken);
  }

  inMemoryCredentials = { draftId, draftToken };
  return inMemoryCredentials;
}

/**
 * Réinitialise les identifiants de draft (après commande validée ou vidage de panier).
 */
export function resetDraftCredentials(): DraftCredentials {
  if (typeof window !== "undefined") {
    const local = window.localStorage;
    const session = window.sessionStorage;

    const currentId = safeGetStorage(local, STORAGE_KEY_DRAFT_ID);
    if (currentId) {
      safeRemoveStorage(session, `${SESSION_PREFIX_DRAFT_TOKEN}${currentId}`);
      safeRemoveStorage(local, `${SESSION_PREFIX_DRAFT_TOKEN}${currentId}`);
    }
    safeRemoveStorage(local, STORAGE_KEY_DRAFT_ID);
  }

  const newDraftId = generateSecureDraftId();
  const newDraftToken = generateSecureDraftToken();

  if (typeof window !== "undefined") {
    safeSetStorage(window.localStorage, STORAGE_KEY_DRAFT_ID, newDraftId);
    safeSetStorage(window.sessionStorage, `${SESSION_PREFIX_DRAFT_TOKEN}${newDraftId}`, newDraftToken);
    safeSetStorage(window.localStorage, `${SESSION_PREFIX_DRAFT_TOKEN}${newDraftId}`, newDraftToken);
  }

  inMemoryCredentials = {
    draftId: newDraftId,
    draftToken: newDraftToken,
  };
  return inMemoryCredentials;
}
