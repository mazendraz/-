import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import RootLayout from "./RootLayout";
import Home from "./pages/Home"; // eager — the landing page / LCP, must paint instantly
import ErrorPage from "./pages/ErrorPage"; // eager — needed to render route errors
import ErrorBoundary from "./components/ErrorBoundary"; // eager — the crash net must never be a lazy chunk
import RequireAuth from "./components/AuthGate";
import { LocaleProvider } from "./context/LocaleContext";
import { ToastProvider } from "./context/ToastContext";

// Everything else is code-split so the initial load only ships Home + chrome.
// Each route's JS is fetched on first navigation (and cached thereafter).
const Services = lazy(() => import("./pages/Services"));
const ServiceCategory = lazy(() => import("./pages/ServiceCategory"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const RequestForm = lazy(() => import("./pages/RequestForm"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const Messages = lazy(() => import("./pages/Messages"));
const GuidedStart = lazy(() => import("./pages/GuidedStart"));
const Saved = lazy(() => import("./pages/Saved"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminIndexRedirect = lazy(() => import("./pages/admin/AdminLayout").then((m) => ({ default: m.AdminIndexRedirect })));
// NAV-06: the admin dashboard's 10 tabs used to all ship in one chunk with
// every editor — each is now its own lazy route, fetched only on first visit.
const AdminOverviewPage = lazy(() => import("./pages/admin/tabs/OverviewPage"));
const AdminLeadsPage = lazy(() => import("./pages/admin/tabs/LeadsPage"));
const AdminCompaniesPage = lazy(() => import("./pages/admin/tabs/CompaniesPage"));
const AdminServicesPage = lazy(() => import("./pages/admin/tabs/ServicesPage"));
const AdminTeamPage = lazy(() => import("./pages/admin/tabs/TeamPage"));
const AdminReviewsPage = lazy(() => import("./pages/admin/ReviewsTab").then((m) => ({ default: m.AdminReviewsTab })));
const AdminChangesPage = lazy(() => import("./pages/admin/ChangeRequestsTab").then((m) => ({ default: m.ChangeRequestsTab })));
const AdminChatPage = lazy(() => import("./pages/admin/ChatTab").then((m) => ({ default: m.ChatTab })));
const AdminStatusPage = lazy(() => import("./pages/admin/SiteStatusTab").then((m) => ({ default: m.SiteStatusTab })));
const AdminSettingsPage = lazy(() => import("./pages/admin/tabs/SettingsPage"));
const ProviderLayout = lazy(() => import("./pages/provider/ProviderLayout"));
const ProviderIndexRedirect = lazy(() => import("./pages/provider/ProviderLayout").then((m) => ({ default: m.ProviderIndexRedirect })));
// DM-02/DM-12: the provider dashboard used to be one 1,000-line component
// holding all ten tab bodies, statically importing the charting library, the
// offerings editor, the profile editor and the chat client — a provider opening
// their dashboard on 3G downloaded all of it before seeing a lead count. Each
// tab is now its own route and its own chunk, like admin's.
const ProviderOverviewPage = lazy(() => import("./pages/provider/tabs/OverviewPage"));
const ProviderLeadsPage = lazy(() => import("./pages/provider/tabs/LeadsPage"));
const ProviderMessagesPage = lazy(() => import("./pages/provider/tabs/MessagesPage"));
const ProviderProjectsPage = lazy(() => import("./pages/provider/tabs/ProjectsPage"));
const ProviderReviewsPage = lazy(() => import("./pages/provider/tabs/ReviewsPage"));
const ProviderAnalyticsPage = lazy(() => import("./pages/provider/tabs/AnalyticsPage"));
const ProviderAvailabilityPage = lazy(() => import("./pages/provider/tabs/AvailabilityPage"));
const ProviderPricingPage = lazy(() => import("./pages/provider/tabs/PricingPage"));
const ProviderProfilePage = lazy(() => import("./pages/provider/tabs/ProfilePage"));
const ProviderSettingsPage = lazy(() => import("./pages/provider/tabs/SettingsPage"));

function DashboardFallback() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/services", element: <Services /> },
      { path: "/services/:category", element: <ServiceCategory /> },
      { path: "/companies", element: <Companies /> },
      { path: "/companies/:slug", element: <CompanyProfile /> },
      { path: "/start", element: <GuidedStart /> },
      { path: "/saved", element: <Saved /> },
      { path: "/requests", element: <MyRequests /> },
      { path: "/messages", element: <Messages /> },
      { path: "/request", element: <RequestForm /> },
      { path: "/about", element: <About /> },
      { path: "/contact", element: <Contact /> },
      { path: "/terms", element: <LegalPage kind="terms" /> },
      { path: "/privacy", element: <LegalPage kind="privacy" /> },
      // Catch-all 404 — keeps the shared chrome so users can navigate out
      { path: "*", element: <NotFound /> },
    ],
  },
  // Internal dashboards — lazy-loaded, no public nav/footer chrome.
  //
  // Each carries its OWN LocaleProvider: these routes are siblings of
  // RootLayout, not children, so they never see the provider mounted there.
  // Until phase 7 the dashboards were hard-coded English and nobody noticed;
  // once they started calling t() they got the context DEFAULT ("ar") and were
  // stuck in Arabic no matter what the language toggle said.
  {
    path: "/admin",
    errorElement: <ErrorPage />,
    element: (
      <LocaleProvider>
        <ToastProvider>
          <RequireAuth role="ADMIN">
            <Suspense fallback={<DashboardFallback />}><AdminLayout /></Suspense>
          </RequireAuth>
        </ToastProvider>
      </LocaleProvider>
    ),
    // Real nested routes (NAV-06), not `?tab=` state read once on load:
    // the browser's Back button now moves between tabs instead of leaving
    // the dashboard, `/admin/leads` opens straight to that tab, and a
    // refresh doesn't snap back to Overview mid-task.
    children: [
      { index: true, element: <AdminIndexRedirect /> },
      { path: "overview", element: <AdminOverviewPage /> },
      { path: "leads", element: <AdminLeadsPage /> },
      { path: "companies", element: <AdminCompaniesPage /> },
      { path: "services", element: <AdminServicesPage /> },
      { path: "team", element: <AdminTeamPage /> },
      { path: "reviews", element: <AdminReviewsPage /> },
      { path: "changes", element: <AdminChangesPage /> },
      { path: "chat", element: <AdminChatPage /> },
      { path: "status", element: <AdminStatusPage /> },
      { path: "settings", element: <AdminSettingsPage /> },
    ],
  },
  {
    path: "/provider",
    errorElement: <ErrorPage />,
    element: (
      <LocaleProvider>
        <ToastProvider>
          <RequireAuth role="PROVIDER">
            <Suspense fallback={<DashboardFallback />}><ProviderLayout /></Suspense>
          </RequireAuth>
        </ToastProvider>
      </LocaleProvider>
    ),
    // DM-02: real nested routes, not `?tab=` state read once on mount. Back
    // now moves between tabs instead of leaving the dashboard — the thing that
    // mattered most on a phone, where Back is the primary navigation control
    // and an installed PWA has no URL bar to fall back on.
    //
    // The index route keeps `?tab=` working: the server still builds
    // `/provider?tab=messages` into chat push-notification payloads.
    children: [
      { index: true, element: <ProviderIndexRedirect /> },
      { path: "overview", element: <ProviderOverviewPage /> },
      { path: "leads", element: <ProviderLeadsPage /> },
      { path: "messages", element: <ProviderMessagesPage /> },
      { path: "projects", element: <ProviderProjectsPage /> },
      { path: "reviews", element: <ProviderReviewsPage /> },
      { path: "analytics", element: <ProviderAnalyticsPage /> },
      { path: "availability", element: <ProviderAvailabilityPage /> },
      { path: "pricing", element: <ProviderPricingPage /> },
      { path: "profile", element: <ProviderProfilePage /> },
      { path: "settings", element: <ProviderSettingsPage /> },
    ],
  },
]);

// DM-13: sw.js posts { type: "navigate", url } to an already-open dashboard
// window instead of opening a duplicate one when a notification's target tab
// differs from the current one. Wired at the router level (not inside
// ProviderLayout/AdminLayout) so one listener covers both dashboards and
// survives whichever tab happens to be mounted when the message arrives.
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "navigate" && typeof event.data.url === "string") {
    const path = event.data.url.startsWith("http")
      ? new URL(event.data.url).pathname + new URL(event.data.url).search
      : event.data.url;
    void router.navigate(path);
  }
});

// ErrorBoundary sits ABOVE RouterProvider on purpose. The router's errorElement
// only catches throws from inside a route; anything that fails above it — the
// router itself, a top-level provider — would otherwise render a blank page.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
);
