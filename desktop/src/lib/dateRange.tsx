// Shared "period" selector for the TopNav's Today / This Week / This Month /
// Custom tabs (see the executive_overview mockup). The desktop Overview
// endpoint (GET /admin/desktop/overview) takes a trailing `days` window, not
// an arbitrary calendar range (see desktopOverview.service.ts's
// DesktopOverviewQuery) — so "Custom" here means "last N days", not a date
// picker. If a true from/to calendar range is wanted later, that's a small,
// deliberate backend addition (parseDesktopOverviewQuery would need
// from/to alongside days), not something to fake client-side.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type PeriodTab = "today" | "week" | "month" | "custom";

interface PeriodState {
  tab: PeriodTab;
  /** Trailing window in days — 1 / 7 / 30 for the fixed tabs, user-entered for custom. */
  days: number;
  customDays: number;
  setTab: (tab: PeriodTab) => void;
  setCustomDays: (days: number) => void;
  label: string;
}

const PeriodContext = createContext<PeriodState | null>(null);

const FIXED_DAYS: Record<Exclude<PeriodTab, "custom">, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export function usePeriod(): PeriodState {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod() used outside <PeriodProvider>");
  return ctx;
}

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<PeriodTab>("today");
  const [customDays, setCustomDays] = useState(90);

  const days = tab === "custom" ? Math.min(365, Math.max(1, customDays)) : FIXED_DAYS[tab];
  const label =
    tab === "today"
      ? "Today"
      : tab === "week"
        ? "This Week"
        : tab === "month"
          ? "This Month"
          : `Last ${days} days`;

  const value = useMemo(
    () => ({ tab, days, customDays, setTab, setCustomDays, label }),
    [tab, days, customDays, label],
  );

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}
