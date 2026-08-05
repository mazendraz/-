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

  // DM-13: this used to require `client.url.includes(target)` — a full-URL
  // match. A provider sitting on /provider/overview failed that test when the
  // notification targeted /provider/messages, so the SW opened a SECOND window
  // instead of focusing the one already open. In an installed PWA a duplicate
  // window is especially disorienting.
  //
  // Match on the dashboard ROOT instead (/provider or /admin), then hand the
  // full path to the focused client via postMessage so it can route there
  // in place. ProviderLayout/AdminLayout listen for this.
  const targetPath = (() => {
    try {
      return new URL(target, self.location.origin).pathname;
    } catch {
      return typeof target === "string" ? target : "/";
    }
  })();
  const root = "/" + targetPath.split("/").filter(Boolean)[0];

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          let clientPath = "";
          try {
            clientPath = new URL(client.url).pathname;
          } catch {
            clientPath = "";
          }
          if (root !== "/" && clientPath.startsWith(root) && "focus" in client) {
            // Tell the app where to go BEFORE focusing, so the route change and
            // the window coming forward land together.
            if ("postMessage" in client) {
              client.postMessage({ type: "navigate", url: target });
            }
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
