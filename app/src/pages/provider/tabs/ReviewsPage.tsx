import { useState } from "react";
import { useServerSearch } from "../../../hooks/useServerSearch";
import { isApiConfigured } from "../../../lib/api";
import type { Review } from "../../../lib/catalog";
import SearchInput from "../../../components/SearchInput";
import Pagination from "../../../components/Pagination";
import Icon from "../../../components/Icon";
import { EmptyState } from "../../admin/components/EmptyState";
import { Loading } from "../../admin/components/Loading";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import { formatRating } from "../../../lib/format";
import { useProvider } from "../context";

export default function ReviewsPage() {
  const { locale } = useLocale();
  const { company } = useProvider();
  const apiMode = isApiConfigured();
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  // Server-driven search over the COMPLETE review history (the company-detail
  // payload only carries the 50 newest). Demo mode falls back to the client
  // filter over company.reviews.
  const reviewSearch = useServerSearch<Review>(
    `/companies/${company.slug}/reviews`,
    reviewQuery,
    { rating: reviewRating || undefined },
    { pageSize: 12, enabled: apiMode && !!company.slug },
  );

  const rq = reviewQuery.trim().toLowerCase();
  const filteredReviews = company.reviews.filter((r) => {
    const matchRating = reviewRating === 0 || r.rating === reviewRating;
    const matchQuery = !rq || [r.author, r.text, r.district].some((v) => v.toLowerCase().includes(rq));
    return matchRating && matchQuery;
  });
  const reviewList = apiMode ? reviewSearch.data : filteredReviews;
  const reviewTotal = apiMode ? reviewSearch.total : filteredReviews.length;
  const leadApiMode = apiMode;

  return (
            <div>
              <div className="flex items-center gap-4 mb-5">
                <div className="text-3xl font-bold text-primary">{formatRating(locale, company.rating)}</div>
                <div>
                  <div className="flex items-center gap-0.5 mb-0.5">
                    {[1,2,3,4,5].map((i) => (
                      <Icon name="star" className="text-secondary text-body" style={{ fontVariationSettings: i <= Math.round(company.rating) ? "'FILL' 1" : "'FILL' 0" }} key={i} />
                    ))}
                  </div>
                  <p className="text-caption text-outline">{company.reviewCount} {tCount(locale, "noun_review", company.reviewCount)}</p>
                </div>
              </div>

              {/* Search + rating filter */}
              {company.reviewCount > 0 && (
                <div className="space-y-3 mb-5">
                  <div className="max-w-md"><SearchInput value={reviewQuery} onChange={setReviewQuery} placeholder={t(locale, "prov_reviews_search_ph")} /></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <button onClick={() => setReviewRating(0)} className={`px-3.5 py-1.5 min-h-[44px] rounded-full text-label font-bold border transition-colors ${reviewRating === 0 ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>{t(locale, "companies_all")}</button>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <button key={r} onClick={() => setReviewRating(r)} className={`flex items-center gap-0.5 px-3 py-1.5 min-h-[44px] rounded-full text-label font-bold border transition-colors ${reviewRating === r ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30"}`}>
                        {r}<Icon name="star" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                      </button>
                    ))}
                    <span className="text-label font-bold text-outline ms-auto">{reviewTotal} {tCount(locale, "noun_review", reviewTotal)}</span>
                  </div>
                </div>
              )}

              {leadApiMode && reviewSearch.error && (
                <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold mb-4">{reviewSearch.error}</div>
              )}
              {reviewList.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
                  {leadApiMode && reviewSearch.loading
                    ? <Loading msg={t(locale, "admin_searching")} />
                    : <EmptyState msg={(rq || reviewRating) ? t(locale, "prov_reviews_no_match") : t(locale, "prov_reviews_empty")} icon="search_off" />}
                </div>
              ) : (
              <>
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-gutter transition-opacity ${leadApiMode && reviewSearch.loading ? "opacity-60 pointer-events-none" : ""}`}
                aria-busy={leadApiMode && reviewSearch.loading}
              >
                {reviewList.map((r, i) => (
                  <div key={`${r.author}-${i}`} className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map((i) => (
                          <Icon name="star" className="text-secondary text-label" style={{ fontVariationSettings: i <= r.rating ? "'FILL' 1" : "'FILL' 0" }} key={i} />
                        ))}
                      </div>
                      {r.verified && (
                        // DM-11: the fuller "submitted by a verified
                        // customer" explanation lived in `title` only.
                        // Lower stakes than the busy-until date or the
                        // locked-delete reason — the visible badge+icon
                        // already says "Verified" — so this stays a compact
                        // badge with the fuller text as its aria-label
                        // (screen readers get it; a repeated full sentence on
                        // every card in a review grid would just be noise for
                        // sighted readers who already have the short badge).
                        <span
                          className="flex items-center gap-0.5 text-caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full"
                          title={t(locale, "prov_review_verified_title")}
                          aria-label={t(locale, "prov_review_verified_title")}
                        >
                          <Icon name="verified" className="text-caption" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" />
                          {t(locale, "common_verified")}
                        </span>
                      )}
                    </div>
                    <p className="text-body text-on-surface-variant leading-relaxed flex-grow mb-4">"{r.text}"</p>
                    <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/20">
                      <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">{r.avatar}</div>
                      <div>
                        <p className="font-display text-label text-on-surface">{r.author}</p>
                        <p className="text-caption font-display text-outline">{r.district} · {r.date}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {leadApiMode && (
                <Pagination className="mt-6" page={reviewSearch.page} pageCount={reviewSearch.pageCount} total={reviewSearch.total} pageSize={reviewSearch.pageSize} onPage={reviewSearch.setPage} nounKey="noun_review" />
              )}
              </>
              )}
            </div>
  );
}
