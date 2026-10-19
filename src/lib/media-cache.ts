/**
 * MÉMORA — Client Media Cache (IndexedDB)
 *
 * Persiste les objets File réels dans IndexedDB pour survivre aux rechargements de page.
 * Évite le stockage de blob: URLs éphémères dans localStorage.
 */

export interface CachedMedia {
  key: string;
  file: File;
  updatedAt: number;
}

const DB_NAME = "memora_media_cache";
const STORE_NAME = "media_store";
const DB_VERSION = 1;

// Fallback en mémoire si IndexedDB est indisponible (SSR, Node, ou environnement restreint)
const memoryStore = new Map<string, CachedMedia>();

function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error("IndexedDB non disponible"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erreur d'ouverture d'IndexedDB"));
  });
}

/**
 * Génère une clé stable pour le cache média basée sur draftId + itemId + fileKind.
 */
export function getMediaCacheKey(
  draftId: string,
  itemId: string,
  fileKind: "photo" | "video"
): string {
  return `${draftId.trim()}:${itemId.trim()}:${fileKind.trim()}`;
}

/**
 * Enregistre un objet File dans IndexedDB (ou fallback mémoire).
 */
export async function putCachedMedia(key: string, file: File): Promise<void> {
  if (!key || typeof key !== "string" || !key.trim()) {
    throw new Error("Clé de cache média invalide");
  }
  if (!file || !(file instanceof File)) {
    throw new Error("Objet File invalide pour le cache média");
  }

  const record: CachedMedia = {
    key: key.trim(),
    file,
    updatedAt: Date.now(),
  };

  if (!isIndexedDBAvailable()) {
    memoryStore.set(record.key, record);
    return;
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Erreur écriture IndexedDB"));
      tx.onabort = () => reject(tx.error || new Error("Transaction IndexedDB interrompue"));
    });
  } catch (err) {
    // Graceful fallback to memory on storage quota or open failure
    memoryStore.set(record.key, record);
  }
}

/**
 * Récupère un fichier File depuis IndexedDB (ou fallback mémoire).
 * Retourne null si le fichier n'est pas trouvé.
 */
export async function getCachedMedia(key: string): Promise<File | null> {
  if (!key || typeof key !== "string" || !key.trim()) {
    return null;
  }
  const cleanKey = key.trim();

  if (!isIndexedDBAvailable()) {
    const entry = memoryStore.get(cleanKey);
    return entry ? entry.file : null;
  }

  try {
    const db = await openDB();
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cleanKey);

      req.onsuccess = () => {
        const result = req.result as CachedMedia | undefined;
        if (result && result.file instanceof File) {
          resolve(result.file);
        } else {
          // Si introuvable dans IndexedDB, vérifier s'il est dans memoryStore
          const mem = memoryStore.get(cleanKey);
          resolve(mem ? mem.file : null);
        }
      };
      req.onerror = () => reject(req.error || new Error("Erreur lecture IndexedDB"));
    });
  } catch {
    const entry = memoryStore.get(cleanKey);
    return entry ? entry.file : null;
  }
}

/**
 * Supprime un fichier spécifique du cache média.
 */
export async function deleteCachedMedia(key: string): Promise<void> {
  if (!key || typeof key !== "string" || !key.trim()) return;
  const cleanKey = key.trim();

  memoryStore.delete(cleanKey);

  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(cleanKey);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Erreur suppression IndexedDB"));
    });
  } catch {
    // Silence error on best-effort delete
  }
}

/**
 * Supprime tous les fichiers associés à un panier/draft donné.
 */
export async function clearDraftMedia(draftId: string): Promise<void> {
  if (!draftId || typeof draftId !== "string" || !draftId.trim()) return;
  const prefix = `${draftId.trim()}:`;

  // Supprimer de la mémoire
  for (const k of Array.from(memoryStore.keys())) {
    if (k.startsWith(prefix)) {
      memoryStore.delete(k);
    }
  }

  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const key = String(cursor.key);
          if (key.startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error || new Error("Erreur parcours curseur IndexedDB"));
    });
  } catch {
    // Silence error on best-effort draft clear
  }
}

/**
 * Utilitaire de test pour vider le store en mémoire.
 */
export function _resetMemoryStore(): void {
  memoryStore.clear();
}
