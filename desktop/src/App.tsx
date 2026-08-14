// HashRouter, not BrowserRouter: Tauri serves the frontend from a local
// asset protocol with no server-side history-fallback rewrite (unlike
// app/vercel.json's catch-all rewrite for the web app) — a deep sub-path
// under BrowserRouter 404s on refresh. HashRouter keeps everything on one
// physical asset path (index.html#/finance/overview), which needs none of
// that.
import type { ReactNode } from "react";
import { HashRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PeriodProvider } from "@/lib/dateRange";
import { ToastProvider } from "@/context/ToastContext";
import { AppRouter } from "@/router";

function AppBoot({ children }: { children: ReactNode }) {
  const { booting } = useAuth();
  if (booting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="material-symbols-outlined animate-spin text-[32px] text-on-surface-variant">
          progress_activity
        </span>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <PeriodProvider>
            <AppBoot>
              <AppRouter />
            </AppBoot>
          </PeriodProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
