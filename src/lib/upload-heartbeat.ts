/**
 * MÉMORA — Gestionnaire de Heartbeat d'Upload (Point V3.8.1)
 *
 * Fonctionnalités :
 * - Arrêt propre avec attente du vol actif (in-flight request).
 * - Annulation véritable via AbortController compatible fetch et client Supabase.
 * - Garantie mono-vol (single-flight) : aucun heartbeat concurrent.
 * - Backoff exponentiel en cas de défaillance réseau temporaire.
 */

export interface HeartbeatOptions {
  intentId: string;
  draftToken: string;
  intervalMs?: number;
  maxRetries?: number;
  sendHeartbeat: (intentId: string, draftToken: string, signal: AbortSignal) => Promise<boolean>;
  onExpired?: () => void;
  onError?: (error: unknown) => void;
}

export class UploadHeartbeatManager {
  private intentId: string;
  private draftToken: string;
  private intervalMs: number;
  private maxRetries: number;
  private sendHeartbeat: (intentId: string, draftToken: string, signal: AbortSignal) => Promise<boolean>;
  private onExpired?: (() => void) | undefined;
  private onError?: ((error: unknown) => void) | undefined;

  private timerId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private activeFlightPromise: Promise<void> | null = null;
  private isRunning = false;
  private consecutiveFailures = 0;

  constructor(options: HeartbeatOptions) {
    this.intentId = options.intentId;
    this.draftToken = options.draftToken;
    this.intervalMs = options.intervalMs ?? 30000; // 30 secondes par défaut
    this.maxRetries = options.maxRetries ?? 5;
    this.sendHeartbeat = options.sendHeartbeat;
    this.onExpired = options.onExpired;
    this.onError = options.onError;
  }

  /**
   * Démarre la boucle de heartbeat
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.consecutiveFailures = 0;
    this.abortController = new AbortController();
    this.scheduleNext(this.intervalMs);
  }

  /**
   * Arrêt propre : annule la requête en cours et attend la terminaison effective du vol actif
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // 1. Annuler le timer en attente
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    // 2. Déclencher l'annulation du signal
    if (this.abortController) {
      this.abortController.abort();
    }

    // 3. Attendre la fin de la requête active si elle est en vol
    if (this.activeFlightPromise) {
      try {
        await this.activeFlightPromise;
      } catch {
        // Ignorer l'erreur d'annulation attendue
      } finally {
        this.activeFlightPromise = null;
      }
    }

    this.abortController = null;
  }

  /**
   * Exécute un battement de coeur unique avec garantie mono-vol
   */
  async beatOnce(): Promise<boolean> {
    if (this.activeFlightPromise) {
      // Déjà un vol en cours : ne pas déclencher en parallèle
      return false;
    }

    const controller = this.abortController ?? new AbortController();
    if (!this.abortController) this.abortController = controller;

    let flightResolve: () => void;
    this.activeFlightPromise = new Promise<void>((resolve) => {
      flightResolve = resolve;
    });

    try {
      if (controller.signal.aborted) {
        return false;
      }

      const success = await this.sendHeartbeat(this.intentId, this.draftToken, controller.signal);
      if (success) {
        this.consecutiveFailures = 0;
      } else {
        this.handleFailure();
      }
      return success;
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return false;
      }
      this.handleFailure(err);
      return false;
    } finally {
      flightResolve!();
      this.activeFlightPromise = null;
    }
  }

  private handleFailure(err?: unknown): void {
    this.consecutiveFailures++;
    this.onError?.(err ?? new Error(`Heartbeat échoué (échec ${this.consecutiveFailures}/${this.maxRetries})`));

    if (this.consecutiveFailures >= this.maxRetries) {
      this.isRunning = false;
      this.onExpired?.();
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;

    this.timerId = setTimeout(async () => {
      if (!this.isRunning) return;

      const ok = await this.beatOnce();
      if (!this.isRunning) return;

      // Backoff exponentiel en cas d'erreur
      let nextDelay = this.intervalMs;
      if (!ok && this.consecutiveFailures > 0) {
        nextDelay = Math.min(this.intervalMs * Math.pow(1.5, this.consecutiveFailures), 120000);
      }

      this.scheduleNext(nextDelay);
    }, delayMs);
  }

  get inFlight(): boolean {
    return this.activeFlightPromise !== null;
  }

  get running(): boolean {
    return this.isRunning;
  }
}
