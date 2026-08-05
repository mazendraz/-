import { useState } from "react";
import { type Lead, type LeadStatus, LEAD_STATUSES, STATUS_COLORS, LEAD_STATUS_KEYS } from "../../lib/requests";
import {
  type WaitlistEntry, type WaitlistStatus,
  WAITLIST_STATUSES, WAITLIST_STATUS_KEYS, WAITLIST_STATUS_COLORS,
} from "../../lib/availability";
import Modal from "../../components/Modal";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { formatDate, formatDateTime } from "../../lib/format";
import Icon from "../../components/Icon";

// Column order is the table's; the trailing empty header is the actions column.
const LEAD_COLUMNS: (StringKey | null)[] = [
  "admin_lead_ref", "admin_lead_customer", "admin_lead_company", "admin_lead_service",
  "admin_lead_district", "admin_lead_status", "admin_lead_date", null,
];

/**
 * One row in the merged Leads view — a real lead or a waiting-list join that
 * joined while the company was busy. Tagged so the table/cards below can render
 * each with its own status vocabulary/color while sharing one list and one sort
 * order (see admin/index.tsx and ProviderDashboard.tsx, which build this array).
 */
export type LeadListRow =
  | { kind: "lead"; data: Lead }
  | { kind: "waitlist"; data: WaitlistEntry };

// ══════════════════════════════════════════════════════════════════════════
//  LEAD TABLE + MODAL (preserved)
// ══════════════════════════════════════════════════════════════════════════
// Mobile lead card — tap to open the full detail modal
export function LeadMobileCard({ row, onOpen }: { row: LeadListRow; onOpen: (r: LeadListRow) => void }) {
  const { locale } = useLocale();
  if (row.kind === "waitlist") {
    const e = row.data;
    return (
      <button onClick={() => onOpen(row)} className="w-full text-start bg-surface-container-lowest rounded-2xl shadow-bloom p-4 active:scale-[0.99] transition-transform">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="flex items-center gap-1 text-caption font-bold text-amber-700">
            <Icon name="hourglass_top" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
            {t(locale, "common_kind_waitlist")}
          </span>
          <span className={`text-caption font-bold px-2.5 py-1 rounded-full ${WAITLIST_STATUS_COLORS[e.status]}`}>{t(locale, WAITLIST_STATUS_KEYS[e.status])}</span>
        </div>
        <p className="font-bold text-body text-on-surface leading-tight">{e.name}</p>
        <p className="text-label text-outline mb-2.5">{e.phone}</p>
        <div className="flex items-center gap-1.5 text-caption text-on-surface-variant flex-wrap">
          <span className="flex items-center gap-1"><Icon name="business" className="text-label text-outline" />{e.companyName}</span>
          <span className="text-outline-variant">·</span>
          <span className="text-outline">{formatDate(e.createdAt, locale)}</span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/15">
          <span className="text-caption text-outline truncate">{e.service ?? ""}</span>
          <span className="text-caption font-bold text-primary flex items-center gap-0.5 flex-shrink-0">{t(locale, "admin_lead_details")} <Icon name="chevron_right" className="text-body" /></span>
        </div>
      </button>
    );
  }
  const lead = row.data;
  return (
    <button onClick={() => onOpen(row)} className="w-full text-start bg-surface-container-lowest rounded-2xl shadow-bloom p-4 active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="font-mono text-caption text-primary font-bold">{lead.refNumber}</span>
        <span className={`text-caption font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[lead.status]}`}>{t(locale, LEAD_STATUS_KEYS[lead.status])}</span>
      </div>
      <p className="font-bold text-body text-on-surface leading-tight">{lead.name}</p>
      <p className="text-label text-outline mb-2.5">{lead.phone}</p>
      <div className="flex items-center gap-1.5 text-caption text-on-surface-variant flex-wrap">
        <span className="flex items-center gap-1"><Icon name="business" className="text-label text-outline" />{lead.companyName}</span>
        <span className="text-outline-variant">·</span>
        <span>{lead.district}</span>
        <span className="text-outline-variant">·</span>
        <span className="text-outline">{formatDate(lead.createdAt, locale)}</span>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/15">
        <span className="text-caption text-outline truncate">{lead.service}</span>
        <span className="text-caption font-bold text-primary flex items-center gap-0.5 flex-shrink-0">{t(locale, "admin_lead_details")} <Icon name="chevron_right" className="text-body" /></span>
      </div>
    </button>
  );
}

export function LeadTable({ rows, onOpen, onLeadStatusChange, onWaitlistStatusChange }: {
  rows: LeadListRow[];
  onOpen: (r: LeadListRow) => void;
  onLeadStatusChange: (id: string, s: LeadStatus) => void;
  onWaitlistStatusChange: (entry: WaitlistEntry, s: WaitlistStatus) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant/20 text-start">
            {LEAD_COLUMNS.map((key, i) => (
              <th key={key ?? i} className="px-4 py-3 text-caption font-bold text-outline whitespace-nowrap">{key ? t(locale, key) : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => row.kind === "waitlist" ? (
            <tr key={`w-${row.data.id}`} className="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3">
                <span className="flex items-center gap-1 text-caption font-bold text-amber-700 whitespace-nowrap">
                  <Icon name="hourglass_top" className="text-body" style={{ fontVariationSettings: "'FILL' 1" }} />
                  {t(locale, "common_kind_waitlist")}
                </span>
              </td>
              <td className="px-4 py-3"><div className="font-bold text-on-surface">{row.data.name}</div><div className="text-outline text-caption">{row.data.phone}</div></td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{row.data.companyName}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap max-w-[140px] truncate">{row.data.service ?? "—"}</td>
              <td className="px-4 py-3 text-outline whitespace-nowrap">—</td>
              <td className="px-4 py-3">
                <select value={row.data.status} onChange={(e) => onWaitlistStatusChange(row.data, e.target.value as WaitlistStatus)} onClick={(e) => e.stopPropagation()}
                  className={`rounded-full px-2.5 py-1 text-caption font-bold border-none focus:outline-none cursor-pointer ${WAITLIST_STATUS_COLORS[row.data.status]}`}>
                  {WAITLIST_STATUSES.map((s) => <option key={s} value={s}>{t(locale, WAITLIST_STATUS_KEYS[s])}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-outline text-caption whitespace-nowrap">{formatDate(row.data.createdAt, locale)}</td>
              <td className="px-4 py-3"><button onClick={() => onOpen(row)} className="text-primary text-caption font-bold hover:underline whitespace-nowrap">{t(locale, "admin_lead_details")}</button></td>
            </tr>
          ) : (
            <tr key={`l-${row.data.id}`} className="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3 font-mono text-caption text-primary whitespace-nowrap">{row.data.refNumber}</td>
              <td className="px-4 py-3"><div className="font-bold text-on-surface">{row.data.name}</div><div className="text-outline text-caption">{row.data.phone}</div></td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{row.data.companyName}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap max-w-[140px] truncate">{row.data.service}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{row.data.district}</td>
              <td className="px-4 py-3">
                <select value={row.data.status} onChange={(e) => onLeadStatusChange(row.data.id, e.target.value as LeadStatus)} onClick={(e) => e.stopPropagation()}
                  className={`rounded-full px-2.5 py-1 text-caption font-bold border-none focus:outline-none cursor-pointer ${STATUS_COLORS[row.data.status]}`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-outline text-caption whitespace-nowrap">{formatDate(row.data.createdAt, locale)}</td>
              <td className="px-4 py-3"><button onClick={() => onOpen(row)} className="text-primary text-caption font-bold hover:underline whitespace-nowrap">{t(locale, "admin_lead_details")}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeadModal({ lead, onClose, onStatusChange, onDelete }: {
  lead: Lead; onClose: () => void; onStatusChange: (id: string, s: LeadStatus) => void;
  /** Omit to hide the delete affordance entirely. The provider dashboard
   * (DM-03) reuses this modal but has no lead-delete capability — deleting
   * another party's lead is an admin action, and rendering a dead button (or
   * quietly granting the permission) would both be wrong. */
  onDelete?: (id: string) => void;
}) {
  const { locale } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal title={lead.refNumber} onClose={onClose}>
      <div className="p-5">
      <div className="space-y-5">
        <div>
          <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "admin_lead_status")}</label>
          <select value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)} className="field-input">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label={t(locale, "admin_lead_name")} val={lead.name} /><InfoField label={t(locale, "admin_lead_phone")} val={lead.phone} />
          <InfoField label={t(locale, "admin_lead_company")} val={lead.companyName} /><InfoField label={t(locale, "admin_lead_service")} val={lead.service} />
          <InfoField label={t(locale, "admin_lead_district")} val={lead.district} /><InfoField label={t(locale, "admin_lead_budget")} val={lead.budget || "—"} />
          <InfoField label={t(locale, "admin_lead_date")} val={formatDateTime(lead.createdAt, locale)} span={2} />
        </div>
        <div>
          <p className="text-caption font-bold text-outline mb-1.5">{t(locale, "admin_lead_description")}</p>
          <div className="bg-surface-container rounded-xl p-4 text-label text-on-surface leading-relaxed">{lead.description || <span className="text-outline italic">{t(locale, "admin_lead_no_description")}</span>}</div>
        </div>
        {!onDelete ? null : !confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-label hover:bg-error/5 transition-colors">{t(locale, "admin_lead_delete")}</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-label text-on-surface mb-3">{t(locale, "admin_lead_delete_confirm")}</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(lead.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-label">{t(locale, "admin_delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-label">{t(locale, "admin_confirm_cancel")}</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  WAITLIST DETAIL MODAL — smaller sibling of LeadModal for a "waitlist" row.
//  No ref/district/budget/description: a waitlist join never collected those.
// ══════════════════════════════════════════════════════════════════════════
export function WaitlistDetailModal({ entry, onClose, onStatusChange, onDelete }: {
  entry: WaitlistEntry;
  onClose: () => void;
  onStatusChange: (id: string, s: WaitlistStatus) => void;
  onDelete: (id: string) => void;
}) {
  const { locale } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal title={t(locale, "common_kind_waitlist")} onClose={onClose}>
      <div className="p-5">
      <div className="space-y-5">
        <div>
          <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "admin_lead_status")}</label>
          <select value={entry.status} onChange={(e) => onStatusChange(entry.id, e.target.value as WaitlistStatus)} className="field-input">
            {WAITLIST_STATUSES.map((s) => <option key={s} value={s}>{t(locale, WAITLIST_STATUS_KEYS[s])}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label={t(locale, "admin_lead_name")} val={entry.name} /><InfoField label={t(locale, "admin_lead_phone")} val={entry.phone} />
          <InfoField label={t(locale, "admin_lead_company")} val={entry.companyName} /><InfoField label={t(locale, "waitlist_service")} val={entry.service || "—"} />
          <InfoField label={t(locale, "admin_lead_date")} val={formatDateTime(entry.createdAt, locale)} span={2} />
        </div>
        <div>
          <p className="text-caption font-bold text-outline mb-1.5">{t(locale, "waitlist_note")}</p>
          <div className="bg-surface-container rounded-xl p-4 text-label text-on-surface leading-relaxed">{entry.note || <span className="text-outline italic">{t(locale, "admin_lead_no_description")}</span>}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-label hover:bg-error/5 transition-colors">{t(locale, "admin_lead_delete")}</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-label text-on-surface mb-3">{t(locale, "admin_lead_delete_confirm")}</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(entry.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-label">{t(locale, "admin_delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-label">{t(locale, "admin_confirm_cancel")}</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </Modal>
  );
}

export function InfoField({ label, val, span = 1 }: { label: string; val: string; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <p className="text-caption font-bold text-outline mb-0.5">{label}</p>
      <p className="text-label text-on-surface">{val}</p>
    </div>
  );
}
