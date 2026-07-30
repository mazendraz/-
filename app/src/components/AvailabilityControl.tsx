import { useState } from "react";
import { formatReopenDate, type AvailabilityPayload } from "../lib/availability";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

// epoch ms → yyyy-mm-dd (local) for <input type="date">; "" when null.
function toDateInput(epochMs?: number | null): string {
  if (!epochMs) return "";
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// yyyy-mm-dd (local midnight) → epoch ms; null when empty. This is the instant the
// company becomes available again ("available on <date>").
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Busy/available control shared by the provider Availability tab and the admin
 * company editor. Renders the toggle + optional reopen date + note and calls
 * `onSave` with the resolved payload. Purely presentational about persistence —
 * the caller decides whether that's the provider or admin endpoint.
 */
export default function AvailabilityControl({
  initialBusy, initialBusyUntil, initialNote, onSave,
}: {
  initialBusy: boolean;
  initialBusyUntil?: number | null;
  initialNote?: string | null;
  onSave: (payload: AvailabilityPayload) => Promise<void>;
}) {
  const { locale } = useLocale();
  const [busy, setBusy] = useState(initialBusy);
  const [date, setDate] = useState(toDateInput(initialBusyUntil));
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const untilMs = fromDateInput(date);
  const dateInPast = busy && untilMs != null && untilMs <= Date.now();

  async function save() {
    if (dateInPast) { setError(t(locale, "prov_avail_err_past")); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await onSave({ busy, busyUntil: busy ? untilMs : null, busyNote: busy ? note.trim() : "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t(locale, "prov_avail_err_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status toggle */}
      <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${
        busy ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`material-symbols-outlined text-[26px] ${busy ? "text-amber-600" : "text-green-600"}`}
            style={{ fontVariationSettings: "'FILL' 1" }}>{busy ? "event_busy" : "event_available"}</span>
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-on-surface">{t(locale, busy ? "prov_avail_busy_title" : "prov_avail_free_title")}</p>
            <p className="text-[12px] text-outline">
              {busy
                ? (untilMs
                    ? `${t(locale, "prov_avail_reopens_on")} ${formatReopenDate(untilMs, locale)}`
                    : t(locale, "prov_avail_no_end"))
                : t(locale, "prov_avail_free_desc")}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={busy} onChange={(e) => { setBusy(e.target.checked); setSaved(false); }} className="sr-only peer" />
          <div className="w-11 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Busy details */}
      {busy && (
        <div className="space-y-4 rounded-2xl border border-outline-variant/25 p-4">
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_avail_until_label")} <span className="font-normal text-outline">{t(locale, "prov_avail_until_hint")}</span></label>
            <input type="date" className="field-input" value={date} min={toDateInput(Date.now())}
              onChange={(e) => { setDate(e.target.value); setSaved(false); }} />
            {dateInPast && <p className="text-[12px] text-error font-bold mt-1">{t(locale, "prov_avail_date_past")}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "prov_avail_note_label")} <span className="font-normal text-outline">{t(locale, "prov_avail_optional")}</span></label>
            <input className="field-input" maxLength={200} value={note} placeholder={t(locale, "prov_avail_note_ph")}
              onChange={(e) => { setNote(e.target.value); setSaved(false); }} />
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-error font-bold">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
          {t(locale, saving ? "prov_avail_saving" : "prov_avail_save")}
        </button>
        {saved && <span className="flex items-center gap-1 text-[13px] font-bold text-green-600"><span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span> {t(locale, "prov_avail_saved")}</span>}
      </div>
    </div>
  );
}
