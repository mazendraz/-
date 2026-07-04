/* Al Assema service worker — Web Push only (no offline caching).
 * Shows a notification for each push and focuses/opens the dashboard on click. */

self.addEventListener("install", () => {
  // Activate immediately so the first subscription works without a reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Al Assema", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Al Assema";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    // tag collapses repeat notifications for the same lead into one entry.
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing dashboard tab if one is open; else open a new one.
        for (const client of clients) {
          if (client.url.includes(target) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
        return undefined;
      }),
  );
});
