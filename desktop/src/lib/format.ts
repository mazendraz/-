// English-only formatting (the Business Control Center has no locale switch,
// unlike app/'s bilingual site) — but keeps the same underlying convention:
// EGP amounts are whole pounds (no piastres, matches every Int price column
// in the schema), Latin digits, "EGP 84,500" style matching the mockups.
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("EGP", "EGP "); // Intl collapses the space in some environments
}

export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", options).format(n);
}

/** "1.2K" style compact count for KPI cards with potentially large numbers.
 *  Below 1,000 this is identical to formatNumber (no decimals introduced for
 *  small counts, matching the mockup's plain "24" / "37" / "12"). */
export function formatCompactNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "morning" / "afternoon" / "evening" — for the Overview screen's "Good
 *  {timeOfDay}, {name}" header, matching the mockup's "Good morning, Mazen". */
export function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** % change from `previous` to `current` — client-side twin of
 *  desktopOverview.service.ts's percentChange, for screens (Clients, ...)
 *  whose endpoint already returns a {current, previous} pair and doesn't
 *  need a server-computed percent. null (not 0 or Infinity) against a zero
 *  base — "undefined" is the honest answer, not a misleading "+100%". */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
