import { useEffect, useState } from "react";
import {
  fetchMaintenanceAdmin, saveMaintenance,
  MAINTENANCE_OFF, type MaintenanceStatus,
} from "../../lib/settings";
import { isApiConfigured } from "../../lib/api";
import StatusScreen from "../../components/StatusScreen";
import { LField } from "./components/ModalShell";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";

// ══════════════════════════════════════════════════════════════════════════
//  SITE STATUS — the maintenance switch
// ══════════════════════════════════════════════════════════════════════════

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time, not an ISO string. */
function toLocalInput(epoch: number | null): string {
  if (epoch == null) return "";
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The copy fields — everything except the switch itself. */
const COPY_FIELDS = ["title_en", "title_ar", "message_en", "message_ar", "eta"] as const;

export function SiteStatusTab() {
  const { locale } = useLocale();
  const [form, setForm] = useState<MaintenanceStatus>(MAINTENANCE_OFF);
  // What the server actually holds. The copy the switch sends is only `enabled`,
  // so without this there is no way to tell the admin that the notice they just
  // typed is NOT the one visitors are being shown.
  const [saved, setSaved] = useState<MaintenanceStatus>(MAINTENANCE_OFF);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [preview, setPreview] = useState(false);

  const apiMode = isApiConfigured();
  const copyDirty = COPY_FIELDS.some((k) => form[k] !== saved[k]);

  useEffect(() => {
    if (!apiMode) { setLoading(false); return; }
    let alive = true;
    fetchMaintenanceAdmin()
      .then((s) => { if (alive) { setForm(s); setSaved(s); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : t(locale, "admin_ss_load_error")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiMode]);

  const set = <K extends keyof MaintenanceStatus>(key: K, value: MaintenanceStatus[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Persist a patch and reconcile the form with what was stored.
   *
   * `keepEdits` exists because the switch sends ONLY `{ enabled }`. Writing the
   * whole response back over the form then replaced the admin's unsaved title and
   * message with the values still on the server — so "write the maintenance
   * notice, then flip the switch" silently threw the notice away and visitors got
   * the old copy. Flipping the switch must not touch fields it did not send.
   */
  async function persist(patch: Partial<MaintenanceStatus>, keepEdits = false) {
    setSaving(true);
    setError("");
    try {
      const result = await saveMaintenance(patch);
      setForm((f) => (keepEdits ? { ...f, ...patch, enabled: result.enabled } : result));
      setSaved(result); // the server's copy is the one visitors are shown
      setFlash(t(locale, result.enabled ? "admin_ss_flash_on" : "admin_ss_flash_off"));
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "admin_ss_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  // Maintenance lives in the database, not localStorage — there is nothing to
  // toggle without a backend, and pretending otherwise would be a lie.
  if (!apiMode) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState
          msg={t(locale, "admin_ss_needs_api")}
          icon="cloud_off"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 bg-surface-container-lowest rounded-2xl p-4 shadow-bloom">
          <p className="text-[13px] font-bold text-outline">
            {t(locale, "admin_ss_preview_note")}
          </p>
          <button
            onClick={() => setPreview(false)}
            className="flex items-center gap-1.5 bg-surface-container px-4 py-2 rounded-xl font-bold text-[13px] text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span> {t(locale, "admin_ss_close_preview")}
          </button>
        </div>
        <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
          {/* The real component, fed the unsaved form — a preview that renders
              something else is not a preview. */}
          <StatusScreen variant="maintenance" status={form} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">
          {error}
        </div>
      )}
      {flash && (
        <div className="bg-primary/10 border border-primary/25 text-primary rounded-xl px-4 py-2.5 text-[13px] font-bold">
          {flash}
        </div>
      )}

      {/* ── The switch ── */}
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-on-surface">{t(locale, "admin_ss_maintenance")}</p>
            <p className="text-[13px] text-outline mt-0.5 leading-relaxed">
              {t(locale, "admin_ss_desc_a")} <span className="font-bold text-on-surface-variant">
                {t(locale, "admin_ss_desc_b")}
              </span>{t(locale, "admin_ss_desc_c")}
            </p>
          </div>
          <button
            onClick={() => void persist({ enabled: !form.enabled }, true)}
            disabled={saving}
            role="switch"
            aria-checked={form.enabled}
            aria-label={t(locale, "admin_ss_maintenance")}
            className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${
              form.enabled ? "bg-error" : "bg-outline-variant/40"
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                form.enabled ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        {form.enabled && (
          <div className="mt-4 flex items-center gap-2 bg-error/10 border border-error/25 rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-error text-[18px]">warning</span>
            <p className="text-[13px] font-bold text-error">
              {t(locale, "admin_ss_down_now")}
            </p>
          </div>
        )}
      </div>

      {/* ── Copy ── */}
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom space-y-4">
        <div>
          <p className="font-bold text-[15px] text-on-surface">{t(locale, "admin_ss_visitors_title")}</p>
          <p className="text-[13px] text-outline mt-0.5">
            {t(locale, "admin_ss_visitors_hint")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LField label={t(locale, "admin_ss_title_en_label")}>
            <input
              className="field-input" dir="ltr" value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              placeholder={t(locale, "admin_ss_title_en_ph")}
            />
          </LField>
          <LField label={t(locale, "admin_ss_title_ar_label")}>
            <input
              className="field-input" dir="rtl" value={form.title_ar}
              onChange={(e) => set("title_ar", e.target.value)}
              placeholder={t(locale, "admin_ss_title_ar_ph")}
            />
          </LField>
          <LField label={t(locale, "admin_ss_message_en_label")}>
            <textarea
              className="field-input" dir="ltr" rows={3} value={form.message_en}
              onChange={(e) => set("message_en", e.target.value)}
              placeholder={t(locale, "admin_ss_message_en_ph")}
            />
          </LField>
          <LField label={t(locale, "admin_ss_message_ar_label")}>
            <textarea
              className="field-input" dir="rtl" rows={3} value={form.message_ar}
              onChange={(e) => set("message_ar", e.target.value)}
              placeholder={t(locale, "admin_ss_message_ar_ph")}
            />
          </LField>
        </div>

        <LField label={t(locale, "admin_ss_eta")}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local" className="field-input !w-auto"
              value={toLocalInput(form.eta)}
              onChange={(e) => set("eta", fromLocalInput(e.target.value))}
            />
            {form.eta != null && (
              <button
                onClick={() => set("eta", null)}
                className="text-[13px] font-bold text-outline hover:text-error transition-colors"
              >
                {t(locale, "admin_clear")}
              </button>
            )}
          </div>
        </LField>

        {/* The switch persists only `enabled`, so edited copy stays local until
            this is pressed. Say so plainly — otherwise the admin sees their new
            notice on screen while visitors are still being shown the old one. */}
        {copyDirty && (
          <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/25 rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-secondary text-[18px]">edit_note</span>
            <p className="text-[13px] font-bold text-secondary">{t(locale, "admin_ss_unsaved_copy")}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => void persist({
              title_en: form.title_en, title_ar: form.title_ar,
              message_en: form.message_en, message_ar: form.message_ar,
              eta: form.eta,
            })}
            disabled={saving}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors disabled:opacity-60 touch-press btn-press"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {t(locale, saving ? "admin_saving" : "admin_ss_save_message")}
          </button>
          <button
            onClick={() => setPreview(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-[14px] text-on-surface border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            {t(locale, "admin_preview")}
          </button>
        </div>
      </div>
    </div>
  );
}
