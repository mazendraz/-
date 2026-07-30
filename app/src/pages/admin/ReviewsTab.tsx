import { useState, useEffect, useCallback } from "react";
import {
  useSiteReviews, setSiteReviewVisible, deleteSiteReview,
  areReviewsEnabled, setReviewsEnabled, type SiteReview,
} from "../../lib/siteReviews";
import {
  useFeedbacks, markFeedbackRead, deleteFeedback,
  type Feedback, FEEDBACK_TYPE_KEYS, FEEDBACK_TYPE_ICONS, FEEDBACK_TYPE_COLORS,
} from "../../lib/feedback";
import {
  listAdminReviews, approveAdminReview, deleteAdminReview,
  type AdminReview, type AdminReviewStatus,
} from "../../lib/adminReviews";
import { ProjectApprovals } from "./ProjectApprovals";
import { ModalShell } from "./components/ModalShell";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { formatDate, formatDateTime } from "../../lib/format";

// Admin moderation of customer reviews across all companies. Customer reviews are
// held PENDING (hidden + excluded from the rating) until approved here. Pending
// queue defaults; a toggle shows already-approved reviews.
export function AdminCustomerReviews() {
  const { locale } = useLocale();
  const [status, setStatus] = useState<AdminReviewStatus>("pending");
  const [items, setItems] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  // The translation KEY, not the translated string. Resolving it inside the
  // callback captured whichever locale was current when the callback was built,
  // so an error raised before a language switch stayed in the old language — and
  // adding `locale` to the deps instead would refetch the list on every toggle.
  const [errorKey, setErrorKey] = useState<StringKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const error = errorKey ? t(locale, errorKey) : "";

  const reload = useCallback(async () => {
    setLoading(true); setErrorKey(null);
    try { setItems(await listAdminReviews(status)); }
    catch { setErrorKey("admin_rev_load_error"); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void reload(); }, [reload]);

  async function approve(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setErrorKey(null);
    try { await approveAdminReview(r.id); setItems((cur) => cur.filter((x) => x.id !== r.id)); }
    catch { setErrorKey("admin_rev_approve_error"); }
    finally { setBusyId(null); }
  }
  async function del(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setErrorKey(null);
    try { await deleteAdminReview(r.id); setItems((cur) => cur.filter((x) => x.id !== r.id)); }
    catch { setErrorKey("admin_rev_delete_error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">{t(locale, "admin_rev_customer_title")}</h2>
          <p className="text-[12px] text-outline mt-0.5">{t(locale, "admin_rev_customer_sub")}</p>
        </div>
        <div className="flex bg-surface-container rounded-xl p-0.5">
          {(["pending", "approved"] as AdminReviewStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-colors ${status === s ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}>
              {t(locale, s === "pending" ? "admin_rev_pending" : "admin_rev_approved")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center text-[13px] text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "admin_loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={t(locale, status === "pending" ? "admin_rev_none_pending" : "admin_rev_none_approved")} icon="reviews" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((r) => (
            <div key={r.id} className="bg-surface-container-lowest rounded-xl p-4 shadow-bloom flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-on-surface truncate">{r.author}</p>
                  <p className="text-[12px] font-bold text-primary truncate">{r.companyName}</p>
                </div>
                <span className="text-secondary text-[14px] tracking-tight flex-shrink-0" aria-label={`${r.rating} ${t(locale, "admin_rev_out_of_5")}`}>
                  {"★".repeat(r.rating)}<span className="text-outline/30">{"★".repeat(Math.max(0, 5 - r.rating))}</span>
                </span>
              </div>
              <p className="text-[13px] text-on-surface-variant leading-relaxed mt-2 flex-grow">{r.text}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                <span className="text-[11px] text-outline">{r.district} · {r.date}</span>
                <div className="flex gap-2">
                  {status === "pending" && (
                    <button onClick={() => approve(r)} disabled={busyId === r.id}
                      className="flex items-center gap-1 bg-primary text-on-primary px-3 py-1.5 rounded-lg text-[12px] font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-[14px]">{busyId === r.id ? "progress_activity" : "check"}</span> {t(locale, "admin_approve")}
                    </button>
                  )}
                  <button onClick={() => del(r)} disabled={busyId === r.id}
                    className="flex items-center gap-1 text-outline px-2.5 py-1.5 rounded-lg text-[12px] font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                    <span className="material-symbols-outlined text-[14px]">delete</span> {t(locale, "admin_delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminReviewsTab() {
  const { locale } = useLocale();
  const allReviews = useSiteReviews(true);
  const feedbacks = useFeedbacks();
  const [reviewsOn, setReviewsOn] = useState(areReviewsEnabled);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

  function toggleReviews(v: boolean) {
    setReviewsOn(v);
    setReviewsEnabled(v);
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Project approvals ── */}
      <ProjectApprovals />

      {/* ── Customer reviews (verified, company-specific) ── */}
      <div className="border-t border-outline-variant/20 pt-6">
        <AdminCustomerReviews />
      </div>

      {/* ── Platform Reviews ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-[16px] text-on-surface">{t(locale, "admin_platform_title")}</h2>
            <p className="text-[12px] text-outline mt-0.5">{t(locale, "admin_platform_sub")}</p>
          </div>
          {/* Enable/disable toggle */}
          <label className="flex items-center gap-2.5 bg-surface-container-lowest border border-outline-variant/25 rounded-xl px-4 py-2.5 cursor-pointer shadow-bloom">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={reviewsOn} onChange={(e) => toggleReviews(e.target.checked)} />
            <span className="text-[13px] font-bold text-on-surface">{t(locale, "admin_platform_allow")}</span>
          </label>
        </div>

        {allReviews.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState msg={t(locale, "admin_platform_none")} icon="rate_review" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
      </div>

      {/* ── Feedback & Reports ── */}
      <div className="space-y-3 border-t border-outline-variant/20 pt-6">
        <div>
          <h2 className="font-bold text-[16px] text-on-surface">{t(locale, "admin_fb_title")}</h2>
          <p className="text-[12px] text-outline mt-0.5">{t(locale, "admin_fb_sub")}</p>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState msg={t(locale, "admin_fb_none")} icon="inbox" />
          </div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((f) => (
              <button key={f.id} onClick={() => { setSelectedFeedback(f); if (!f.read) markFeedbackRead(f.id); }}
                className="w-full text-left bg-surface-container-lowest rounded-xl p-4 shadow-bloom hover:shadow-bloom-hover transition-all flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${FEEDBACK_TYPE_COLORS[f.type]}`}>
                  <span className="material-symbols-outlined text-[18px]">{FEEDBACK_TYPE_ICONS[f.type]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[13px] text-on-surface">{t(locale, FEEDBACK_TYPE_KEYS[f.type])}</span>
                    {f.companyName && <span className="text-[11px] text-outline">{t(locale, "admin_fb_re")} {f.companyName}</span>}
                    {!f.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-[13px] text-on-surface-variant line-clamp-2 mt-0.5">{f.message}</p>
                  <p className="text-[11px] text-outline mt-1">{f.name || t(locale, "admin_anonymous")} · {formatDate(f.createdAt, locale)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedFeedback && (
        <FeedbackDetailModal
          feedback={selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          onDelete={(id) => { deleteFeedback(id); setSelectedFeedback(null); }}
        />
      )}
    </div>
  );
}

export function ReviewCard({ review: r }: { review: SiteReview }) {
  const { locale } = useLocale();
  return (
    <div className={`bg-surface-container-lowest rounded-xl p-4 border shadow-bloom flex flex-col gap-3
      ${r.visible ? "border-outline-variant/20" : "border-outline-variant/10 opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map((s) => (
            <span key={s} className="material-symbols-outlined text-secondary text-[14px]"
              style={{ fontVariationSettings: s <= r.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSiteReviewVisible(r.id, !r.visible)}
            title={t(locale, r.visible ? "admin_rev_hide" : "admin_rev_show")}
            className="p-1.5 rounded-lg hover:bg-surface-container transition-colors text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]">{r.visible ? "visibility" : "visibility_off"}</span>
          </button>
          <button
            onClick={() => deleteSiteReview(r.id)}
            className="p-1.5 rounded-lg hover:bg-error/10 transition-colors text-outline hover:text-error"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
      <p className="text-[13px] text-on-surface-variant leading-relaxed flex-grow">"{r.text}"</p>
      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/15">
        <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[12px] flex-shrink-0">
          {r.name.charAt(0)}
        </div>
        <p className="font-bold text-[12px] text-on-surface">{r.name}</p>
        <span className="text-outline text-[11px]">· {r.district}</span>
        <span className="text-outline text-[11px] ml-auto">{formatDate(r.createdAt, locale)}</span>
      </div>
      {!r.visible && (
        <span className="text-[11px] font-bold text-outline bg-surface-container px-2 py-1 rounded-full self-start">{t(locale, "admin_rev_hidden_badge")}</span>
      )}
    </div>
  );
}

export function FeedbackDetailModal({ feedback: f, onClose, onDelete }: { feedback: Feedback; onClose: () => void; onDelete: (id: string) => void }) {
  const { locale } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <ModalShell title={t(locale, FEEDBACK_TYPE_KEYS[f.type])} onClose={onClose}>
      <div className="space-y-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-bold ${FEEDBACK_TYPE_COLORS[f.type]}`}>
          <span className="material-symbols-outlined text-[18px]">{FEEDBACK_TYPE_ICONS[f.type]}</span>
          {t(locale, FEEDBACK_TYPE_KEYS[f.type])}
          {f.companyName && <span className="opacity-70 font-normal ml-1">{t(locale, "admin_fb_re")} {f.companyName}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[11px] font-bold text-outline mb-0.5">{t(locale, "admin_lead_name")}</p><p className="text-[14px] text-on-surface">{f.name || "—"}</p></div>
          <div><p className="text-[11px] font-bold text-outline mb-0.5">{t(locale, "admin_lead_phone")}</p><p className="text-[14px] text-on-surface">{f.phone || "—"}</p></div>
          <div><p className="text-[11px] font-bold text-outline mb-0.5">{t(locale, "admin_lead_date")}</p><p className="text-[14px] text-on-surface">{formatDateTime(f.createdAt, locale)}</p></div>
        </div>
        <div>
          <p className="text-[11px] font-bold text-outline mb-1.5">{t(locale, "admin_fb_message")}</p>
          <div className="bg-surface-container rounded-xl p-4 text-[14px] text-on-surface leading-relaxed">{f.message}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-[14px] hover:bg-error/5 transition-colors">{t(locale, "admin_delete")}</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-[14px] text-on-surface mb-3">{t(locale, "admin_fb_delete_confirm")}</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(f.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-[14px]">{t(locale, "admin_delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-[14px]">{t(locale, "admin_confirm_cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
