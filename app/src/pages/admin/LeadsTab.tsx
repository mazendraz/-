import { useState } from "react";
import { type Lead, type LeadStatus, LEAD_STATUSES, STATUS_COLORS, LEAD_STATUS_KEYS } from "../../lib/requests";
import { ModalShell } from "./components/ModalShell";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { formatDate, formatDateTime } from "../../lib/format";

// Column order is the table's; the trailing empty header is the actions column.
const LEAD_COLUMNS: (StringKey | null)[] = [
  "admin_lead_ref", "admin_lead_customer", "admin_lead_company", "admin_lead_service",
  "admin_lead_district", "admin_lead_status", "admin_lead_date", null,
];

// ══════════════════════════════════════════════════════════════════════════
//  LEAD TABLE + MODAL (preserved)
// ══════════════════════════════════════════════════════════════════════════
// Mobile lead card — tap to open the full detail modal
export function LeadMobileCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  const { locale } = useLocale();
  return (
    <button onClick={() => onOpen(lead)} className="w-full text-left bg-surface-container-lowest rounded-2xl shadow-bloom p-4 active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="font-mono text-[12px] text-primary font-bold">{lead.refNumber}</span>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[lead.status]}`}>{t(locale, LEAD_STATUS_KEYS[lead.status])}</span>
      </div>
      <p className="font-bold text-[15px] text-on-surface leading-tight">{lead.name}</p>
      <p className="text-[13px] text-outline mb-2.5">{lead.phone}</p>
      <div className="flex items-center gap-1.5 text-[12px] text-on-surface-variant flex-wrap">
        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-outline">business</span>{lead.companyName}</span>
        <span className="text-outline-variant">·</span>
        <span>{lead.district}</span>
        <span className="text-outline-variant">·</span>
        <span className="text-outline">{formatDate(lead.createdAt, locale)}</span>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/15">
        <span className="text-[12px] text-outline truncate">{lead.service}</span>
        <span className="text-[12px] font-bold text-primary flex items-center gap-0.5 flex-shrink-0">{t(locale, "admin_lead_details")} <span className="material-symbols-outlined text-[15px]">chevron_right</span></span>
      </div>
    </button>
  );
}

export function LeadTable({ leads, onOpen, onStatusChange }: {
  leads: Lead[]; onOpen: (l: Lead) => void; onStatusChange: (id: string, s: LeadStatus) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant/20 text-left">
            {LEAD_COLUMNS.map((key, i) => (
              <th key={key ?? i} className="px-4 py-3 text-[12px] font-bold text-outline whitespace-nowrap">{key ? t(locale, key) : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
              <td className="px-4 py-3 font-mono text-[12px] text-primary whitespace-nowrap">{l.refNumber}</td>
              <td className="px-4 py-3"><div className="font-bold text-on-surface">{l.name}</div><div className="text-outline text-[12px]">{l.phone}</div></td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{l.companyName}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap max-w-[140px] truncate">{l.service}</td>
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{l.district}</td>
              <td className="px-4 py-3">
                <select value={l.status} onChange={(e) => onStatusChange(l.id, e.target.value as LeadStatus)} onClick={(e) => e.stopPropagation()}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-bold border-none focus:outline-none cursor-pointer ${STATUS_COLORS[l.status]}`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-outline text-[12px] whitespace-nowrap">{formatDate(l.createdAt, locale)}</td>
              <td className="px-4 py-3"><button onClick={() => onOpen(l)} className="text-primary text-[12px] font-bold hover:underline whitespace-nowrap">{t(locale, "admin_lead_details")}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeadModal({ lead, onClose, onStatusChange, onDelete }: {
  lead: Lead; onClose: () => void; onStatusChange: (id: string, s: LeadStatus) => void; onDelete: (id: string) => void;
}) {
  const { locale } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <ModalShell title={lead.refNumber} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="block text-[12px] font-bold text-outline mb-1.5">{t(locale, "admin_lead_status")}</label>
          <select value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)} className="field-input">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t(locale, LEAD_STATUS_KEYS[s])}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label={t(locale, "admin_lead_name")} val={lead.name} /><InfoField label={t(locale, "admin_lead_phone")} val={lead.phone} />
          <InfoField label={t(locale, "admin_lead_company")} val={lead.companyName} /><InfoField label={t(locale, "admin_lead_service")} val={lead.service} />
          <InfoField label={t(locale, "admin_lead_district")} val={lead.district} /><InfoField label={t(locale, "admin_lead_budget")} val={lead.budget} />
          <InfoField label={t(locale, "admin_lead_date")} val={formatDateTime(lead.createdAt, locale)} span={2} />
        </div>
        <div>
          <p className="text-[12px] font-bold text-outline mb-1.5">{t(locale, "admin_lead_description")}</p>
          <div className="bg-surface-container rounded-xl p-4 text-[14px] text-on-surface leading-relaxed">{lead.description || <span className="text-outline italic">{t(locale, "admin_lead_no_description")}</span>}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-[14px] hover:bg-error/5 transition-colors">{t(locale, "admin_lead_delete")}</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-[14px] text-on-surface mb-3">{t(locale, "admin_lead_delete_confirm")}</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(lead.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-[14px]">{t(locale, "admin_delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-[14px]">{t(locale, "admin_confirm_cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export function InfoField({ label, val, span = 1 }: { label: string; val: string; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <p className="text-[12px] font-bold text-outline mb-0.5">{label}</p>
      <p className="text-[14px] text-on-surface">{val}</p>
    </div>
  );
}
