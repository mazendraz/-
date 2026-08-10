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
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { formatDate, formatDateTime } from "../../lib/format";
import Icon from "../../components/Icon";

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
  // The queue is paged now. `total` is the point of it: an admin needs to know
  // the size of the backlog, not just see one screenful of it — the endpoint
  // used to stop at 200 with no indication anything was missing.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Switching pending/approved is a different list — start at its beginning.
  useEffect(() => { setPage(1); }, [status]);

  const reload = useCallback(async () => {
    setLoading(true); setErrorKey(null);
    try {
      const res = await listAdminReviews(status, page, PAGE_SIZE);
      setItems(res.data);
      setTotal(res.meta.total);
    } catch { setErrorKey("admin_rev_load_error"); }
    finally { setLoading(false); }
  }, [status, page]);
  useEffect(() => { void reload(); }, [reload]);

  // Approving or deleting the last row on the last page leaves `page` pointing
  // past the end — the same defect the public lists had. Step back instead of
  // rendering "nothing pending" over a queue that still has work in it.
  useEffect(() => {
    if (loading) return;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > lastPage) setPage(lastPage);
  }, [total, page, loading]);

  // Removing a row shrinks the CURRENT page and the total together, so the
  // count above the list stays honest without a refetch.
  function removeLocally(id: string) {
    setItems((cur) => cur.filter((x) => x.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  }

  async function approve(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setErrorKey(null);
    try { await approveAdminReview(r.id); removeLocally(r.id); }
    catch { setErrorKey("admin_rev_approve_error"); }
    finally { setBusyId(null); }
  }
  async function del(r: AdminReview) {
    if (!r.id) return;
    setBusyId(r.id); setErrorKey(null);
    try { await deleteAdminReview(r.id); removeLocally(r.id); }
    catch { setErrorKey("admin_rev_delete_error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-body text-on-surface">
            {t(locale, "admin_rev_customer_title")}
            {/* The backlog size, which the old capped endpoint could not report. */}
            {total > 0 && (
              <span className="ms-2 align-middle text-caption font-black text-primary bg-primary/10 rounded-full px-2 py-0.5 tabular-nums">
                {total}
              </span>
            )}
          </h2>
          <p className="text-caption text-outline mt-0.5">{t(locale, "admin_rev_customer_sub")}</p>
        </div>
        <div className="flex bg-surface-container rounded-xl p-0.5">
          {(["pending", "approved"] as AdminReviewStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold transition-colors ${status === s ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}>
              {t(locale, s === "pending" ? "admin_rev_pending" : "admin_rev_approved")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-label text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center text-label text-outline">
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
                  <p className="font-bold text-label text-on-surface truncate">{r.author}</p>
                  <p className="text-caption font-bold text-primary truncate">{r.companyName}</p>
                </div>
                <span className="text-secondary text-label tracking-tight flex-shrink-0" aria-label={`${r.rating} ${t(locale, "admin_rev_out_of_5")}`}>
                  {"★".repeat(r.rating)}<span className="text-outline/30">{"★".repeat(Math.max(0, 5 - r.rating))}</span>
                </span>
              </div>
              <p className="text-label text-on-surface-variant leading-relaxed mt-2 flex-grow">{r.text}</p>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                <span className="text-caption text-outline">{r.district} · {r.date}</span>
                <div className="flex gap-2">
                  {status === "pending" && (
                    <button onClick={() => approve(r)} disabled={busyId === r.id}
                      className="flex items-center gap-1 bg-primary text-on-primary px-3 py-1.5 rounded-lg text-caption font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                      <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{busyId === r.id ? "progress_activity" : "check"}</span> {t(locale, "admin_approve")}
                    </button>
                  )}
                  <button onClick={() => del(r)} disabled={busyId === r.id}
                    className="flex items-center gap-1 text-outline px-2.5 py-1.5 rounded-lg text-caption font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                    <Icon name="delete" className="text-label" /> {t(locale, "admin_delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reachable paging — the queue no longer ends at a hidden ceiling. */}
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        nounKey="noun_review"
      />
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

      {/* ── Customer reviews (verified, company-specific) ── */}
      <AdminCustomerReviews />

      {/* ── Platform Reviews ── */}
      <div className="space-y-3 border-t border-outline-variant/20 pt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-body text-on-surface">{t(locale, "admin_platform_title")}</h2>
            <p className="text-caption text-outline mt-0.5">{t(locale, "admin_platform_sub")}</p>
          </div>
          {/* Enable/disable toggle */}
          {/* DM-06: the checkbox is 16px by design — the LABEL is the target,
              so it carries the 44px minimum (was 38px). */}
          <label className="flex items-center gap-2.5 bg-surface-container-lowest border border-outline-variant/25 rounded-xl px-4 py-2.5 min-h-[44px] cursor-pointer shadow-bloom">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={reviewsOn} onChange={(e) => toggleReviews(e.target.checked)} />
            <span className="text-label font-bold text-on-surface">{t(locale, "admin_platform_allow")}</span>
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
          <h2 className="font-bold text-body text-on-surface">{t(locale, "admin_fb_title")}</h2>
          <p className="text-caption text-outline mt-0.5">{t(locale, "admin_fb_sub")}</p>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState msg={t(locale, "admin_fb_none")} icon="inbox" />
          </div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((f) => (
              <button key={f.id} onClick={() => { setSelectedFeedback(f); if (!f.read) markFeedbackRead(f.id); }}
                className="w-full text-start bg-surface-container-lowest rounded-xl p-4 shadow-bloom hover:shadow-bloom-hover transition-shadow flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${FEEDBACK_TYPE_COLORS[f.type]}`}>
                  <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{FEEDBACK_TYPE_ICONS[f.type]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-label text-on-surface">{t(locale, FEEDBACK_TYPE_KEYS[f.type])}</span>
                    {f.companyName && <span className="text-caption text-outline">{t(locale, "admin_fb_re")} {f.companyName}</span>}
                    {!f.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-label text-on-surface-variant line-clamp-2 mt-0.5">{f.message}</p>
                  <p className="text-caption text-outline mt-1">{f.name || t(locale, "admin_anonymous")} · {formatDate(f.createdAt, locale)}</p>
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
            <Icon name="star" className="text-secondary text-label" style={{ fontVariationSettings: s <= r.rating ? "'FILL' 1" : "'FILL' 0" }} key={s} />
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSiteReviewVisible(r.id, !r.visible)}
            aria-label={`${t(locale, r.visible ? "admin_rev_hide" : "admin_rev_show")} ${r.name}`}
            className="w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-body" aria-hidden="true" translate="no">{r.visible ? "visibility" : "visibility_off"}</span>
          </button>
          <button
            onClick={() => deleteSiteReview(r.id)}
            aria-label={`${t(locale, "admin_delete")} ${r.name}`}
            className="w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg hover:bg-error/10 transition-colors text-outline hover:text-error"
          >
            <Icon name="delete" className="text-body" />
          </button>
        </div>
      </div>
      <p className="text-label text-on-surface-variant leading-relaxed flex-grow">"{r.text}"</p>
      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/15">
        <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-caption flex-shrink-0">
          {r.name.charAt(0)}
        </div>
        <p className="font-bold text-caption text-on-surface">{r.name}</p>
        <span className="text-outline text-caption">· {r.district}</span>
        <span className="text-outline text-caption ms-auto">{formatDate(r.createdAt, locale)}</span>
      </div>
      {!r.visible && (
        <span className="text-caption font-bold text-outline bg-surface-container px-2 py-1 rounded-full self-start">{t(locale, "admin_rev_hidden_badge")}</span>
      )}
    </div>
  );
}

export function FeedbackDetailModal({ feedback: f, onClose, onDelete }: { feedback: Feedback; onClose: () => void; onDelete: (id: string) => void }) {
  const { locale } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal title={t(locale, FEEDBACK_TYPE_KEYS[f.type])} onClose={onClose}>
      <div className="p-5">
      <div className="space-y-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-label font-bold ${FEEDBACK_TYPE_COLORS[f.type]}`}>
          <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{FEEDBACK_TYPE_ICONS[f.type]}</span>
          {t(locale, FEEDBACK_TYPE_KEYS[f.type])}
          {f.companyName && <span className="opacity-70 font-normal ms-1">{t(locale, "admin_fb_re")} {f.companyName}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><p className="text-caption font-bold text-outline mb-0.5">{t(locale, "admin_lead_name")}</p><p className="text-label text-on-surface">{f.name || "—"}</p></div>
          <div><p className="text-caption font-bold text-outline mb-0.5">{t(locale, "admin_lead_phone")}</p><p className="text-label text-on-surface">{f.phone || "—"}</p></div>
          <div><p className="text-caption font-bold text-outline mb-0.5">{t(locale, "admin_lead_date")}</p><p className="text-label text-on-surface">{formatDateTime(f.createdAt, locale)}</p></div>
        </div>
        <div>
          <p className="text-caption font-bold text-outline mb-1.5">{t(locale, "admin_fb_message")}</p>
          <div className="bg-surface-container rounded-xl p-4 text-label text-on-surface leading-relaxed">{f.message}</div>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl border border-error/30 text-error font-bold text-label hover:bg-error/5 transition-colors">{t(locale, "admin_delete")}</button>
        ) : (
          <div className="rounded-xl border border-error/30 p-4 bg-error/5">
            <p className="text-label text-on-surface mb-3">{t(locale, "admin_fb_delete_confirm")}</p>
            <div className="flex gap-3">
              <button onClick={() => onDelete(f.id)} className="flex-1 py-2 rounded-xl bg-error text-white font-bold text-label">{t(locale, "admin_delete")}</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-label">{t(locale, "admin_confirm_cancel")}</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </Modal>
  );
}
