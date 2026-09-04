import { ChipBar, Chip } from "./ChipBar";

/**
 * The analytics date-range selector.
 *
 * Ranges map to the `?days=` / `?months=` / `?deltaDays=` the stats endpoint
 * already accepts (api's parseStatsQuery) — this is a control over a REAL
 * server query, not a client-side slice of a fixed payload. Changing it
 * refetches; every KPI, the trend, the donut and the funnel all move together
 * because they are all derived from the one `ApiLeadStats` that comes back.
 */
export interface Range {
  key: "7" | "30" | "90" | "365";
  label: string;
  days: number;
  months: number;
}

export const RANGES: readonly Range[] = [
  { key: "7", label: "٧ أيام", days: 7, months: 3 },
  { key: "30", label: "٣٠ يوم", days: 30, months: 6 },
  { key: "90", label: "٩٠ يوم", days: 90, months: 12 },
  { key: "365", label: "سنة", days: 365, months: 12 },
];

export default function RangeChips({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <ChipBar style={{ paddingVertical: 4 }}>
      {RANGES.map((r) => (
        <Chip key={r.key} label={r.label} active={r.key === value.key} onPress={() => onChange(r)} />
      ))}
    </ChipBar>
  );
}
