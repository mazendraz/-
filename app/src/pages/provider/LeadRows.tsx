import { type LeadStatus, LEAD_STATUSES, LEAD_STATUS_KEYS, STATUS_COLORS } from "../../lib/requests";
import {
  WAITLIST_STATUSES, WAITLIST_STATUS_KEYS, WAITLIST_STATUS_COLORS,
  type WaitlistEntry, type WaitlistStatus,
} from "../../lib/availability";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import { formatDate } from "../../lib/format";
import Icon from "../../components/Icon";
import Select from "../../components/Select";
import type { LeadListRow } from "../admin/LeadsTab";

const ROW_SELECT_TRIGGER = "border border-outline-variant rounded-lg px-2.5 py-1 min-h-[44px] text-caption text-on-surface bg-surface flex items-center gap-1.5 touch-press focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/**
 * The provider's DESKTOP lead row — status select and date inline beside the
 * lead's details. Below `lg:` the Overview and Leads tabs render admin's
 * `LeadMobileCard` instead (DM-03): this layout needs ~110px of
 * non-shrinking controls, which left about 224px for everything else at 390px.
 *
 * Lifted out of ProviderDashboard.tsx when the tabs became routes (DM-02) —
 * Overview and Leads are separate chunks now and both need it.
 */
export default function LeadRows({ rows, onLeadStatusChange, onWaitlistStatusChange, onWaitlistDelete }: {
  rows: LeadListRow[];
  onLeadStatusChange: (id: string, s: LeadStatus) => void;
  onWaitlistStatusChange: (entry: WaitlistEntry, s: WaitlistStatus) => void;
  onWaitlistDelete: (entry: WaitlistEntry) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="divide-y divide-outline-variant/10">
      {rows.map((row) => row.kind === "waitlist" ? (
        <div key={`w-${row.data.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="flex items-center gap-1 text-caption font-bold text-amber-700">
                <Icon name="hourglass_top" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                {t(locale, "common_kind_waitlist")}
              </span>
              <span className={`text-caption px-2 py-0.5 rounded-full ${WAITLIST_STATUS_COLORS[row.data.status]}`}>{t(locale, WAITLIST_STATUS_KEYS[row.data.status])}</span>
            </div>
            <p className=" text-label text-on-surface">{row.data.name} — {row.data.phone}</p>
            <p className="text-caption text-outline">{row.data.service ?? ""}</p>
            {row.data.note && (
              <p className="text-on-surface-variant text-sm mt-1 line-clamp-2">{row.data.note}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              {/* DM-06b: every one of these was an unnamed combo box — axe
                  reported `select-name` (critical) ×13 on one page. Naming it
                  after the person it belongs to is what makes a list of them
                  navigable by screen reader. DM-06: was 35px tall. */}
              <Select
                className="!w-auto"
                triggerClassName={ROW_SELECT_TRIGGER}
                value={row.data.status}
                ariaLabel={`${t(locale, "admin_lead_status")} — ${row.data.name}`}
                onChange={(v) => onWaitlistStatusChange(row.data, v as WaitlistStatus)}
                options={WAITLIST_STATUSES.map((s) => ({ value: s, label: t(locale, WAITLIST_STATUS_KEYS[s]) }))}
              />
              {/* DM-06: was 36×42. */}
              <button onClick={() => onWaitlistDelete(row.data)} title={t(locale, "prov_wl_remove")}
                aria-label={`${t(locale, "prov_wl_remove")} — ${row.data.name}`}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-outline hover:text-error hover:bg-error/5 transition-colors">
                <Icon name="delete" className="text-subhead" />
              </button>
            </div>
            <span className="text-caption text-outline">{formatDate(row.data.createdAt, locale)}</span>
          </div>
        </div>
      ) : (
        <div key={`l-${row.data.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-container/50 transition-colors flex-wrap">
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono text-caption text-primary">{row.data.refNumber}</span>
              <span className={`text-caption px-2 py-0.5 rounded-full ${STATUS_COLORS[row.data.status]}`}>{t(locale, LEAD_STATUS_KEYS[row.data.status])}</span>
            </div>
            <p className=" text-label text-on-surface">{row.data.name} — {row.data.phone}</p>
            <p className="text-caption text-outline">
              {[row.data.service, row.data.district, row.data.budget].filter(Boolean).join(" · ")}
            </p>
            {row.data.description && (
              <p className="text-on-surface-variant text-sm mt-1 line-clamp-2">{row.data.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {/* DM-06b + DM-06 — see the waitlist select above. */}
            <Select
              className="!w-auto"
              triggerClassName={ROW_SELECT_TRIGGER}
              value={row.data.status}
              ariaLabel={`${t(locale, "admin_lead_status")} — ${row.data.refNumber}`}
              onChange={(v) => onLeadStatusChange(row.data.id, v as LeadStatus)}
              options={LEAD_STATUSES.map((s) => ({ value: s, label: t(locale, LEAD_STATUS_KEYS[s]) }))}
            />
            <span className="text-caption text-outline">{formatDate(row.data.createdAt, locale)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
