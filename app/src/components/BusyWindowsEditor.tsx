import { useEffect, useState } from "react";
import {
  listMyBusyWindows, createMyBusyWindow, deleteMyBusyWindow,
  listCompanyBusyWindows, createCompanyBusyWindow, deleteCompanyBusyWindow,
  formatWindowRange, type BusyWindow,
} from "../lib/availability";
import { isApiConfigured } from "../lib/api";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

/**
 * Scheduled unavailability, under the manual busy switch.
 *
 * Nothing here runs on a timer: the server derives "busy right now" from these
 * rows on every read, so a period takes effect and expires by itself. The editor
 * only schedules.
 */

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

export default function BusyWindowsEditor({ companyId }: {
  /** Admin mode when provided; otherwise the signed-in provider's own company. */
  companyId?: string;
}) {
  const { locale } = useLocale();
  const asAdmin = Boolean(companyId);

  const [items, setItems] = useState<BusyWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ startsAt: "", endsAt: "", note: "", openEnded: false });

  const load = () => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    (asAdmin ? listCompanyBusyWindows(companyId!) : listMyBusyWindows())
      .then((rows) => { setItems(rows); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "prov_bw_err_load")))
      .finally(() => setLoading(false));
  };
  useEffect(load, [companyId]);

  async function add() {
    const startsAt = fromLocalInput(form.startsAt);
    if (startsAt == null) {
      setError(t(locale, "prov_bw_err_start"));
      return;
    }
    const endsAt = form.openEnded ? null : fromLocalInput(form.endsAt);
    setBusy(true);
    setError("");
    try {
      const input = { startsAt, endsAt, note: form.note.trim() || null };
      if (asAdmin) await createCompanyBusyWindow(companyId!, input);
      else await createMyBusyWindow(input);
      setForm({ startsAt: "", endsAt: "", note: "", openEnded: false });
      setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_bw_err_save"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(w: BusyWindow) {
    setBusy(true);
    setError("");
    try {
      if (asAdmin) await deleteCompanyBusyWindow(companyId!, w.id);
      else await deleteMyBusyWindow(w.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_bw_err_remove"));
    } finally {
      setBusy(false);
    }
  }

  if (!isApiConfigured()) return null;

  return (
    <div className="mt-5 pt-5 border-t border-outline-variant/20">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-[15px] text-on-surface">
            {t(locale, "prov_bw_title")}
          </p>
          <p className="text-[13px] text-outline mt-0.5">
            {t(locale, "prov_bw_desc")}
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 bg-surface-container px-3 py-2 rounded-xl font-bold text-[13px] text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[17px]">{adding ? "close" : "add"}</span>
          {t(locale, adding ? "prov_bw_cancel" : "prov_bw_add")}
        </button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold mb-3">
          {error}
        </div>
      )}

      {adding && (
        <div className="bg-surface-container rounded-xl p-4 mb-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[12px] font-bold text-outline mb-1.5">
                {t(locale, "prov_bw_from")}
              </span>
              <input
                type="datetime-local" className="field-input"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-bold text-outline mb-1.5">
                {t(locale, "prov_bw_to")}
              </span>
              <input
                type="datetime-local" className="field-input"
                value={form.endsAt} disabled={form.openEnded}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox" checked={form.openEnded}
              onChange={(e) => setForm({ ...form, openEnded: e.target.checked })}
              className="w-4 h-4 accent-[color:var(--color-primary,#8a6a4f)]"
            />
            <span className="text-[13px] text-on-surface">
              {t(locale, "prov_bw_open_ended")}
            </span>
          </label>
          {form.openEnded && (
            // Worth saying up front: the server closes the previous open period
            // rather than rejecting this one, and a silent replacement is
            // confusing if you didn't expect it.
            <p className="text-[12px] text-outline">
              {t(locale, "prov_bw_open_ended_note")}
            </p>
          )}

          <label className="block">
            <span className="block text-[12px] font-bold text-outline mb-1.5">
              {t(locale, "prov_bw_note_label")}
            </span>
            <input
              className="field-input" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t(locale, "prov_bw_note_ph")}
            />
          </label>

          <button
            onClick={() => void add()} disabled={busy}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-[13px] hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[17px]">event_busy</span>
            {t(locale, busy ? "prov_bw_saving" : "prov_bw_save")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-outline py-2">
          {t(locale, "prov_bw_empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((w) => {
            const running = w.startsAt <= Date.now() && (w.endsAt == null || w.endsAt > Date.now());
            const locked = w.createdByAdmin && !asAdmin;
            return (
              <div
                key={w.id}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border ${
                  running ? "bg-amber-50 border-amber-200" : "bg-surface-container-lowest border-outline-variant/20"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-on-surface">
                      {formatWindowRange(w, locale)}
                    </span>
                    {running && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {t(locale, "prov_bw_running")}
                      </span>
                    )}
                    {w.createdByAdmin && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-outline"
                        title={t(locale, "prov_bw_admin_title")}
                      >
                        <span className="material-symbols-outlined text-[12px]">lock</span>
                        {t(locale, "prov_bw_admin_badge")}
                      </span>
                    )}
                  </div>
                  {w.note && <p className="text-[12px] text-outline mt-0.5">{w.note}</p>}
                </div>

                <button
                  onClick={() => void remove(w)}
                  disabled={busy || locked}
                  title={locked
                    ? t(locale, "prov_bw_admin_locked")
                    : undefined}
                  className="text-outline hover:text-error transition-colors disabled:opacity-30 flex-shrink-0"
                  aria-label={t(locale, "prov_bw_remove")}
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
