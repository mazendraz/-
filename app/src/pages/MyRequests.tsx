import { useState } from "react";
import Modal from "../components/Modal";
import { formatPrice } from "../lib/pricing";
import { chatAvailable } from "../lib/chat";
import { Link } from "react-router-dom";
import { useMyLeads, submitReview, type Lead, type LeadStatus } from "../lib/requests";
import { useMyWaitlistEntries, WAITLIST_STATUS_COLORS, WAITLIST_STATUS_KEYS, type WaitlistEntry } from "../lib/availability";
import { getCompany } from "../lib/catalog";
import PersonalTabs from "../components/PersonalTabs";
import SearchInput from "../components/SearchInput";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey, type Locale } from "../lib/i18n";
import Captcha from "../components/Captcha";
import { captchaConfigured } from "../lib/captcha";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";

const STATUS_STYLE: Record<LeadStatus, { bg: string; text: string; icon: string; labelKey: StringKey }> = {
  New: { bg: "bg-blue-100", text: "text-blue-700", icon: "schedule", labelKey: "requests_status_received" },
  Contacted: { bg: "bg-yellow-100", text: "text-yellow-700", icon: "call", labelKey: "requests_status_contacted" },
  "In Progress": { bg: "bg-orange-100", text: "text-orange-700", icon: "engineering", labelKey: "requests_status_in_progress" },
  Completed: { bg: "bg-green-100", text: "text-green-700", icon: "check_circle", labelKey: "requests_status_completed" },
  Cancelled: { bg: "bg-surface-container", text: "text-outline", icon: "cancel", labelKey: "requests_status_cancelled" },
};

type RequestFilter = LeadStatus | "All" | "Waitlist";

const FILTERS: { key: RequestFilter; labelKey: StringKey }[] = [
  { key: "All", labelKey: "requests_filter_all" },
  { key: "New", labelKey: "requests_status_received" },
  { key: "Contacted", labelKey: "requests_status_contacted" },
  { key: "In Progress", labelKey: "requests_status_in_progress" },
  { key: "Completed", labelKey: "requests_status_completed" },
  { key: "Cancelled", labelKey: "requests_status_cancelled" },
  { key: "Waitlist", labelKey: "requests_filter_waitlist" },
];

/** One row in the merged "My Requests" list — a real request or a waiting-list join. */
type RequestItem =
  | { kind: "lead"; data: Lead }
  | { kind: "waitlist"; data: WaitlistEntry };

export default function MyRequests() {
  const myLeads = useMyLeads();
  const myWaitlist = useMyWaitlistEntries();
  // Merged, newest first — a waiting-list join shows up right alongside real
  // requests instead of being invisible to the customer who submitted it.
  const all: RequestItem[] = [
    ...myLeads.map((data) => ({ kind: "lead", data }) as const),
    ...myWaitlist.map((data) => ({ kind: "waitlist", data }) as const),
  ].sort((a, b) => b.data.createdAt - a.data.createdAt);
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "meta_myrequests_title")} | ${t(locale, "brand_name")}`, t(locale, "meta_myrequests_desc"));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestFilter>("All");
  const [reviewing, setReviewing] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const items = all.filter((item) => {
    if (statusFilter === "Waitlist") return item.kind === "waitlist";
    if (statusFilter !== "All" && item.kind === "waitlist") return false;
    const matchStatus = statusFilter === "All" || (item.kind === "lead" && item.data.status === statusFilter);
    const searchable = item.kind === "lead"
      ? [item.data.refNumber, item.data.companyName, item.data.service, item.data.district]
      : [item.data.companyName, item.data.service ?? "", item.data.note ?? ""];
    const matchQuery = !q || searchable.some((v) => v.toLowerCase().includes(q));
    return matchStatus && matchQuery;
  });

  return (
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-5">

        {/* Header */}
        <PersonalTabs active="requests" />
        <div className="mb-5">
          <h1 className="font-black text-headline md:text-display text-on-surface tracking-tight mb-1">{t(locale, "requests_title")}</h1>
          <p className="text-label text-outline">
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
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-label font-bold transition-colors border ${
                    statusFilter === f.key ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"
                  }`}>
                  {t(locale, f.labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {all.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            {/* Two CTAs here (browse services / view companies) — EmptyState's
                `action`/`actionHref` only cover the single-button case, so the
                shared component supplies the icon/title/body and this one keeps
                its own footer rather than forcing a second-action prop onto
                every other call site for one page. */}
            <EmptyState icon="receipt_long" title={t(locale, "requests_empty_title")} msg={t(locale, "requests_empty_sub")} className="pb-0" />
            <div className="flex flex-col sm:flex-row gap-3 justify-center pb-10 px-10">
              <Link to="/services" className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press">
                {t(locale, "nav_browse_services")}
              </Link>
              <Link to="/companies" className="bg-surface-container text-on-surface px-6 py-3 rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press">
                {t(locale, "common_view_companies")}
              </Link>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12" role="status" aria-live="polite" aria-atomic="true">
            <Icon name="search_off" className="text-outline/50 text-[40px] mb-2 block" />
            <p className="text-label text-outline">{t(locale, "requests_none_match")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => item.kind === "lead"
              ? <LeadRequestCard key={`lead-${item.data.id}`} lead={item.data} locale={locale} onReview={setReviewing} />
              : <WaitlistRequestCard key={`waitlist-${item.data.id}`} entry={item.data} locale={locale} />)}

            {/* Info note */}
            <div className="flex items-start gap-3 bg-primary/6 border border-primary/18 rounded-xl p-4">
              <Icon name="info" className="text-primary text-subhead flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="text-label text-on-surface-variant leading-relaxed">
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

// ── A real service request ───────────────────────────────────────────────────
function LeadRequestCard({ lead, locale, onReview }: { lead: Lead; locale: Locale; onReview: (l: Lead) => void }) {
  const company = getCompany(lead.companySlug);
  const st = STATUS_STYLE[lead.status];
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden card-lift">
      {/* Top row */}
      <div className="flex items-center gap-3 p-4 border-b border-outline-variant/15">
        {company ? (
          <img src={company.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" width={44} height={44} />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="business" className="text-primary text-title" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-body text-on-surface truncate">{lead.companyName}</p>
          <p className="text-caption text-outline truncate">{lead.service}</p>
        </div>
        <span className={`flex items-center gap-1 ${st.bg} ${st.text} px-2.5 py-1 rounded-full text-caption font-bold flex-shrink-0`}>
          <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{st.icon}</span>
          {t(locale, st.labelKey)}
        </span>
      </div>

      {/* Itemised lines + estimate. Every number here is the SNAPSHOT
          taken when the request was sent — it does not move if the
          provider changes their prices afterwards. */}
      {(lead.items?.length ?? 0) > 0 && (
        <div className="px-4 pt-3">
          <div className="rounded-xl bg-surface-container p-3 space-y-1.5">
            {lead.items!.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-label">
                <span className="text-on-surface-variant truncate">
                  {item.nameSnapshot}
                  {item.tierLabel ? ` · ${item.tierLabel}` : ""}
                  {item.qty > 1 ? ` ×${item.qty}` : ""}
                </span>
                <span className="text-on-surface font-bold flex-shrink-0">
                  {item.lineMin == null
                    ? (locale === "ar" ? "بعد المعاينة" : "On inspection")
                    : formatPrice(
                        { pricingModel: item.lineMax != null && item.lineMax !== item.lineMin ? "RANGE" : "FIXED",
                          priceMin: item.lineMin, priceMax: item.lineMax, unit: null },
                        locale,
                      )}
                </span>
              </div>
            ))}

            <div className="border-t border-outline-variant/20 pt-1.5 mt-1.5 flex items-center justify-between gap-2">
              <span className="text-caption font-bold text-outline">
                {locale === "ar" ? "الإجمالي التقديري" : "Estimated total"}
              </span>
              <span className="font-display font-black text-body text-primary">
                {lead.estimatedMin == null
                  ? (locale === "ar" ? "يتحدد بعد المعاينة" : "Quoted after inspection")
                  : formatPrice(
                      { pricingModel: lead.estimatedMax != null && lead.estimatedMax !== lead.estimatedMin ? "RANGE" : "FIXED",
                        priceMin: lead.estimatedMin, priceMax: lead.estimatedMax ?? null, unit: null },
                      locale,
                    )}
              </span>
            </div>

            {(lead.discountPercent ?? 0) > 0 && (
              <p className="text-caption text-primary font-bold">
                {locale === "ar"
                  ? `خصم الباقة ${lead.discountPercent}٪ (على البنود المسعّرة)`
                  : `Bundle discount ${lead.discountPercent}% (on priced items)`}
              </p>
            )}
            {lead.hasOnInspection && (
              <p className="text-caption text-outline">
                {locale === "ar" ? "+ بنود تتحدد بعد المعاينة" : "+ items quoted on site"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Detail row */}
      <div className="p-4 grid grid-cols-2 gap-y-2.5 gap-x-4">
        <Detail icon="tag" label={t(locale, "requests_ref")} val={lead.refNumber} mono />
        <Detail icon="calendar_today" label={t(locale, "requests_submitted")} val={new Date(lead.createdAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")} />
        <Detail icon="location_on" label={t(locale, "requests_district")} val={lead.district} />
        {lead.budget && <Detail icon="payments" label={t(locale, "requests_budget")} val={lead.budget} />}
      </div>

      {/* Conversation with the company. The thread itself lives on
          /messages now — keeping a second copy inline meant a reply
          was only ever discoverable by expanding each request one at
          a time, with nothing polling while they were collapsed. */}
      {chatAvailable() && (
        <div className="px-4 pb-1">
          <Link
            to={`/messages?ref=${encodeURIComponent(lead.refNumber)}`}
            className="w-full flex items-center justify-center gap-2 bg-surface-container text-on-surface py-2.5 rounded-xl font-bold text-label hover:bg-surface-container-high transition-colors touch-press"
          >
            <Icon name="chat" className="text-subhead" />
            {t(locale, "messages_open_conversation")}
          </Link>
        </div>
      )}

      {/* Footer actions */}
      {(company || lead.status === "Completed") && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Verified-review prompt for completed requests */}
          {lead.status === "Completed" && (
            lead.reviewed ? (
              <div className="w-full flex items-center justify-center gap-1.5 bg-green-50 text-green-700 py-2.5 rounded-xl text-label font-bold">
                <Icon name="verified" className="text-body" style={{ fontVariationSettings: "'FILL' 1" }} />
                {t(locale, "requests_reviewed")}
              </div>
            ) : (
              <button
                onClick={() => onReview(lead)}
                className="w-full flex items-center justify-center gap-1.5 bg-primary text-on-primary hover:bg-primary-container transition-colors py-2.5 rounded-xl text-label font-bold touch-press btn-press"
              >
                <Icon name="rate_review" className="text-body" />
                {t(locale, "requests_review_cta")}
              </button>
            )
          )}
          {company && (
            <Link
              to={`/companies/${company.slug}`}
              className="w-full flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors py-2.5 rounded-xl text-label font-bold text-on-surface touch-press"
            >
              {t(locale, "requests_view")} {company.name}
              <Icon name="arrow_forward" className="text-body rtl-flip" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── A waiting-list join ───────────────────────────────────────────────────────
// Deliberately smaller than LeadRequestCard: a waitlist join never had a
// district/budget/description/estimate/ref, and contact stays off-platform
// (phone), so there is no chat thread or review to offer here — this card only
// lets the customer see it exists and its current status.
function WaitlistRequestCard({ entry, locale }: { entry: WaitlistEntry; locale: Locale }) {
  const company = getCompany(entry.companySlug);
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden card-lift">
      <div className="flex items-center gap-3 p-4 border-b border-outline-variant/15">
        {company ? (
          <img src={company.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" width={44} height={44} />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="business" className="text-primary text-title" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-body text-on-surface truncate">{entry.companyName}</p>
          <p className="text-caption text-amber-700 font-bold truncate flex items-center gap-1">
            <Icon name="hourglass_top" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
            {t(locale, "common_kind_waitlist")}
          </p>
        </div>
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-bold flex-shrink-0 ${WAITLIST_STATUS_COLORS[entry.status]}`}>
          {t(locale, WAITLIST_STATUS_KEYS[entry.status])}
        </span>
      </div>

      <div className="p-4 grid grid-cols-2 gap-y-2.5 gap-x-4">
        <Detail icon="calendar_today" label={t(locale, "requests_submitted")} val={new Date(entry.createdAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")} />
        {entry.service && <Detail icon="handyman" label={t(locale, "waitlist_service")} val={entry.service} />}
      </div>
      {entry.note && (
        <div className="px-4 pb-4">
          <p className="text-label text-on-surface-variant bg-surface-container rounded-xl p-3 leading-relaxed">{entry.note}</p>
        </div>
      )}

      {company && (
        <div className="px-4 pb-4">
          <Link
            to={`/companies/${company.slug}`}
            className="w-full flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors py-2.5 rounded-xl text-label font-bold text-on-surface touch-press"
          >
            {t(locale, "requests_view")} {company.name}
            <Icon name="arrow_forward" className="text-body rtl-flip" />
          </Link>
        </div>
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function submit() {
    if (rating < 1 || !text.trim()) return;
    if (captchaConfigured() && !captchaToken) {
      setError(t(locale, "form_err_captcha"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitReview(lead.refNumber, lead.phone, rating, text.trim(), "", captchaToken, lead.trackingToken);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch {
      setError(t(locale, "lead_review_error"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel={t(locale, "lead_review_title")} panelClassName="p-6">
        {done ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <Icon name="check_circle" className="text-green-600 text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }} />
            </div>
            <p className="font-bold text-subhead text-on-surface">{t(locale, "lead_review_thanks")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-bold text-subhead text-on-surface">{t(locale, "lead_review_title")}</h2>
              <button onClick={onClose} aria-label={t(locale, "common_close")} className="w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors">
                <Icon name="close" className="text-outline" />
              </button>
            </div>
            <p className="text-label text-outline mb-1">{lead.companyName}</p>
            <p className="text-label text-on-surface-variant mb-5">{t(locale, "lead_review_sub")}</p>

            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "lead_review_rating")}</label>
            <div className="flex items-center gap-1 mb-5" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" onClick={() => setRating(i)} onMouseEnter={() => setHover(i)}
                  className="p-0.5 touch-press" aria-label={`${i} star${i > 1 ? "s" : ""}`}>
                  <Icon name="star" className="text-secondary text-headline" style={{ fontVariationSettings: i <= (hover || rating) ? "'FILL' 1" : "'FILL' 0" }} />
                </button>
              ))}
            </div>

            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "lead_review_text_label")}</label>
            <textarea
              className="field-input resize-none w-full" rows={4} maxLength={2000}
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t(locale, "lead_review_text_ph")}
            />

            {error && <p className="text-label text-error font-medium bg-error/8 rounded-lg px-3 py-2 mt-3">{error}</p>}

            <div className="mt-4">
              <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />
            </div>

            <button
              onClick={submit} disabled={busy || rating < 1 || !text.trim()}
              className="w-full mt-5 bg-primary text-on-primary py-3 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? t(locale, "lead_review_submitting") : t(locale, "lead_review_submit")}
            </button>
          </>
        )}
    </Modal>
  );
}

function Detail({ icon, label, val, mono }: { icon: string; label: string; val: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-outline text-body flex-shrink-0" aria-hidden="true" translate="no">{icon}</span>
      <div className="min-w-0">
        <p className="text-caption text-outline ltr:uppercase ltr:tracking-wider font-bold leading-none mb-0.5">{label}</p>
        <p className={`text-label text-on-surface font-bold truncate ${mono ? "font-mono" : ""}`}>{val}</p>
      </div>
    </div>
  );
}
