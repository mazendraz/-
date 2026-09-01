import type { ApiDesktopOverview } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

/** GET /admin/desktop/overview — desktopOnly(["overview:read","analytics:read"]). */
export function fetchControlOverview(days?: number): Promise<ApiDesktopOverview> {
  const qs = days ? `?days=${days}` : "";
  return apiGet<ApiDesktopOverview>(`/admin/desktop/overview${qs}`);
}
