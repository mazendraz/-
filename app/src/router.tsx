import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import RootLayout from "./RootLayout";
import Home from "./pages/Home"; // eager — the landing page / LCP, must paint instantly
import ErrorPage from "./pages/ErrorPage"; // eager — needed to render route errors
import RequireAuth from "./components/AuthGate";
import { LocaleProvider } from "./context/LocaleContext";
import { ToastProvider } from "./context/ToastContext";

// ── Why the route table lives HERE and not in main.tsx ───────────────────────
// Every `const X = lazy(...)` below is a PascalCase declaration, which
// react-refresh's Babel plugin registers as a component. That is what makes a
// module a Fast Refresh BOUNDARY — and a boundary is re-EXECUTED in place on an
// HMR update instead of triggering a page reload.
//
// While this table sat in main.tsx, that meant main.tsx got re-executed on
// almost every save: any edit to a module with mixed exports (i18n.ts,
// LocaleContext.tsx, ToastContext.tsx, RequestBar.tsx …) invalidates up the
// import chain and lands on the entry. Re-executing the entry ran
// `ReactDOM.createRoot()` a SECOND time over the same #root that already had a
// live React root on it. Two roots owning one container tear each other's DOM
// down — "Failed to execute 'removeChild' on 'Node'" — and the app dropped into
// the CrashScreen ("Something went wrong"), or painted both trees at once,
// until a manual refresh. Dev only, but it fired several times an hour.
//
// Split out, this module is the boundary, it fails validation (it exports
// `router`, not a component), the invalidation propagates to main.tsx, which
// accepts nothing — so Vite does a full page reload, which is the correct
// behaviour for an entry point.

// Everything else is code-split so the initial load only ships Home + chrome.
// Each route's JS is fetched on first navigation (and cached thereafter).
const Services = lazy(() => import("./pages/Services"));
const ServiceCategory = lazy(() => import("./pages/ServiceCategory"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const RequestForm = lazy(() => import("./pages/RequestForm"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const SignIn = lazy(() => import("./pages/SignIn"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
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
const ProviderCompleteServicePage = lazy(() => import("./pages/provider/completion/CompleteServicePage"));

function DashboardFallback() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

export const router = createBrowserRouter([
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
  // ── Customer sign-in ────────────────────────────────────────────────────────
  // A SIBLING of RootLayout, not a child, so it renders with no top nav, no
  // bottom nav and no footer. Those are navigation, and this page has exactly one
  // job — every other link on screen is an invitation to leave without doing it.
  // (It also removes the odd loop of a "Sign in" button in the nav OF the sign-in
  // page.) The card's own "back to site" link is the deliberate way out.
  //
  // Not behind RequireAuth: that guard is for the STAFF dashboards and resolves a
  // different session entirely.
  //
  // Carries its own LocaleProvider + ToastProvider for the same reason the
  // dashboards below do — siblings never see the providers mounted in RootLayout.
  {
    element: (
      <LocaleProvider>
        <ToastProvider>
          <Suspense fallback={<DashboardFallback />}><Outlet /></Suspense>
        </ToastProvider>
      </LocaleProvider>
    ),
    errorElement: <ErrorPage />,
    children: [
      { path: "/signin", element: <SignIn /> },
      // Target of the emailed confirmation link. The path is baked into links
      // already sent, so it must stay stable — see the URL built in api's
      // sendCustomerVerificationEmail.
      { path: "/verify-email", element: <VerifyEmail /> },
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
      { path: "leads/:id/complete", element: <ProviderCompleteServicePage /> },
    ],
  },
]);
