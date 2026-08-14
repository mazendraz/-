import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { NAV } from "@/lib/navConfig";
import { LoginPage } from "@/pages/LoginPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { RequestsPage } from "@/pages/operations/RequestsPage";
import { ActiveWorkPage } from "@/pages/operations/ActiveWorkPage";
import { PendingActionsPage } from "@/pages/operations/PendingActionsPage";
import { PriceVerificationPage } from "@/pages/operations/PriceVerificationPage";
import { PriceDiscrepanciesPage } from "@/pages/operations/PriceDiscrepanciesPage";
import { ClientsPage } from "@/pages/business/ClientsPage";
import { ProvidersPage } from "@/pages/business/ProvidersPage";
import { PricingIntelligencePage } from "@/pages/analytics/PricingIntelligencePage";
import { BusinessPerformancePage } from "@/pages/analytics/BusinessPerformancePage";
import { ClientAnalyticsPage } from "@/pages/analytics/ClientAnalyticsPage";
import { ProviderAnalyticsPage } from "@/pages/analytics/ProviderAnalyticsPage";
import { FinanceOverviewPage } from "@/pages/finance/FinanceOverviewPage";
import { IncomePage } from "@/pages/finance/IncomePage";
import { ExpensesPage } from "@/pages/finance/ExpensesPage";
import { TransactionsPage } from "@/pages/finance/TransactionsPage";
import { OutstandingPage } from "@/pages/finance/OutstandingPage";
import { CashFlowPage } from "@/pages/finance/CashFlowPage";

// Real screens built so far, keyed by nav path — everything else still falls
// back to PlaceholderPage until its stage. Swapped in one at a time rather
// than a big-bang switch, so each stage's diff stays reviewable.
const LEAF_PAGES: Record<string, ReactNode> = {
  "/operations/requests": <RequestsPage />,
  "/operations/active-work": <ActiveWorkPage />,
  "/operations/pending-actions": <PendingActionsPage />,
  "/operations/price-verification": <PriceVerificationPage />,
  "/operations/price-discrepancies": <PriceDiscrepanciesPage />,
  "/business/clients": <ClientsPage />,
  "/business/providers": <ProvidersPage />,
  "/analytics/pricing-intelligence": <PricingIntelligencePage />,
  "/analytics/business-performance": <BusinessPerformancePage />,
  "/analytics/clients": <ClientAnalyticsPage />,
  "/analytics/providers": <ProviderAnalyticsPage />,
  "/finance/overview": <FinanceOverviewPage />,
  "/finance/income": <IncomePage />,
  "/finance/expenses": <ExpensesPage />,
  "/finance/transactions": <TransactionsPage />,
  "/finance/outstanding": <OutstandingPage />,
  "/finance/cash-flow": <CashFlowPage />,
};

// Bare (childless) top-level groups — Overview, Reports, Settings — each
// navigate straight to one screen instead of expanding a sub-list. Same
// swapped-in-one-at-a-time convention as LEAF_PAGES above.
const BARE_PAGES: Record<string, ReactNode> = {
  "/overview": <OverviewPage />,
  "/reports": <ReportsPage />,
  "/settings": <SettingsPage />,
};

// Every NAV entry (top-level leaf or sub-item) becomes one protected route,
// gated by its group's permission — including sub-items, so typing a
// /finance/transactions URL directly is checked exactly like clicking the
// nav link (see lib/auth.tsx ProtectedRoute's comment on why this matters).
function moduleRoutes() {
  const routes: { path: string; permission: (typeof NAV)[number]["permission"]; element: ReactNode }[] = [];
  for (const group of NAV) {
    if (group.path) {
      routes.push({
        path: group.path,
        permission: group.permission,
        element: BARE_PAGES[group.path] ?? <PlaceholderPage title={group.label} />,
      });
    }
    for (const leaf of group.children ?? []) {
      routes.push({
        path: leaf.path,
        permission: group.permission,
        element: LEAF_PAGES[leaf.path] ?? <PlaceholderPage title={leaf.label} />,
      });
    }
  }
  return routes;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/overview" replace />} />
      {moduleRoutes().map((r) => (
        <Route
          key={r.path}
          path={r.path}
          element={
            <ProtectedRoute permission={r.permission}>
              <AppShell>{r.element}</AppShell>
            </ProtectedRoute>
          }
        />
      ))}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <AppShell>
              <PlaceholderPage title="Page not found" />
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
