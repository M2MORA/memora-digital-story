import { describe, expect, it, vi } from "vitest";
import { UploadHeartbeatManager } from "@/lib/upload-heartbeat";

describe("UploadHeartbeatManager (V3.8.1)", () => {
  it("executes beatOnce and respects flight", async () => {
    let callCount = 0;
    const sendHeartbeat = vi.fn().mockImplementation(async (_id, _token, signal: AbortSignal) => {
      callCount++;
      expect(signal.aborted).toBe(false);
      return true;
    });

    const manager = new UploadHeartbeatManager({
      intentId: "test-intent-1",
      draftToken: "test-token-1",
      intervalMs: 50,
      sendHeartbeat,
    });

    const result = await manager.beatOnce();
    expect(result).toBe(true);
    expect(callCount).toBe(1);
  });

  it("prevents overlapping concurrent flights (single-flight lock)", async () => {
    let finishFlight: () => void;
    const sendHeartbeat = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishFlight = () => resolve(true);
        })
    );

    const manager = new UploadHeartbeatManager({
      intentId: "test-intent-2",
      draftToken: "test-token-2",
      sendHeartbeat,
    });

    // Démarre le vol 1
    const p1 = manager.beatOnce();
    expect(manager.inFlight).toBe(true);

    // Démarre le vol 2 pendant que vol 1 est actif
    const p2 = manager.beatOnce();
    expect(await p2).toBe(false); // Refusé car vol en cours

    // Résoudre le vol 1
    finishFlight!();
    expect(await p1).toBe(true);
    expect(manager.inFlight).toBe(false);
  });

  it("stops and awaits active in-flight request cleanly", async () => {
    let abortedAtReceive = false;
    let flightEnded = false;

    const sendHeartbeat = vi.fn().mockImplementation(
      (_id, _token, signal: AbortSignal) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener("abort", () => {
            abortedAtReceive = true;
            setTimeout(() => {
              flightEnded = true;
              resolve(false);
            }, 20);
          });
        })
    );

    const manager = new UploadHeartbeatManager({
      intentId: "test-intent-3",
      draftToken: "test-token-3",
      sendHeartbeat,
    });

    // Lancement vol
    const flight = manager.beatOnce();
    expect(manager.inFlight).toBe(true);

    // Arrêt demandé : doit déclencher l'abort ET attendre la résolution du vol
    await manager.stop();

    expect(abortedAtReceive).toBe(true);
    expect(flightEnded).toBe(true);
    expect(manager.inFlight).toBe(false);
    expect(manager.running).toBe(false);

    await flight;
  });

  it("handles consecutive failures and triggers onExpired after maxRetries", async () => {
    let expiredTriggered = false;
    const sendHeartbeat = vi.fn().mockResolvedValue(false);

    const manager = new UploadHeartbeatManager({
      intentId: "test-intent-4",
      draftToken: "test-token-4",
      maxRetries: 2,
      sendHeartbeat,
      onExpired: () => {
        expiredTriggered = true;
      },
    });

    await manager.beatOnce(); // fail 1
    expect(expiredTriggered).toBe(false);

    await manager.beatOnce(); // fail 2 -> reaches maxRetries
    expect(expiredTriggered).toBe(true);
    expect(manager.running).toBe(false);
  });
});
