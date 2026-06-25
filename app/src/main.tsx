import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import RootLayout from "./RootLayout";
import Home from "./pages/Home"; // eager — the landing page / LCP, must paint instantly
import ErrorPage from "./pages/ErrorPage"; // eager — needed to render route errors
import RequireAuth from "./components/AuthGate";

// Everything else is code-split so the initial load only ships Home + chrome.
// Each route's JS is fetched on first navigation (and cached thereafter).
const Services = lazy(() => import("./pages/Services"));
const ServiceCategory = lazy(() => import("./pages/ServiceCategory"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const RequestForm = lazy(() => import("./pages/RequestForm"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const GuidedStart = lazy(() => import("./pages/GuidedStart"));
const Saved = lazy(() => import("./pages/Saved"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"));

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
      { path: "/request", element: <RequestForm /> },
      // Catch-all 404 — keeps the shared chrome so users can navigate out
      { path: "*", element: <NotFound /> },
    ],
  },
  // Internal dashboards — lazy-loaded, no public nav/footer chrome
  {
    path: "/admin",
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth role="ADMIN">
        <Suspense fallback={<DashboardFallback />}><AdminDashboard /></Suspense>
      </RequireAuth>
    ),
  },
  {
    path: "/provider",
    errorElement: <ErrorPage />,
    element: (
      <RequireAuth role="PROVIDER">
        <Suspense fallback={<DashboardFallback />}><ProviderDashboard /></Suspense>
      </RequireAuth>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
