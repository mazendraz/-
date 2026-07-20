import { useCallback, useEffect, useState } from "react";
import { isApiConfigured } from "../lib/api";
import {
  listWaitlist, setWaitlistStatus, deleteWaitlistEntry,
  WAITLIST_STATUSES, WAITLIST_STATUS_LABELS, WAITLIST_STATUS_COLORS,
  type WaitlistScope, type WaitlistEntry, type WaitlistStatus,
} from "../lib/availability";

const FILTERS: (WaitlistStatus | "All")[] = ["All", ...WAITLIST_STATUSES];

/**
 * Shared waiting-list manager used by the provider dashboard (own company) and the
 * admin company editor (a specific company). Lists people who joined the list while
 * the company was busy and lets staff move them through the lifecycle. Contact is
 * off-platform (phone) — the buttons only track state.
 */
export default function WaitlistManager({ scope }: { scope: WaitlistScope }) {
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
    catch { setError("Couldn't load the waiting list."); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMode, scopeKey]);

  useEffect(() => { void reload(); }, [reload]);

  async function changeStatus(id: string, status: WaitlistStatus) {
    setBusyId(id); setError("");
    // optimistic
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, status } : e)));
    try { await setWaitlistStatus(scope, id, status); }
    catch { setError("Couldn't update that entry."); await reload(); }
    finally { setBusyId(null); }
  }

  async function remove(id: string) {
    setBusyId(id); setError("");
    try { await deleteWaitlistEntry(scope, id); setEntries((list) => list.filter((e) => e.id !== id)); }
    catch { setError("Couldn't remove that entry."); }
    finally { setBusyId(null); }
  }

  const shown = filter === "All" ? entries : entries.filter((e) => e.status === filter);
  const waitingCount = entries.filter((e) => e.status === "WAITING").length;

  if (!apiMode) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
        <p className="text-body-md font-body-md text-outline">Connect the live API to see and manage your waiting list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-[16px] text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">hourglass_top</span>
            Waiting list
            {waitingCount > 0 && <span className="bg-amber-100 text-amber-800 text-[12px] font-bold px-2 py-0.5 rounded-full">{waitingCount} waiting</span>}
          </h3>
          <p className="text-[12px] text-outline mt-0.5 max-w-md leading-relaxed">
            People who asked to be contacted while you were busy. Call them back, then mark them Notified or Converted.
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-colors border ${
              filter === f ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
            }`}>
            {f === "All" ? "All" : WAITLIST_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="p-10 text-center text-[14px] text-outline"><span className="spinner spinner-primary mx-auto mb-3 block" /> Loading…</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-14 px-6">
            <span className="material-symbols-outlined text-outline text-[48px] mb-3 block">event_available</span>
            <p className="text-body-lg font-body-lg text-outline max-w-sm mx-auto">
              {entries.length === 0 ? "No one is on the waiting list yet." : "No entries match this filter."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {shown.map((e) => (
              <div key={e.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-label-md text-label-md text-on-surface">{e.name}</span>
                    <span className={`text-label-sm font-label-sm px-2 py-0.5 rounded-full ${WAITLIST_STATUS_COLORS[e.status]}`}>{WAITLIST_STATUS_LABELS[e.status]}</span>
                  </div>
                  <a href={`tel:${e.phone}`} className="text-[14px] font-bold text-primary hover:underline">{e.phone}</a>
                  {e.service && <p className="text-label-sm font-label-sm text-outline">Waiting for: {e.service}</p>}
                  {e.note && <p className="text-body-md font-body-md text-on-surface-variant text-sm mt-1 line-clamp-2">{e.note}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <select
                      value={e.status}
                      disabled={busyId === e.id}
                      onChange={(ev) => changeStatus(e.id, ev.target.value as WaitlistStatus)}
                      className="border border-outline-variant rounded-lg px-2.5 py-1 text-label-sm text-on-surface bg-surface focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                    >
                      {WAITLIST_STATUSES.map((s) => <option key={s} value={s}>{WAITLIST_STATUS_LABELS[s]}</option>)}
                    </select>
                    <button onClick={() => remove(e.id)} disabled={busyId === e.id} title="Remove"
                      className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[18px]">{busyId === e.id ? "progress_activity" : "delete"}</span>
                    </button>
                  </div>
                  <span className="text-label-sm font-label-sm text-outline">{new Date(e.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
