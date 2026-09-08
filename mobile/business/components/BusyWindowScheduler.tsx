import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import Button from "./Button";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleInput {
  startsAt: number;
  endsAt: number | null;
  note: string | null;
}

/**
 * "Schedule a new closure" — the mobile counterpart of the website's
 * BusyWindowsEditor `add` form. The website uses `<input type="datetime-local">`;
 * React Native has no equivalent and this app carries no date-picker
 * dependency, so the same intent (a from → to range, or an open-ended one)
 * is expressed with quick-pick chips and a LIVE resolved-date line, so the
 * dates a tap produces are never a guess.
 *
 * Shared verbatim by the provider Availability screen and the admin
 * per-company one — the two used to carry a copy each of a bare
 * "starts in N days / lasts N days" pair of number inputs.
 */
const START_CHIPS: { label: string; days: number }[] = [
  { label: "النهارده", days: 0 },
  { label: "بكره", days: 1 },
  { label: "بعد يومين", days: 2 },
  { label: "بعد أسبوع", days: 7 },
  { label: "بعد أسبوعين", days: 14 },
  { label: "بعد شهر", days: 30 },
];

const DURATION_CHIPS: { label: string; days: number | "open" }[] = [
  { label: "يوم", days: 1 },
  { label: "٣ أيام", days: 3 },
  { label: "أسبوع", days: 7 },
  { label: "أسبوعين", days: 14 },
  { label: "شهر", days: 30 },
  { label: "لحد ما أفتحها", days: "open" },
];

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

export default function BusyWindowScheduler({
  onSchedule,
  busy,
}: {
  onSchedule: (input: ScheduleInput) => void | Promise<void>;
  /** Scheduling request in flight — drives the button's spinner. */
  busy?: boolean;
}) {
  const [startDays, setStartDays] = useState(1);
  const [duration, setDuration] = useState<number | "open">(3);
  const [note, setNote] = useState("");

  const { startsAt, endsAt } = useMemo(() => {
    const start = Date.now() + startDays * DAY_MS;
    return {
      startsAt: start,
      endsAt: duration === "open" ? null : start + duration * DAY_MS,
    };
  }, [startDays, duration]);

  const preview =
    endsAt == null
      ? `من ${fmtDate(startsAt)} — لحد ما تفتحها بنفسك`
      : `من ${fmtDate(startsAt)}\nإلى ${fmtDate(endsAt)}`;

  function submit() {
    void onSchedule({ startsAt, endsAt, note: note.trim() || null });
    setNote("");
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>جدولة فترة جديدة</Text>

      <Text style={styles.label}>تبدأ</Text>
      <View style={styles.chipRow}>
        {START_CHIPS.map((c) => (
          <Pressable
            key={c.days}
            style={[styles.chip, startDays === c.days && styles.chipActive]}
            onPress={() => setStartDays(c.days)}
          >
            <Text style={[styles.chipText, startDays === c.days && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>تستمر</Text>
      <View style={styles.chipRow}>
        {DURATION_CHIPS.map((c) => (
          <Pressable
            key={String(c.days)}
            style={[styles.chip, duration === c.days && styles.chipActive]}
            onPress={() => setDuration(c.days)}
          >
            <Text style={[styles.chipText, duration === c.days && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.previewBox}>
        <Text style={styles.previewText}>{preview}</Text>
      </View>

      <Text style={styles.label}>ملاحظة (اختياري)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="مثلاً: إجازة، أو مشغول بمشروع"
        placeholderTextColor={colors.onSurfaceVariant}
        maxLength={200}
      />

      <Button label="جدولة" onPress={submit} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 10, marginTop: 8 },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: textStart, marginTop: 4 },
  chipRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  chipTextActive: { color: colors.onPrimary },
  previewBox: { backgroundColor: colors.primaryFixed, borderRadius: 10, padding: 12, marginTop: 4 },
  previewText: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onPrimaryFixed, textAlign: textStart, lineHeight: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: textStart,
  },
});
