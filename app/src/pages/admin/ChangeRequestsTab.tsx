import { useEffect, useState } from "react";
import {
  useChangeRequests, getChangeRequest, reviewChangeRequest, getPriceReference,
  displayValue, FIELD_LABEL_KEYS, IMAGE_FIELDS, IMAGE_LIST_FIELDS,
  type ChangeRequest, type ChangeRequestStatus, type PriceReference,
} from "../../lib/changeRequests";
import { refreshCatalogFromApi } from "../../lib/catalog";
import { isApiConfigured } from "../../lib/api";
import { ModalShell } from "./components/ModalShell";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { formatDateTime } from "../../lib/format";
import { formatAmount, unitLabel } from "../../lib/pricing";

// ══════════════════════════════════════════════════════════════════════════
//  CHANGE REQUESTS — provider edits awaiting review
// ══════════════════════════════════════════════════════════════════════════

const FILTERS: { id: ChangeRequestStatus | "ALL"; labelKey: StringKey }[] = [
  { id: "PENDING", labelKey: "admin_cr_f_pending" },
  { id: "APPROVED", labelKey: "admin_cr_f_approved" },
  { id: "REJECTED", labelKey: "admin_cr_f_rejected" },
  { id: "ALL", labelKey: "admin_cr_f_all" },
];

// The status itself is an API value; only the badge text is translated.
const CR_STATUS_KEYS: Record<ChangeRequestStatus, StringKey> = {
  PENDING: "admin_cr_status_pending",
  APPROVED: "admin_cr_status_approved",
  REJECTED: "admin_cr_status_rejected",
  CANCELLED: "admin_cr_status_cancelled",
};

export function ChangeRequestsTab() {
  const { locale } = useLocale();
  const [filter, setFilter] = useState<ChangeRequestStatus | "ALL">("PENDING");
  const { items, loading, error, refresh } = useChangeRequests(filter);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!isApiConfigured()) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
        <EmptyState msg={t(locale, "admin_cr_needs_api")} icon="cloud_off" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${
              filter === f.id
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {t(locale, f.labelKey)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState
            msg={t(locale, filter === "PENDING" ? "admin_cr_none_pending" : "admin_cr_none")}
            icon="task_alt"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <RequestRow key={r.id} request={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </div>
      )}

      {openId && (
        <ReviewModal
          id={openId}
          onClose={() => setOpenId(null)}
          onReviewed={() => {
            setOpenId(null);
            refresh();
            // An approval changes public catalog data — pull it through so the
            // rest of the dashboard isn't showing the pre-approval values.
            void refreshCatalogFromApi();
          }}
        />
      )}
    </div>
  );
}

const STATUS_STYLES: Record<ChangeRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-error/10 text-error",
  CANCELLED: "bg-surface-container text-outline",
};

function RequestRow({ request, onOpen }: { request: ChangeRequest; onOpen: () => void }) {
  const { locale } = useLocale();
  const fields = Object.keys(request.changes);
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-surface-container-lowest rounded-2xl p-4 shadow-bloom hover:bg-surface-container/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="font-bold text-[15px] text-on-surface truncate">
          {request.companyName ?? request.companyId}
        </p>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[request.status]}`}>
          {t(locale, CR_STATUS_KEYS[request.status])}
        </span>
      </div>
      <p className="text-[13px] text-outline">
        {fields.length} {t(locale, fields.length > 1 ? "admin_cr_fields" : "admin_cr_field")}:{" "}
        <span className="text-on-surface-variant">
          {fields.map((f) => (FIELD_LABEL_KEYS[f] ? t(locale, FIELD_LABEL_KEYS[f]) : f)).join(", ")}
        </span>
      </p>
      {request.note && <p className="text-[12px] text-outline italic mt-1">“{request.note}”</p>}
      <p className="text-[11px] text-outline mt-1.5">
        {formatDateTime(request.createdAt, locale)}
      </p>
    </button>
  );
}

function ReviewModal({ id, onClose, onReviewed }: {
  id: string; onClose: () => void; onReviewed: () => void;
}) {
  const { locale } = useLocale();
  const [request, setRequest] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  // Which fields the admin is accepting. Starts as "all of them" so the common
  // case (approve everything) is one click.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getChangeRequest(id)
      .then((r) => {
        if (!alive) return;
        setRequest(r);
        setSelected(new Set(Object.keys(r.changes)));
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : t(locale, "admin_cr_load_error")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  async function act(action: "approve" | "reject") {
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      const all = Object.keys(request.changes);
      await reviewChangeRequest(id, {
        action,
        reviewNote: reviewNote || undefined,
        // Send `fields` only for a genuine partial approval — omitting it means
        // "all", which is what the server defaults to.
        ...(action === "approve" && selected.size < all.length
          ? { fields: [...selected] }
          : {}),
      });
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "admin_cr_review_failed"));
      setBusy(false);
    }
  }

  const fields = request ? Object.keys(request.changes) : [];
  const pending = request?.status === "PENDING";

  return (
    <ModalShell title={t(locale, "admin_cr_modal_title")} onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      ) : !request ? (
        <p className="text-[14px] text-error">{error || t(locale, "admin_cr_not_found")}</p>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-[13px] font-bold">{error}</div>
          )}

          {request.entityMissing && (
            <div className="bg-error/10 border border-error/25 rounded-xl px-4 py-3">
              <p className="text-[13px] font-bold text-error">
                {t(locale, "admin_cr_entity_missing")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[15px] text-on-surface">{request.companyName}</p>
              <p className="text-[12px] text-outline">{formatDateTime(request.createdAt, locale)}</p>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[request.status]}`}>
              {t(locale, CR_STATUS_KEYS[request.status])}
            </span>
          </div>

          {request.note && (
            <div className="bg-surface-container rounded-xl px-4 py-2.5">
              <p className="text-[12px] font-bold text-outline mb-0.5">{t(locale, "admin_cr_provider_note")}</p>
              <p className="text-[13px] text-on-surface">{request.note}</p>
            </div>
          )}

          {request.entity === "OFFERING" && <PriceReferencePanel offeringId={request.entityId} />}

          <div className="space-y-3">
            {fields.map((field) => (
              <FieldDiff
                key={field}
                field={field}
                before={request.snapshot[field]}
                after={request.changes[field]}
                conflicted={request.conflicts?.includes(field) ?? false}
                selectable={pending && !request.entityMissing}
                selected={selected.has(field)}
                onToggle={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(field)) next.delete(field); else next.add(field);
                    return next;
                  })
                }
              />
            ))}
          </div>

          {/* gallery/badges are single fields holding arrays — the API applies a
              field whole, so this is an honest statement of the limit. */}
          {fields.some((f) => IMAGE_LIST_FIELDS.has(f)) && (
            <p className="text-[12px] text-outline bg-surface-container rounded-xl px-3 py-2">
              {t(locale, "admin_cr_gallery_note")}
            </p>
          )}

          {pending && (
            <>
              <div>
                <label className="block text-[12px] font-bold text-outline mb-1.5">
                  {t(locale, "admin_cr_note_label")} {t(locale, "admin_cr_note_required")}
                </label>
                <input
                  className="field-input" value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={t(locale, "admin_cr_note_ph")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void act("approve")}
                  disabled={busy || selected.size === 0 || request.entityMissing}
                  className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  {selected.size === fields.length
                    ? t(locale, "admin_cr_approve_all")
                    : `${t(locale, "admin_approve")} ${selected.size} ${t(locale, "admin_cr_of")} ${fields.length}`}
                </button>
                <button
                  onClick={() => void act("reject")}
                  disabled={busy || !reviewNote.trim()}
                  title={!reviewNote.trim() ? t(locale, "admin_cr_reject_hint") : undefined}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-[14px] text-error border border-error/30 hover:bg-error/5 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  {t(locale, "admin_reject")}
                </button>
              </div>
            </>
          )}

          {!pending && request.reviewNote && (
            <div className="bg-surface-container rounded-xl px-4 py-2.5">
              <p className="text-[12px] font-bold text-outline mb-0.5">{t(locale, "admin_cr_review_note")}</p>
              <p className="text-[13px] text-on-surface">{request.reviewNote}</p>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/**
 * What comparable offerings in this category charge.
 *
 * ADVISORY. Decision 2 says the provider sets the price and the admin's approval
 * is the control — this exists so an admin doesn't have to go looking to sanity
 * check a per-unit rate.
 *
 * It shows nothing for FIXED/RANGE offerings and nothing below five comparable
 * rows, both on purpose: a median over "full apartment finishing" and "install
 * one door" (the only grouping available without a unit) compares unrelated
 * work, and one computed from two rows is noise. A warning that fires on sane
 * prices gets ignored within a week, taking the real ones with it.
 */
function PriceReferencePanel({ offeringId }: { offeringId: string }) {
  const { locale } = useLocale();
  const [state, setState] = useState<{ reference: PriceReference; outlier: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getPriceReference(offeringId)
      .then((r) => { if (alive) setState(r); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [offeringId]);

  if (failed || !state) return null;
  const { reference, outlier } = state;

  if (!reference.available) {
    return (
      <p className="text-[12px] text-outline bg-surface-container rounded-xl px-3 py-2">
        {reference.reason === "not_per_unit"
          ? t(locale, "admin_cr_price_not_per_unit")
          : `${t(locale, "admin_cr_price_not_enough")}${
              reference.sampleSize !== undefined
                ? ` (${reference.sampleSize} ${t(locale, "admin_cr_price_found")})`
                : ""
            }.`}
      </p>
    );
  }

  return (
    <div className={`rounded-xl px-4 py-3 border ${outlier ? "bg-amber-50 border-amber-300" : "bg-surface-container border-outline-variant/20"}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[12px] font-bold text-outline">
          {t(locale, "admin_cr_price_ref")} · {t(locale, "admin_cr_price_per")} {unitLabel(reference.unit ?? null, locale)} · {reference.sampleSize} {t(locale, "admin_cr_price_offerings")}
        </p>
        {outlier && (
          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
            {t(locale, "admin_cr_price_outlier")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-[13px]">
        <span className="text-on-surface-variant">{t(locale, "admin_cr_price_low")} <span className="font-bold text-on-surface">{reference.min !== undefined ? formatAmount(reference.min, locale) : ""}</span></span>
        <span className="text-on-surface-variant">{t(locale, "admin_cr_price_median")} <span className="font-bold text-on-surface">{reference.median !== undefined ? formatAmount(reference.median, locale) : ""}</span></span>
        <span className="text-on-surface-variant">{t(locale, "admin_cr_price_high")} <span className="font-bold text-on-surface">{reference.max !== undefined ? formatAmount(reference.max, locale) : ""}</span></span>
      </div>
    </div>
  );
}

function FieldDiff({ field, before, after, conflicted, selectable, selected, onToggle }: {
  field: string; before: unknown; after: unknown; conflicted: boolean;
  selectable: boolean; selected: boolean; onToggle: () => void;
}) {
  const { locale } = useLocale();
  const isImage = IMAGE_FIELDS.has(field);
  const isImageList = IMAGE_LIST_FIELDS.has(field);

  return (
    <div className={`rounded-xl border p-3 ${conflicted ? "border-amber-300 bg-amber-50/50" : "border-outline-variant/20"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="flex items-center gap-2 min-w-0">
          {selectable && (
            <input
              type="checkbox" checked={selected} onChange={onToggle}
              className="w-4 h-4 accent-[color:var(--color-primary,#8a6a4f)] flex-shrink-0"
              aria-label={`${t(locale, "admin_cr_include")} ${FIELD_LABEL_KEYS[field] ? t(locale, FIELD_LABEL_KEYS[field]) : field}`}
            />
          )}
          <span className="font-bold text-[13px] text-on-surface truncate">
            {FIELD_LABEL_KEYS[field] ? t(locale, FIELD_LABEL_KEYS[field]) : field}
          </span>
        </label>
        {conflicted && (
          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">
            {t(locale, "admin_cr_conflicted")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ValueBox label={t(locale, "admin_cr_current")} value={before} isImage={isImage} isImageList={isImageList} muted />
        <ValueBox label={t(locale, "admin_cr_proposed")} value={after} isImage={isImage} isImageList={isImageList} />
      </div>
    </div>
  );
}

function ValueBox({ label, value, isImage, isImageList, muted }: {
  label: string; value: unknown; isImage: boolean; isImageList: boolean; muted?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2.5 ${muted ? "bg-surface-container" : "bg-primary/5"}`}>
      <p className="text-[11px] font-bold text-outline mb-1">{label}</p>
      {isImage && typeof value === "string" && value ? (
        <img src={value} alt="" className="w-full h-20 object-cover rounded-md border border-outline-variant/20" loading="lazy" />
      ) : isImageList && Array.isArray(value) ? (
        value.length ? (
          <div className="flex flex-wrap gap-1.5">
            {(value as string[]).slice(0, 8).map((src, i) => (
              <img key={i} src={src} alt="" className="w-12 h-12 object-cover rounded-md border border-outline-variant/20" loading="lazy" />
            ))}
          </div>
        ) : <p className="text-[13px] text-outline">—</p>
      ) : (
        <p className="text-[13px] text-on-surface break-words whitespace-pre-wrap">{displayValue(value)}</p>
      )}
    </div>
  );
}
