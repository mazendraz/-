/**
 * Real CSS colour values for chart/SVG props that can't take Tailwind
 * classes (stroke/fill/tint) — DS-07. Kept in one place instead of the same
 * hex literal retyped at every KpiCard/Chart call site, so a palette change
 * only touches here. Values match tailwind.config.js's `primary` and the
 * stock Tailwind blue-600/green-600/secondary hues already used for the KPI
 * accent set — not new colours, just named once.
 */
export const CHART_COLORS = {
  primary: "#005578", // tailwind.config.js `primary`
  primaryContainer: "#0b6e99", // tailwind.config.js `primary-container`
  blue: "#2563eb", // Tailwind blue-600 — "new" KPI accent
  green: "#16a34a", // Tailwind green-600 — "conversion" KPI accent
  secondary: "#785a02", // tailwind.config.js `secondary` — "rating"/company KPI accent
} as const;
