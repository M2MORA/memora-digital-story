import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { publicSiteUrl } from "./useAdminData";

/**
 * unsupported   : ce navigateur ne sait pas faire de notifications push
 * needs-install : iPhone/iPad dans Safari : il faut d'abord ajouter l'admin à l'écran d'accueil
 * denied        : l'utilisateur a refusé (à réactiver dans les réglages du navigateur)
 */
export type PushState = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Session expirée, reconnecte-toi.");
  let res: Response;
  try {
    res = await fetch(`${publicSiteUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  } catch {
    throw new Error("Serveur injoignable.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error || `Erreur serveur (code ${res.status}).`);
  return body as T;
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function detectSupport(): PushState | null {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  return null;
}

export function usePush() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const unsupported = detectSupport();
    if (unsupported) return setState(unsupported);
    if (Notification.permission === "denied") return setState("denied");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** À appeler depuis un clic : la permission ne peut pas être demandée autrement (iPhone). */
  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = await callApi<{ publicKey: string }>("/api/admin/push/config");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey),
      });
      try {
        await callApi("/api/admin/push/subscribe", {
          method: "POST",
          body: JSON.stringify({ ...subscription.toJSON(), user_agent: navigator.userAgent }),
        });
      } catch (err) {
        // Appareil non enregistré côté serveur : on annule pour ne pas afficher « activé » à tort.
        await subscription.unsubscribe().catch(() => undefined);
        throw err;
      }
      setState("on");
      setMessage("Notifications activées sur cet appareil.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await callApi("/api/admin/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage("Notifications désactivées sur cet appareil.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Notification de test envoyée par le serveur, comme pour une vraie commande. */
  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await callApi<{ sent: number; removed: number; failed: number }>("/api/admin/push/test", {
        method: "POST",
      });
      setMessage(
        result.sent > 0
          ? "Test envoyé : la notification doit arriver dans quelques secondes."
          : "Le service de notifications a refusé l'envoi. Désactive puis réactive les notifications.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, message, enable, disable, test };
}
