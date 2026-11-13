/* MÉMORA Admin — service worker : reçoit les notifications push (nouvelle commande). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  // Chaque push doit afficher une notification (obligatoire sur iPhone et Chrome).
  event.waitUntil(
    self.registration.showNotification(data.title || "MÉMORA", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/apple-touch-icon.png",
      badge: "/favicon-32x32.png",
      data: { orderId: data.orderId || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const orderId = event.notification.data && event.notification.data.orderId;
  const scope = self.registration.scope;
  const target = new URL(orderId ? "/?order=" + encodeURIComponent(orderId) : "/", scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (client.url.startsWith(scope)) {
          await client.focus();
          if (orderId) client.postMessage({ type: "open-order", orderId });
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
