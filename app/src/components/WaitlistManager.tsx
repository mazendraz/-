import { useCallback, useEffect, useState } from "react";
import { isApiConfigured } from "../lib/api";
import {
  listWaitlist, setWaitlistStatus, deleteWaitlistEntry,
  WAITLIST_STATUSES, WAITLIST_STATUS_KEYS, WAITLIST_STATUS_COLORS,
  type WaitlistScope, type WaitlistEntry, type WaitlistStatus,
} from "../lib/availability";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { formatDate } from "../lib/format";
import { formatPhoneDisplay } from "../lib/phone";
import Icon from "./Icon";

const FILTERS: (WaitlistStatus | "All")[] = ["All", ...WAITLIST_STATUSES];

/**
 * Shared waiting-list manager used by the provider dashboard (own company) and the
 * admin company editor (a specific company). Lists people who joined the list while
 * the company was busy and lets staff move them through the lifecycle. Contact is
 * off-platform (phone) — the buttons only track state.
 */
export default function WaitlistManager({ scope }: { scope: WaitlistScope }) {
  const { locale } = useLocale();
  const apiMode = isApiConfigured();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [filter, setFilter] = useState<WaitlistStatus | "All">("All");
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const scopeKey = scope.kind === "admin" ? scope.companyId : "provider";

  const reload = useCallback(async () => {
    if (!apiMode) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setEntries(await listWaitlist(scope)); }
    catch { setError(t(locale, "prov_wl_err_load")); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, scopeKey]);

  useEffect(() => { void reload(); }, [reload]);

  async function changeStatus(id: string, status: WaitlistStatus) {
    setBusyId(id); setError("");
    // optimistic
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, status } : e)));
    try { await setWaitlistStatus(scope, id, status); }
    catch { setError(t(locale, "prov_wl_err_update")); await reload(); }
    finally { setBusyId(null); }
  }

  async function remove(id: string) {
    setBusyId(id); setError("");
    try { await deleteWaitlistEntry(scope, id); setEntries((list) => list.filter((e) => e.id !== id)); }
    catch { setError(t(locale, "prov_wl_err_remove")); }
    finally { setBusyId(null); }
  }

  const shown = filter === "All" ? entries : entries.filter((e) => e.status === filter);
  const waitingCount = entries.filter((e) => e.status === "WAITING").length;

  if (!apiMode) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
        <p className="text-body text-outline">{t(locale, "prov_wl_demo")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-body text-on-surface flex items-center gap-2">
            <Icon name="hourglass_top" className="text-primary text-title" />
            {t(locale, "prov_wl_title")}
            {waitingCount > 0 && <span className="bg-warning-container text-on-warning-container text-caption font-bold px-2 py-0.5 rounded-full">{waitingCount} {t(locale, "prov_wl_waiting_suffix")}</span>}
          </h3>
          <p className="text-caption text-outline mt-0.5 max-w-md leading-relaxed">
            {t(locale, "prov_wl_desc")}
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3.5 py-1.5 min-h-[44px] rounded-full text-label font-bold transition-colors border ${
              filter === f ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
            }`}>
            {f === "All" ? t(locale, "prov_wl_filter_all") : t(locale, WAITLIST_STATUS_KEYS[f])}
          </button>
        ))}
      </div>

      {error && <p className="text-label text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="p-10 text-center text-label text-outline"><span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "prov_wl_loading")}</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-14 px-6">
            <Icon name="event_available" className="text-outline text-[48px] mb-3 block" />
            <p className="text-subhead text-outline max-w-sm mx-auto">
              {t(locale, entries.length === 0 ? "prov_wl_empty" : "prov_wl_no_match")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {shown.map((e) => (
              <div key={e.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className=" text-label text-on-surface">{e.name}</span>
                    <span className={`text-caption px-2 py-0.5 rounded-full ${WAITLIST_STATUS_COLORS[e.status]}`}>{t(locale, WAITLIST_STATUS_KEYS[e.status])}</span>
                  </div>
                  <a href={`tel:${e.phone}`} className="text-label font-bold text-primary hover:underline" dir="ltr">{formatPhoneDisplay(e.phone)}</a>
                  {e.service && <p className="text-caption text-outline">{t(locale, "prov_wl_waiting_for")} {e.service}</p>}
                  {e.note && <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{e.note}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {/* DM-06b: unnamed select, same class as the one fixed in
                        LeadRows.tsx — missed here on the first pass. */}
                    <select
                      value={e.status}
                      aria-label={`${t(locale, "admin_lead_status")} — ${e.name}`}
                      disabled={busyId === e.id}
                      onChange={(ev) => changeStatus(e.id, ev.target.value as WaitlistStatus)}
                      className="border border-outline-variant rounded-lg px-2.5 py-1 min-h-[44px] text-caption text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                    >
                      {WAITLIST_STATUSES.map((s) => <option key={s} value={s}>{t(locale, WAITLIST_STATUS_KEYS[s])}</option>)}
                    </select>
                    <button onClick={() => remove(e.id)} disabled={busyId === e.id} title={t(locale, "prov_wl_remove")}
                      aria-label={`${t(locale, "prov_wl_remove")} — ${e.name}`}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{busyId === e.id ? "progress_activity" : "delete"}</span>
                    </button>
                  </div>
                  <span className="text-caption text-outline">{formatDate(e.createdAt, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
