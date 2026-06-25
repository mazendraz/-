import { useState } from "react";
import { Link } from "react-router-dom";
import { useMyLeads, submitReview, type Lead, type LeadStatus } from "../lib/requests";
import { getCompany } from "../lib/catalog";
import PersonalTabs from "../components/PersonalTabs";
import SearchInput from "../components/SearchInput";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

const STATUS_STYLE: Record<LeadStatus, { bg: string; text: string; icon: string; labelKey: StringKey }> = {
  New: { bg: "bg-blue-100", text: "text-blue-700", icon: "schedule", labelKey: "requests_status_received" },
  Contacted: { bg: "bg-yellow-100", text: "text-yellow-700", icon: "call", labelKey: "requests_status_contacted" },
  "In Progress": { bg: "bg-orange-100", text: "text-orange-700", icon: "engineering", labelKey: "requests_status_in_progress" },
  Completed: { bg: "bg-green-100", text: "text-green-700", icon: "check_circle", labelKey: "requests_status_completed" },
  Cancelled: { bg: "bg-surface-container", text: "text-outline", icon: "cancel", labelKey: "requests_status_cancelled" },
};

const FILTERS: { key: LeadStatus | "All"; labelKey: StringKey }[] = [
  { key: "All", labelKey: "requests_filter_all" },
  { key: "New", labelKey: "requests_status_received" },
  { key: "Contacted", labelKey: "requests_status_contacted" },
  { key: "In Progress", labelKey: "requests_status_in_progress" },
  { key: "Completed", labelKey: "requests_status_completed" },
  { key: "Cancelled", labelKey: "requests_status_cancelled" },
];

export default function MyRequests() {
  const all = useMyLeads();
  usePageMeta("My Requests | Al Assema", "Track your service requests and see their current status.");
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All");
  const [reviewing, setReviewing] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const leads = all.filter((l) => {
    const matchStatus = statusFilter === "All" || l.status === statusFilter;
    const matchQuery = !q || [l.refNumber, l.companyName, l.service, l.district].some((v) => v.toLowerCase().includes(q));
    return matchStatus && matchQuery;
  });

  return (
    <div className="bg-surface min-h-screen pt-20 md:pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-5">

        {/* Header */}
        <PersonalTabs active="requests" />
        <div className="mb-5">
          <h1 className="font-black text-[26px] md:text-headline-lg text-on-surface tracking-tight mb-1">{t(locale, "requests_title")}</h1>
          <p className="text-[14px] text-outline">
            {t(locale, "requests_sub")}
          </p>
        </div>

        {/* Search + status filter */}
        {all.length > 0 && (
          <div className="mb-6 space-y-3">
            <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_requests_placeholder")} />
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-colors border ${
                    statusFilter === f.key ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
                  }`}>
                  {t(locale, f.labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {all.length === 0 ? (
          /* Empty state */
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-primary text-[34px]">receipt_long</span>
            </div>
            <h2 className="font-bold text-[18px] text-on-surface mb-1.5">{t(locale, "requests_empty_title")}</h2>
            <p className="text-[14px] text-outline mb-6 max-w-xs mx-auto leading-relaxed">
              {t(locale, "requests_empty_sub")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/services" className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">
                {t(locale, "nav_browse_services")}
              </Link>
              <Link to="/companies" className="bg-surface-container text-on-surface px-6 py-3 rounded-xl font-bold text-[14px] hover:bg-surface-container-high transition-colors touch-press">
                {t(locale, "common_view_companies")}
              </Link>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-outline/50 text-[40px] mb-2 block">search_off</span>
            <p className="text-[14px] text-outline">{t(locale, "requests_none_match")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => {
              const company = getCompany(lead.companySlug);
              const st = STATUS_STYLE[lead.status];
              return (
                <div key={lead.id} className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden card-lift">
                  {/* Top row */}
                  <div className="flex items-center gap-3 p-4 border-b border-outline-variant/15">
                    {company ? (
                      <img src={company.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary text-[20px]">business</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[15px] text-on-surface truncate">{lead.companyName}</p>
                      <p className="text-[12px] text-outline truncate">{lead.service}</p>
                    </div>
                    <span className={`flex items-center gap-1 ${st.bg} ${st.text} px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0`}>
                      <span className="material-symbols-outlined text-[13px]">{st.icon}</span>
                      {t(locale, st.labelKey)}
                    </span>
                  </div>

                  {/* Detail row */}
                  <div className="p-4 grid grid-cols-2 gap-y-2.5 gap-x-4">
                    <Detail icon="tag" label={t(locale, "requests_ref")} val={lead.refNumber} mono />
                    <Detail icon="calendar_today" label={t(locale, "requests_submitted")} val={new Date(lead.createdAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")} />
                    <Detail icon="location_on" label={t(locale, "requests_district")} val={lead.district} />
                    <Detail icon="payments" label={t(locale, "requests_budget")} val={lead.budget} />
                  </div>

                  {/* Footer actions */}
                  {(company || lead.status === "Completed") && (
                    <div className="px-4 pb-4 flex flex-col gap-2">
                      {/* Verified-review prompt for completed requests */}
                      {lead.status === "Completed" && (
                        lead.reviewed ? (
                          <div className="w-full flex items-center justify-center gap-1.5 bg-green-50 text-green-700 py-2.5 rounded-xl text-[13px] font-bold">
                            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                            {t(locale, "requests_reviewed")}
                          </div>
                        ) : (
                          <button
                            onClick={() => setReviewing(lead)}
                            className="w-full flex items-center justify-center gap-1.5 bg-primary text-on-primary hover:bg-primary-container transition-colors py-2.5 rounded-xl text-[13px] font-bold touch-press btn-press"
                          >
                            <span className="material-symbols-outlined text-[16px]">rate_review</span>
                            {t(locale, "requests_review_cta")}
                          </button>
                        )
                      )}
                      {company && (
                        <Link
                          to={`/companies/${company.slug}`}
                          className="w-full flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors py-2.5 rounded-xl text-[13px] font-bold text-on-surface touch-press"
                        >
                          {t(locale, "requests_view")} {company.name}
                          <span className="material-symbols-outlined text-[15px] rtl-flip">arrow_forward</span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Info note */}
            <div className="flex items-start gap-3 bg-primary/6 border border-primary/18 rounded-xl p-4">
              <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
              <p className="text-[13px] text-on-surface-variant leading-relaxed">
                {t(locale, "requests_note")}
              </p>
            </div>
          </div>
        )}
      </div>

      {reviewing && (
        <ReviewModal lead={reviewing} locale={locale} onClose={() => setReviewing(null)} />
      )}
    </div>
  );
}

function ReviewModal({ lead, locale, onClose }: { lead: Lead; locale: "en" | "ar"; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating < 1 || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await submitReview(lead.refNumber, lead.phone, rating, text.trim());
      setDone(true);
      setTimeout(onClose, 1400);
    } catch {
      setError(t(locale, "lead_review_error"));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="bg-surface-container-lowest w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-6">
        {done ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-green-600 text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <p className="font-bold text-[17px] text-on-surface">{t(locale, "lead_review_thanks")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-bold text-[18px] text-on-surface">{t(locale, "lead_review_title")}</h2>
              <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>
            <p className="text-[13px] text-outline mb-1">{lead.companyName}</p>
            <p className="text-[13px] text-on-surface-variant mb-5">{t(locale, "lead_review_sub")}</p>

            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "lead_review_rating")}</label>
            <div className="flex items-center gap-1 mb-5" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" onClick={() => setRating(i)} onMouseEnter={() => setHover(i)}
                  className="p-0.5 touch-press" aria-label={`${i} star${i > 1 ? "s" : ""}`}>
                  <span className="material-symbols-outlined text-secondary text-[32px]"
                    style={{ fontVariationSettings: i <= (hover || rating) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
              ))}
            </div>

            <label className="block text-[13px] font-bold text-on-surface mb-1.5">{t(locale, "lead_review_text_label")}</label>
            <textarea
              className="field-input resize-none w-full" rows={4} maxLength={2000}
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t(locale, "lead_review_text_ph")}
            />

            {error && <p className="text-[13px] text-error font-medium bg-error/8 rounded-lg px-3 py-2 mt-3">{error}</p>}

            <button
              onClick={submit} disabled={busy || rating < 1 || !text.trim()}
              className="w-full mt-5 bg-primary text-on-primary py-3 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? t(locale, "lead_review_submitting") : t(locale, "lead_review_submit")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ icon, label, val, mono }: { icon: string; label: string; val: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-outline text-[16px] flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-outline uppercase tracking-wider font-bold leading-none mb-0.5">{label}</p>
        <p className={`text-[13px] text-on-surface font-bold truncate ${mono ? "font-mono" : ""}`}>{val}</p>
      </div>
    </div>
  );
}
