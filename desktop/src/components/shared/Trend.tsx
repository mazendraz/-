// Shared trend badge — same visual language as OverviewPage's local Trend
// (duplicated rather than imported: Overview is a validated Stage 1–3
// screen the brief says not to touch, so this is a new, independent home
// for every screen built from Stage 5 onward).
export function Trend({
  percent,
  inverse,
  className = "",
}: {
  percent: number | null;
  /** True when "up" is unfavorable (e.g. expenses) — flips which color reads as good. */
  inverse?: boolean;
  className?: string;
}) {
  if (percent === null) {
    return (
      <span
        className={`flex items-center rounded bg-surface-container px-2 py-1 font-body-sm text-body-sm text-on-surface-variant ${className}`}
      >
        New
      </span>
    );
  }
  const isUp = percent >= 0;
  const favorable = inverse ? !isUp : isUp;
  return (
    <span
      className={`flex items-center rounded px-2 py-1 font-body-sm text-body-sm font-medium ${
        favorable ? "bg-secondary/10 text-secondary" : "bg-error-container/30 text-on-error-container"
      } ${className}`}
    >
      <span className="material-symbols-outlined mr-1 text-[16px]">{isUp ? "trending_up" : "trending_down"}</span>
      {isUp ? "+" : ""}
      {percent}%
    </span>
  );
}
