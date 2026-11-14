/* MÉMORA Admin — service worker : reçoit les notifications push
   (nouvelle commande, client WhatsApp en attente). */

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
  // renotify : un nouveau message de la même conversation fait de nouveau sonner.
  event.waitUntil(
    self.registration.showNotification(data.title || "MÉMORA", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/apple-touch-icon.png",
      badge: "/favicon-32x32.png",
      data: { orderId: data.orderId || null, conversationId: data.conversationId || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const scope = self.registration.scope;
  let path = "/";
  let message = null;
  if (info.orderId) {
    path = "/?order=" + encodeURIComponent(info.orderId);
    message = { type: "open-order", orderId: info.orderId };
  } else if (info.conversationId) {
    path = "/?conversation=" + encodeURIComponent(info.conversationId);
    message = { type: "open-conversation", conversationId: info.conversationId };
  }
  const target = new URL(path, scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (client.url.startsWith(scope)) {
          await client.focus();
          if (message) client.postMessage(message);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
