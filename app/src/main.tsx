import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";

import ErrorBoundary from "./components/ErrorBoundary"; // eager — the crash net must never be a lazy chunk
import { router } from "./router";

// ── Keep this file free of component declarations ────────────────────────────
// The route table (and every `const X = lazy(...)` in it) lives in ./router.tsx
// on purpose: a module that declares PascalCase components becomes a React Fast
// Refresh boundary, and a boundary is RE-EXECUTED in place on an HMR update.
// Re-executing an entry point means calling createRoot() again on a container
// that already has a live root — two roots fighting over the same DOM, which
// showed up as a random "Something went wrong" crash screen (or two pages
// painted on top of each other) several times an hour in dev. See router.tsx.

// DM-13: sw.js posts { type: "navigate", url } to an already-open dashboard
// window instead of opening a duplicate one when a notification's target tab
// differs from the current one. Wired at the router level (not inside
// ProviderLayout/AdminLayout) so one listener covers both dashboards and
// survives whichever tab happens to be mounted when the message arrives.
function onServiceWorkerMessage(event: MessageEvent) {
  if (event.data?.type === "navigate" && typeof event.data.url === "string") {
    const path = event.data.url.startsWith("http")
      ? new URL(event.data.url).pathname + new URL(event.data.url).search
      : event.data.url;
    void router.navigate(path);
  }
}
navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
// Belt and braces: if this module is ever re-executed by HMR anyway, drop the
// old listener rather than stacking a second one that navigates in parallel.
import.meta.hot?.dispose(() => {
  navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
});

// ErrorBoundary sits ABOVE RouterProvider on purpose. The router's errorElement
// only catches throws from inside a route; anything that fails above it — the
// router itself, a top-level provider — would otherwise render a blank page.
const container = document.getElementById("root")!;
// Reuse the root across any re-execution of this module (see the note above) —
// createRoot() on an already-rooted container is what produced the crash.
const store = window as Window & { __alAssemaRoot?: ReactDOM.Root };
const root = (store.__alAssemaRoot ??= ReactDOM.createRoot(container));

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
);
