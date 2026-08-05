import { useOutletContext } from "react-router-dom";
import type { Company } from "../../lib/catalog";
import type { Lead } from "../../lib/requests";
import type { LeadStats } from "../../lib/stats";

/**
 * What ProviderLayout resolves once and every tab reads (DM-02).
 *
 * Kept deliberately small. The temptation when splitting a 1,000-line
 * component is to hoist every piece of state into the layout and pass it all
 * down — but anything the layout imports stays in the layout's chunk, which
 * would undo the code splitting this refactor exists to enable (DM-12). So the
 * layout owns only what the SIDEBAR needs (company, the "new leads" badge) plus
 * the two things every tab needs (company, the aggregate stats). Everything
 * else — lead search, review search, chart derivations — lives in the tab that
 * uses it.
 *
 * `RootLayout` uses the same `useOutletContext` mechanism for `openSearch`.
 */
export interface ProviderOutletContext {
  /** Always non-null: ProviderLayout renders a dead-end screen instead of an
   *  Outlet when the provider has no company, so tabs never have to guard. */
  company: Company;
  /** The provider's leads as a capped local page — fine for previews and demo
   *  mode, NOT for totals. Use `stats` for anything that has to be true past
   *  100 leads. */
  leads: Lead[];
  /** Whole-table aggregates, or null while in flight / in demo mode. */
  agg: LeadStats | null;
  stats: { total: number; new: number; inProgress: number; completed: number };
  /** Whether this company's category opted into the fixed catalog — the
   *  Pricing tab only exists when true. */
  pricingAllowed: boolean;
}

export function useProvider(): ProviderOutletContext {
  return useOutletContext<ProviderOutletContext>();
}
