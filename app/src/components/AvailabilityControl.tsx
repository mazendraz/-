import { useState } from "react";
import { formatReopenDate, type AvailabilityPayload } from "../lib/availability";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

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
        busy ? "border-warning bg-warning-container" : "border-success bg-success-container"
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`material-symbols-outlined text-headline ${busy ? "text-warning" : "text-success"}`}
            style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{busy ? "event_busy" : "event_available"}</span>
          <div className="min-w-0">
            <p className="font-bold text-body text-on-surface">{t(locale, busy ? "prov_avail_busy_title" : "prov_avail_free_title")}</p>
            <p className="text-caption text-outline">
              {busy
                ? (untilMs
                    ? `${t(locale, "prov_avail_reopens_on")} ${formatReopenDate(untilMs, locale)}`
                    : t(locale, "prov_avail_no_end"))
                : t(locale, "prov_avail_free_desc")}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" role="switch" aria-checked={busy} aria-label={t(locale, "prov_tab_availability")} checked={busy} onChange={(e) => { setBusy(e.target.checked); setSaved(false); }} className="sr-only peer" />
          <div className="w-11 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5 peer-checked:bg-warning after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform" />
        </label>
      </div>

      {/* Busy details */}
      {busy && (
        <div className="space-y-4 rounded-2xl border border-outline-variant/25 p-4">
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_avail_until_label")} <span className="font-normal text-outline">{t(locale, "prov_avail_until_hint")}</span></label>
            <input type="date" className="field-input" value={date} min={toDateInput(Date.now())}
              onChange={(e) => { setDate(e.target.value); setSaved(false); }} />
            {dateInPast && <p className="text-caption text-error font-bold mt-1">{t(locale, "prov_avail_date_past")}</p>}
          </div>
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_avail_note_label")} <span className="font-normal text-outline">{t(locale, "prov_avail_optional")}</span></label>
            <input className="field-input" maxLength={200} value={note} placeholder={t(locale, "prov_avail_note_ph")}
              onChange={(e) => { setNote(e.target.value); setSaved(false); }} />
          </div>
        </div>
      )}

      {error && <p className="text-label text-error font-bold">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {saving && <Icon name="progress_activity" className="text-subhead animate-spin" />}
          {t(locale, saving ? "prov_avail_saving" : "prov_avail_save")}
        </button>
        {saved && <span className="flex items-center gap-1 text-label font-bold text-success"><Icon name="check_circle" className="text-subhead" style={{ fontVariationSettings: "'FILL' 1" }} /> {t(locale, "prov_avail_saved")}</span>}
      </div>
    </div>
  );
}
