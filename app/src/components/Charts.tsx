import { useRef, useState, useId } from "react";
import type { Point, Segment } from "../lib/analytics";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { CHART_COLORS } from "../lib/chartColors";

// ══════════════════════════════════════════════════════════════════════════
//  ChartCard — consistent panel wrapper
// ══════════════════════════════════════════════════════════════════════════
export function ChartCard({
  title, subtitle, action, children, className = "",
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-surface-container-lowest rounded-2xl p-5 shadow-bloom ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="font-display font-bold text-body text-on-surface">{title}</h3>
          {subtitle && <p className="text-caption text-outline mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  KpiCard — stat with optional delta + sparkline
// ══════════════════════════════════════════════════════════════════════════
export function KpiCard({
  icon, label, value, delta, spark, tint = CHART_COLORS.primary,
}: {
  icon: string; label: string; value: string | number;
  delta?: number; spark?: number[]; tint?: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${tint}14` }}>
          <span className="material-symbols-outlined text-title" style={{ color: tint, fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{icon}</span>
        </div>
        {typeof delta === "number" && (
          <span className={`flex items-center gap-0.5 text-caption font-bold px-2 py-0.5 rounded-full
            ${delta >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{delta >= 0 ? "trending_up" : "trending_down"}</span>
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="font-display text-headline font-black text-on-surface leading-none tabular-nums mb-1">{value}</div>
      <div className="text-caption text-outline font-bold ltr:uppercase ltr:tracking-wide">{label}</div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline data={spark} color={tint} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  Sparkline
// ══════════════════════════════════════════════════════════════════════════
export function Sparkline({ data, color = CHART_COLORS.primary, height = 32 }: { data: number[]; color?: string; height?: number }) {
  const gradId = useId();
  const W = 120, H = height, pad = 2;
  const max = Math.max(1, ...data);
  const n = data.length;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    // Decorative only — the KpiCard this lives in already states the value and
    // trend direction as real text right next to it (A11Y-18 targets the three
    // charts that are the SOLE source of their data: AreaLineChart, DonutChart).
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full chart-fade" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      {/* DM-14: constant stroke width regardless of the non-uniform x/y scale
          `preserveAspectRatio="none"` applies — see the longer comment on
          AreaLineChart's equivalent line for why this isn't a switch to
          `meet` instead. */}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  AreaLineChart — with hover tooltip
// ══════════════════════════════════════════════════════════════════════════
export function AreaLineChart({
  data, height = 220, color = CHART_COLORS.primary, valueLabel = "",
}: {
  data: Point[]; height?: number; color?: string; valueLabel?: string;
}) {
  const { locale } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const gradId = useId();

  const VW = 600, VH = height;
  const padL = 10, padR = 10, padT = 18, padB = 26;
  const innerW = VW - padL - padR, innerH = VH - padT - padB;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z`;

  function onMove(e: React.MouseEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setActive(Math.round(frac * (n - 1)));
  }

  // x-axis labels: first, middle, last
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
  const seriesLabel = data.map((d) => `${d.label}: ${d.value}${valueLabel ? ` ${valueLabel}` : ""}`).join(", ");

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full chart-fade"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={seriesLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {/* DM-14: `vector-effect="non-scaling-stroke"` on every stroked element
            here — NOT a switch to `preserveAspectRatio="xMidYMid meet"`, which
            the audit's own one-line suggestion was. Measured: this card's
            viewBox is 600×220 (2.7:1) but its rendered box ranges from ~1.6:1
            on a 390px phone to ~3:1 on desktop — `meet` would letterbox the
            NARROWER dimension to preserve that ratio, which on mobile means
            the chart shrinking to a fraction of the card height with blank
            space above/below it. The actual defect the audit measured (a
            trend line rendering thicker in one direction than another, and a
            hover-marker circle going elliptical) is `preserveAspectRatio=
            "none"`'s non-uniform x/y scale acting on stroke width — fixed by
            keeping stroke width constant in screen pixels regardless of that
            scale, without touching the intentional full-bleed responsive fill. */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padL} x2={VW - padR} y1={padT + innerH - g * innerH} y2={padT + innerH - g * innerH}
            stroke="#000" strokeOpacity="0.05" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* active marker */}
        {active !== null && data[active] && (
          <>
            <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + innerH} stroke={color} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(active)} cy={y(data[active].value)} r="5" fill="#fff" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* x labels */}
      <div className="flex justify-between px-1 -mt-4">
        {labelIdx.map((i) => (
          <span key={i} className="text-caption text-outline font-medium">{data[i]?.label}</span>
        ))}
      </div>
      {/* tooltip */}
      {active !== null && data[active] && (
        <div
          className="absolute -translate-x-1/2 pointer-events-none bg-on-surface text-white text-caption font-bold px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: `${(active / Math.max(1, n - 1)) * 100}%`, top: 0 }}
        >
          <span className="block opacity-70 text-caption">{data[active].label}</span>
          {data[active].value} {valueLabel}
        </div>
      )}
      {/* Same series as the SVG, as a real table for screen readers (A11Y-18) —
          visually hidden, not decorative: this is the chart's only text form. */}
      <table className="sr-only">
        <caption>{valueLabel || t(locale, "chart_col_value")}</caption>
        <thead>
          <tr><th>{t(locale, "chart_col_label")}</th><th>{t(locale, "chart_col_value")}</th></tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  BarChart (vertical)
// ══════════════════════════════════════════════════════════════════════════
export function BarChart({
  data, height = 200, color = CHART_COLORS.primary,
}: {
  data: Point[]; height?: number; color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24);
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
              {/* DM-11: was opacity-0 until :hover — a touch device has no
                  hover state, so the chart was shape with no numbers on
                  every phone. Always visible below md:; md:+ keeps the
                  hover-reveal (a wide chart with many bars gets crowded if
                  every value is shown labeled at once — that's still a
                  mouse-available affordance there, not the only way in). */}
              <span className="text-caption font-bold text-on-surface mb-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">{d.value}</span>
              <div
                className="w-full max-w-[44px] rounded-t-lg chart-bar"
                style={{ height: Math.max(2, h), backgroundColor: color, animationDelay: `${i * 50}ms` }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 mt-2">
        {data.map((d, i) => (
          // DM-14: 6 month labels at ~50px each truncated on a phone-width
          // card. Every other label below sm: — the bars themselves still
          // all render, only their x-axis text thins out.
          <span key={i} className={`flex-1 text-center text-caption text-outline font-medium truncate ${i % 2 === 1 ? "hidden sm:block" : ""}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  Horizontal labelled bars (for "by company" etc.)
// ══════════════════════════════════════════════════════════════════════════
export function BarList({ data, color = CHART_COLORS.primary, valueSuffix = "" }: { data: Point[]; color?: string; valueSuffix?: string }) {
  const { locale } = useLocale();
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-label text-outline text-center py-6">{t(locale, "chart_no_data")}</p>;
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-caption mb-1">
            <span className="font-bold text-on-surface truncate pe-2">{d.label}</span>
            <span className="text-outline font-bold tabular-nums flex-shrink-0">{d.value}{valueSuffix}</span>
          </div>
          <div className="h-2.5 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full rounded-full chart-bar-h" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color, animationDelay: `${i * 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  DonutChart
// ══════════════════════════════════════════════════════════════════════════
export function DonutChart({
  data, size = 180, thickness = 26, centerValue, centerLabel,
}: {
  data: Segment[]; size?: number; thickness?: number; centerValue?: string | number; centerLabel?: string;
}) {
  const { locale } = useLocale();
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-label text-outline" style={{ height: size }}>
        {t(locale, "chart_no_data")}
      </div>
    );
  }

  // Ring segments are drawn in this same array order, starting from the top
  // (the -rotate-90 on the <svg>) and proceeding clockwise — so a numbered
  // legend lets a colorblind user match a slice to its row by position/order,
  // not colour alone (A11Y-18 / WCAG 1.4.1).
  const segmentSummary = data
    .map((d, i) => `${i + 1}. ${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`)
    .join(", ");

  return (
    <div className="flex items-center gap-5 flex-wrap justify-center">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={segmentSummary}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#000" strokeOpacity="0.05" strokeWidth={thickness} />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={i}
                cx={cx} cy={cx} r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 0.6s var(--ease-out-expo)" }}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        {(centerValue !== undefined || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue !== undefined && <span className="text-title font-black text-on-surface leading-none">{centerValue}</span>}
            {centerLabel && <span className="text-caption text-outline font-bold ltr:uppercase ltr:tracking-wide mt-0.5">{centerLabel}</span>}
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="space-y-2" aria-hidden="true">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0 flex items-center justify-center text-caption font-black text-white/90" style={{ backgroundColor: d.color }}>{i + 1}</span>
            <span className="text-label text-on-surface font-medium">{d.label}</span>
            <span className="text-label text-outline font-bold ms-auto tabular-nums">{d.value}</span>
            <span className="text-caption text-outline w-9 text-end">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
      {/* Real table for screen readers — the legend above is aria-hidden since
          this covers the exact same data with the same 1-based ordering
          referenced in the SVG's aria-label. */}
      <table className="sr-only">
        <thead>
          <tr><th>{t(locale, "chart_col_label")}</th><th>{t(locale, "chart_col_value")}</th><th>{t(locale, "chart_col_percent")}</th></tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}><td>{d.label}</td><td>{d.value}</td><td>{Math.round((d.value / total) * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  FunnelChart
// ══════════════════════════════════════════════════════════════════════════
export function FunnelChart({ stages }: { stages: Segment[] }) {
  const { locale } = useLocale();
  const max = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const prev = i > 0 ? stages[i - 1].value : s.value;
        const dropoff = prev > 0 ? Math.round((s.value / prev) * 100) : 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-caption mb-1">
              <span className="font-bold text-on-surface">{s.label}</span>
              <span className="text-outline">
                <span className="font-black text-on-surface">{s.value}</span>
                {i > 0 && <span className="ms-1.5 text-caption">({dropoff}% {t(locale, "chart_of_prev")})</span>}
              </span>
            </div>
            <div className="h-7 bg-surface-container rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg chart-bar-h flex items-center justify-end px-2"
                style={{ width: `${Math.max(6, pct)}%`, backgroundColor: s.color, animationDelay: `${i * 80}ms` }}
              >
                <span className="text-white text-caption font-bold">{pct}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
