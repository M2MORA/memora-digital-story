/**
 * MÉMORA — Envois de médias en arrière-plan
 *
 * Les fichiers partent vers Cloudflare R2 pendant que le client continue son
 * parcours, pour que « Confirmer ma commande » n'ait plus qu'à enregistrer la
 * commande. Un fichier n'est considéré prêt qu'après vérification serveur,
 * assurée par uploadMediaWithR2Intent.
 */
import { useSyncExternalStore } from "react";
import { uploadMediaWithR2Intent } from "./r2-upload-client";

export type UploadKind = "photo" | "video";

export type BackgroundUploadStatus = "queued" | "uploading" | "ready" | "error";

export interface BackgroundUpload {
  draftId: string;
  itemId: string;
  kind: UploadKind;
  fingerprint: string;
  status: BackgroundUploadStatus;
  loaded: number;
  total: number;
  intentId?: string;
  error?: string;
}

export interface BackgroundUploadInput {
  draftId: string;
  draftToken: string;
  itemId: string;
  kind: UploadKind;
  file: File;
}

interface Task {
  state: BackgroundUpload;
  controller: AbortController;
  promise: Promise<string>;
  readyUntil: number;
}

interface PersistedUpload {
  fingerprint: string;
  intentId: string;
  readyUntil: number;
}

const STORAGE_KEY = "memora_background_uploads_v1";
const MAX_CONCURRENT_UPLOADS = 2;
const RETRY_DELAYS_MS = [1000, 3000];

/**
 * Le serveur conserve un fichier prêt 24 h. Une marge évite de présenter un
 * fichier sur le point d'expirer ; la finalisation reste l'autorité finale.
 */
const READY_LIFETIME_MS = 20 * 60 * 60 * 1000;

const EMPTY: BackgroundUpload[] = [];

const tasks = new Map<string, Task>();
const listeners = new Set<() => void>();
const waiters: Array<() => void> = [];
let activeUploads = 0;
let snapshot: BackgroundUpload[] = EMPTY;

function taskKey(draftId: string, itemId: string, kind: UploadKind): string {
  return `${draftId}:${itemId}:${kind}`;
}

function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function emit(): void {
  snapshot = Array.from(tasks.values(), (task) => task.state);
  listeners.forEach((listener) => listener());
}

function readPersisted(): Record<string, PersistedUpload> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PersistedUpload>) : {};
  } catch {
    return {};
  }
}

function writePersisted(entries: Record<string, PersistedUpload>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Stockage indisponible : le fichier sera simplement renvoyé après rechargement
  }
}

function acquireSlot(): Promise<void> {
  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    activeUploads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    next();
  } else {
    activeUploads--;
  }
}

function createAbortError(): Error {
  const error = new Error("Envoi annulé");
  error.name = "AbortError";
  return error;
}

function waitBeforeRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    function onAbort() {
      clearTimeout(timer);
      reject(createAbortError());
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function updateTask(key: string, task: Task, patch: Partial<BackgroundUpload>): void {
  if (tasks.get(key) !== task) return;
  task.state = { ...task.state, ...patch };
  emit();
}

async function transfer(key: string, task: Task, input: BackgroundUploadInput): Promise<string> {
  const { signal } = task.controller;
  await acquireSlot();

  try {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw createAbortError();
      updateTask(key, task, { status: "uploading", loaded: 0 });

      try {
        let lastPercent = -1;
        return await uploadMediaWithR2Intent({
          draftId: input.draftId,
          draftToken: input.draftToken,
          itemId: input.itemId,
          fileKind: input.kind,
          file: input.file,
          signal,
          onProgress: (loaded, total) => {
            const percent = total > 0 ? Math.floor((loaded / total) * 100) : 0;
            if (percent === lastPercent) return;
            lastPercent = percent;
            updateTask(key, task, { loaded });
          },
        });
      } catch (err) {
        const retryDelay = RETRY_DELAYS_MS[attempt];
        if (signal.aborted || retryDelay === undefined) throw err;
        await waitBeforeRetry(retryDelay, signal);
      }
    }
  } finally {
    releaseSlot();
  }
}

/**
 * Lance l'envoi d'un média, ou rejoint celui déjà en cours pour le même fichier.
 * Un fichier différent pour le même article remplace et annule le précédent.
 */
export function startBackgroundUpload(input: BackgroundUploadInput): Promise<string> {
  const key = taskKey(input.draftId, input.itemId, input.kind);
  const fingerprint = fileFingerprint(input.file);
  const existing = tasks.get(key);

  if (
    existing &&
    existing.state.fingerprint === fingerprint &&
    existing.state.status !== "error" &&
    (existing.state.status !== "ready" || existing.readyUntil > Date.now())
  ) {
    return existing.promise;
  }

  existing?.controller.abort();

  const baseState = {
    draftId: input.draftId,
    itemId: input.itemId,
    kind: input.kind,
    fingerprint,
    total: input.file.size,
  };

  const persisted = readPersisted()[key];
  if (persisted && persisted.fingerprint === fingerprint && persisted.readyUntil > Date.now()) {
    const task: Task = {
      state: {
        ...baseState,
        status: "ready",
        loaded: input.file.size,
        intentId: persisted.intentId,
      },
      controller: new AbortController(),
      promise: Promise.resolve(persisted.intentId),
      readyUntil: persisted.readyUntil,
    };
    tasks.set(key, task);
    emit();
    return task.promise;
  }

  const task: Task = {
    state: { ...baseState, status: "queued", loaded: 0 },
    controller: new AbortController(),
    promise: Promise.resolve(""),
    readyUntil: 0,
  };
  tasks.set(key, task);

  task.promise = transfer(key, task, input).then(
    (intentId) => {
      if (tasks.get(key) === task) {
        task.readyUntil = Date.now() + READY_LIFETIME_MS;
        updateTask(key, task, { status: "ready", loaded: input.file.size, intentId });
        writePersisted({
          ...readPersisted(),
          [key]: { fingerprint, intentId, readyUntil: task.readyUntil },
        });
      }
      return intentId;
    },
    (err: unknown) => {
      updateTask(key, task, {
        status: "error",
        error: err instanceof Error ? err.message : "Échec de l'envoi du fichier",
      });
      throw err;
    },
  );

  // L'échec reste visible dans l'état et est renvoyé à qui attend cette promesse
  task.promise.catch(() => {});

  emit();
  return task.promise;
}

function removeEntries(
  shouldRemove: (upload: Pick<BackgroundUpload, "draftId" | "itemId" | "kind">) => boolean,
): void {
  for (const [key, task] of tasks) {
    if (shouldRemove(task.state)) {
      task.controller.abort();
      tasks.delete(key);
    }
  }

  const persisted = readPersisted();
  let changed = false;
  for (const key of Object.keys(persisted)) {
    const [draftId = "", itemId = "", kind = ""] = key.split(":");
    if (shouldRemove({ draftId, itemId, kind: kind as UploadKind })) {
      delete persisted[key];
      changed = true;
    }
  }
  if (changed) writePersisted(persisted);

  emit();
}

/** Arrête et oublie l'envoi d'un article (un seul média si `kind` est précisé). */
export function cancelBackgroundUpload(draftId: string, itemId: string, kind?: UploadKind): void {
  removeEntries(
    (upload) =>
      upload.draftId === draftId && upload.itemId === itemId && (!kind || upload.kind === kind),
  );
}

/** Oublie tous les envois d'un panier (commande validée ou fichiers expirés). */
export function forgetDraftUploads(draftId: string): void {
  removeEntries((upload) => upload.draftId === draftId);
}

export function useBackgroundUploads(): BackgroundUpload[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY,
  );
}

/** Réservé aux tests. */
export function _resetBackgroundUploads(): void {
  tasks.forEach((task) => task.controller.abort());
  tasks.clear();
  waiters.length = 0;
  activeUploads = 0;
  snapshot = EMPTY;
}
