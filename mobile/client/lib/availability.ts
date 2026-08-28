/**
 * Availability label — the mobile counterpart of the website's
 * availability.ts `availabilityLabel`/`formatReopenDate`/`availableAgainAt`.
 * Arabic-only (this app is Arabic-only/RTL-forced, see lib/rtl.ts) and pure
 * display logic only — no provider/admin write endpoints, no demo-mode
 * branch: mobile is always talking to the real API, so `company.busy` is
 * always the server-resolved value (see the website's isBusy() comment on
 * why that's exactly right, not a simplification of it).
 */
export type AvailabilityState = "busy" | "upcoming" | "free";

export function formatReopenDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

/** null = genuinely open-ended (busy with no end set). */
export function availableAgainAt(c: { nextAvailableAt?: number | null; busyUntil?: number | null }): number | null {
  return c.nextAvailableAt ?? c.busyUntil ?? null;
}

export function availabilityLabel(c: {
  busy?: boolean | null;
  busyUntil?: number | null;
  nextAvailableAt?: number | null;
  upcomingBusyFrom?: number | null;
  responseTime?: string;
}): { state: AvailabilityState; text: string } {
  if (c.busy) {
    const back = c.nextAvailableAt ?? c.busyUntil ?? null;
    return { state: "busy", text: back ? `مشغول · يرجع ${formatReopenDate(back)}` : "مشغول" };
  }

  if (c.upcomingBusyFrom != null) {
    return { state: "upcoming", text: `مشغول من ${formatReopenDate(c.upcomingBusyFrom)}` };
  }

  return {
    state: "free",
    text: c.responseTime ? `متاح · بيرد ${c.responseTime}` : "متاح",
  };
}
