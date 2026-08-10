import { useEffect, useId, useMemo, useState } from "react";
import {
  useOfferings, createOffering, updateOffering, deleteOffering,
  requestPublish, setOfferingVisibility, addTier, removeTier,
  type Offering, type OfferingInput, type PricingModel, type PriceUnit,
  offeringState, type OfferingState,
} from "../lib/offerings";
import { formatPrice, formatQtyRange, PRICING_MODEL_LABELS, PRICE_UNITS, unitLabel, isPriceStale, priceAgeDays } from "../lib/pricing";
import { listMyChangeRequests, type ChangeRequest } from "../lib/changeRequests";
import { isApiConfigured } from "../lib/api";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import Icon from "./Icon";
import Select from "./Select";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { useDialogA11y } from "../hooks/useDialogA11y";

/**
 * The provider's "Services & Pricing" screen.
 *
 * The important thing this UI has to communicate is WHICH WRITE PATH a given row
 * is on, because it changes what a save does:
 *   draft     → edits apply instantly
 *   pending   → locked; the draft can't change while an admin reviews it
 *   published → edits go to review; the live listing keeps showing the old price
 * Getting that wrong in the UI means a provider believes a price is live when it
 * isn't (or the reverse), and quotes a customer accordingly.
 */

const STATE_BADGES: Record<OfferingState, { key: StringKey; cls: string }> = {
  draft: { key: "prov_off_state_draft", cls: "bg-surface-container text-outline" },
  "pending-publish": { key: "prov_off_state_pending", cls: "bg-amber-100 text-amber-800" },
  published: { key: "prov_off_state_live", cls: "bg-green-100 text-green-800" },
  hidden: { key: "prov_off_state_hidden", cls: "bg-surface-container text-outline" },
};

export default function OfferingsEditor() {
  const { locale } = useLocale();
  const { items, loading, error, refresh } = useOfferings();
  const [pending, setPending] = useState<ChangeRequest[]>([]);
  const [editing, setEditing] = useState<Offering | "new" | null>(null);
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const loadPending = () => {
    if (!isApiConfigured()) return;
    // The provider-scoped endpoint — /admin/change-requests is adminOnly and
    // would 403 here.
    // Both predicates go to the SERVER. Filtering a paged response in the
    // browser would quietly miss pending requests that sort past page one.
    listMyChangeRequests({ status: "PENDING", entity: "OFFERING", pageSize: 100 })
      .then((res) => setPending(res.data))
      .catch(() => setPending([]));
  };
  useEffect(loadPending, []);

  const pendingIds = useMemo(() => new Set(pending.map((r) => r.entityId)), [pending]);

  function say(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 5000);
  }

  async function run(id: string, fn: () => Promise<unknown>, done: string) {
    setBusyId(id);
    setActionError("");
    try {
      await fn();
      refresh();
      loadPending();
      say(done);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t(locale, "prov_off_err_generic"));
    } finally {
      setBusyId(null);
    }
  }

  if (!isApiConfigured()) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Icon name="info" className="text-primary text-title flex-shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant">
          {t(locale, "prov_off_needs_api")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {(error || actionError) && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">
          {error || actionError}
        </div>
      )}
      {flash && (
        <div className="bg-primary/10 border border-primary/25 text-primary rounded-xl px-4 py-2.5 text-label font-bold">{flash}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className=" text-title text-on-surface">{t(locale, "prov_off_title")}</h3>
          <p className="text-label text-outline mt-0.5">
            {t(locale, "prov_off_desc")}
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors flex-shrink-0"
        >
          <Icon name="add" className="text-subhead" /> {t(locale, "prov_off_add")}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom text-center py-14 px-6">
          <Icon name="sell" className="text-outline text-[48px] mb-3 block" />
          <p className="text-body text-outline max-w-sm mx-auto">
            {t(locale, "prov_off_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((o) => {
            const state = offeringState(o, pendingIds);
            const badge = STATE_BADGES[state];
            const locked = state === "pending-publish";
            const stale = isPriceStale(o.priceUpdatedAt);
            return (
              <div key={o.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-body text-on-surface truncate">{o.name}</p>
                      <span className={`text-caption font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {t(locale, badge.key)}
                      </span>
                      <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-surface-container text-outline">
                        {t(locale, o.kind === "SERVICE" ? "prov_off_kind_service" : "prov_off_kind_product")}
                      </span>
                    </div>
                    <p className="text-label font-bold text-primary mt-1">{formatPrice(o, locale)}</p>
                    {o.description && (
                      <p className="text-label text-outline mt-0.5 line-clamp-2">{o.description}</p>
                    )}
                    {o.tiers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {o.tiers.map((t) => (
                          <span key={t.id} className="text-caption bg-surface-container px-2 py-1 rounded-lg text-on-surface-variant">
                            {t.label}
                            {formatQtyRange(t, locale) && ` · ${formatQtyRange(t, locale)}`}
                            {t.priceMin != null && ` · ${formatPrice({ pricingModel: "FIXED", priceMin: t.priceMin, priceMax: t.priceMax, unit: null }, locale)}`}
                          </span>
                        ))}
                      </div>
                    )}
                    {stale && (
                      <p className="text-caption text-amber-700 mt-1.5 flex items-center gap-1">
                        <Icon name="schedule" className="text-label" />
                        {t(locale, "prov_off_stale_before")} {priceAgeDays(o.priceUpdatedAt)} {t(locale, "prov_off_stale_after")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setEditing(o)}
                      disabled={locked || busyId === o.id}
                      title={locked ? t(locale, "prov_off_edit_locked") : undefined}
                      className="flex items-center gap-1 bg-surface-container px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40"
                    >
                      <Icon name="edit" className="text-label" /> {t(locale, "prov_off_edit")}
                    </button>

                    {!o.isPublished && state !== "pending-publish" && (
                      <button
                        onClick={() => run(o.id, () => requestPublish(o.id), t(locale, "prov_off_flash_publish"))}
                        disabled={busyId === o.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
                      >
                        <Icon name="publish" className="text-label" /> {t(locale, "prov_off_publish")}
                      </button>
                    )}

                    {o.isPublished && (
                      <button
                        onClick={() => run(o.id, () => setOfferingVisibility(o.id, { isActive: !o.isActive }), t(locale, o.isActive ? "prov_off_flash_hidden" : "prov_off_flash_visible"))}
                        disabled={busyId === o.id}
                        title={t(locale, "prov_off_visibility_hint")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold text-outline hover:text-primary transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{o.isActive ? "visibility_off" : "visibility"}</span>
                        {t(locale, o.isActive ? "prov_off_hide" : "prov_off_show")}
                      </button>
                    )}

                    <button
                      onClick={() => run(o.id, async () => {
                        const res = await deleteOffering(o.id);
                        return res;
                      }, t(locale, o.isPublished ? "prov_off_flash_delete_review" : "prov_off_flash_deleted"))}
                      disabled={locked || busyId === o.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold text-outline hover:text-error transition-colors disabled:opacity-40"
                    >
                      <Icon name="delete" className="text-label" /> {t(locale, "prov_off_delete")}
                    </button>
                  </div>
                </div>

                {locked && (
                  <p className="text-caption text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                    {t(locale, "prov_off_locked_note")}
                  </p>
                )}
                {o.isPublished && (
                  <p className="text-caption text-outline mt-2">
                    {t(locale, "prov_off_live_note")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <OfferingModal
          offering={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); refresh(); loadPending(); say(msg); }}
        />
      )}
    </div>
  );
}

const MODELS: PricingModel[] = ["FIXED", "RANGE", "PER_UNIT", "ON_INSPECTION"];

function OfferingModal({ offering, onClose, onSaved }: {
  offering: Offering | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { locale } = useLocale();
  const [form, setForm] = useState<OfferingInput>({
    name: offering?.name ?? "",
    description: offering?.description ?? "",
    kind: offering?.kind ?? "SERVICE",
    pricingModel: offering?.pricingModel ?? "RANGE",
    priceMin: offering?.priceMin ?? null,
    priceMax: offering?.priceMax ?? null,
    unit: offering?.unit ?? null,
    minQty: offering?.minQty ?? null,
    note: offering?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tiers, setTiers] = useState(offering?.tiers ?? []);
  const [newTier, setNewTier] = useState({ label: "", qtyMin: "", qtyMax: "", priceMin: "" });
  // Tier writes take one of two paths depending on whether the parent is live,
  // so the outcome has to be stated rather than inferred from the row appearing.
  const [tierFlash, setTierFlash] = useState("");

  const model = form.pricingModel ?? "RANGE";
  const quoteOnly = model === "ON_INSPECTION";

  function set<K extends keyof OfferingInput>(key: K, value: OfferingInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    setError("");
    try {
      // An inspection-quoted item must not carry numbers — the API rejects it,
      // and sending them anyway would just produce a confusing 400.
      const payload: OfferingInput = {
        ...form,
        priceMin: quoteOnly ? null : form.priceMin,
        priceMax: quoteOnly || model === "FIXED" ? null : form.priceMax,
        unit: model === "PER_UNIT" ? form.unit : null,
      };
      if (offering) {
        const res = await updateOffering(offering.id, payload);
        onSaved(t(locale, res.path === "review" ? "prov_off_flash_review" : "prov_off_flash_saved"));
      } else {
        await createOffering(payload);
        onSaved(t(locale, "prov_off_flash_draft"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_off_err_save"));
      setBusy(false);
    }
  }

  async function onAddTier() {
    if (!offering || !newTier.label.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await addTier(offering.id, {
        label: newTier.label.trim(),
        qtyMin: num(newTier.qtyMin),
        qtyMax: num(newTier.qtyMax),
        priceMin: num(newTier.priceMin),
      });
      setTiers(res.offering.tiers);
      setNewTier({ label: "", qtyMin: "", qtyMax: "", priceMin: "" });
      // A band on a live offering is a public price change and waits for review;
      // saying nothing would let the provider believe it was already quotable.
      setTierFlash(t(locale, res.path === "review" ? "prov_off_tier_review" : "prov_off_tier_added"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_off_err_tier"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveTier(tierId: string) {
    setError("");
    try {
      const res = await removeTier(offering!.id, tierId);
      setTiers(res.offering.tiers);
      setTierFlash(t(locale, res.path === "review" ? "prov_off_tier_del_review" : "prov_off_tier_removed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_off_err_tier"));
    }
  }

  // See ProjectEditorModal's comment in ProjectsPage.tsx: caps the panel to the
  // visible height once the on-screen keyboard opens, so the sticky footer
  // doesn't end up rendered underneath it.
  const { height: vvHeight } = useVisualViewport();
  const keyboardOpen = typeof window !== "undefined" && window.innerHeight - vvHeight > 60;
  // Predates the shared Modal component, so the dialog wiring is explicit here.
  // No Escape-to-close: this form carries typed prices and tier rows that a
  // stray keypress must not discard. The × button is the way out.
  const titleId = useId();
  const { containerRef, trapTab } = useDialogA11y(true, onClose, { closeOnEscape: false });

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm">
      <div
        ref={containerRef}
        onKeyDown={trapTab}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface-container-lowest w-full max-w-lg sm:rounded-2xl shadow-2xl modal-max-h overflow-y-auto overscroll-contain"
        style={keyboardOpen ? { maxHeight: vvHeight } : undefined}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 sticky top-0 bg-surface-container-lowest z-10">
          <h3 id={titleId} className="font-bold text-body text-on-surface">
            {t(locale, offering ? "prov_off_modal_edit" : "prov_off_modal_new")}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container" aria-label={t(locale, "common_close")}>
            <Icon name="close" className="text-outline" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{error}</div>
          )}

          {offering?.isPublished && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <p className="text-label text-amber-900 font-bold">
                {t(locale, "prov_off_live_warning")}
              </p>
            </div>
          )}

          <div>
            <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_name")} *</label>
            <input className="field-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div>
            <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_description")}</label>
            <textarea className="field-input" rows={3} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_type")}</label>
              <Select
                value={form.kind ?? "SERVICE"}
                onChange={(v) => set("kind", v as "SERVICE" | "PRODUCT")}
                options={[
                  { value: "SERVICE", label: t(locale, "prov_off_kind_service") },
                  { value: "PRODUCT", label: t(locale, "prov_off_kind_product") },
                ]}
              />
            </div>
            <div>
              <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_pricing")}</label>
              <Select
                value={model}
                onChange={(v) => set("pricingModel", v as PricingModel)}
                options={MODELS.map((m) => ({ value: m, label: PRICING_MODEL_LABELS[m][locale] }))}
              />
            </div>
          </div>

          {quoteOnly ? (
            <p className="text-label text-outline bg-surface-container rounded-xl px-3 py-2.5">
              {t(locale, "prov_off_quote_note_before")} “{formatPrice({ pricingModel: "ON_INSPECTION", priceMin: null, priceMax: null, unit: null }, locale)}”. {t(locale, "prov_off_quote_note_after")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-caption font-bold text-outline mb-1.5">
                  {t(locale, model === "RANGE" ? "prov_off_price_min" : "prov_off_price")} * {t(locale, "prov_off_currency")}
                </label>
                <input
                  className="field-input" type="number" min={0}
                  value={form.priceMin ?? ""}
                  onChange={(e) => set("priceMin", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              {model === "RANGE" && (
                <div>
                  <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_price_max")} * {t(locale, "prov_off_currency")}</label>
                  <input
                    className="field-input" type="number" min={0}
                    value={form.priceMax ?? ""}
                    onChange={(e) => set("priceMax", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
              )}
              {model === "PER_UNIT" && (
                <div>
                  <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_unit")} *</label>
                  <Select
                    value={form.unit ?? ""}
                    onChange={(v) => set("unit", (v || null) as PriceUnit | null)}
                    placeholder={t(locale, "prov_off_choose")}
                    options={[
                      { value: "", label: t(locale, "prov_off_choose") },
                      ...PRICE_UNITS.map((u) => ({ value: u, label: unitLabel(u, locale) })),
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_note_label")}</label>
            <input
              className="field-input" value={form.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              placeholder={t(locale, "prov_off_note_ph")}
            />
          </div>

          {/* Tiers only make sense on a saved row — they hang off its id. */}
          {offering && !quoteOnly && (
            <div className="border-t border-outline-variant/15 pt-4">
              <p className="text-caption font-bold text-outline mb-2">{t(locale, "prov_off_tiers")}</p>
              {tiers.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {tiers.map((tier) => (
                    <div key={tier.id} className="flex items-center justify-between gap-2 bg-surface-container rounded-lg px-3 py-2">
                      <span className="text-label text-on-surface truncate">
                        {tier.label}
                        {formatQtyRange(tier, locale) && ` · ${formatQtyRange(tier, locale)}`}
                      </span>
                      {/* A band the customer cannot be quoted from yet must say so
                          on the row, not only in a flash message that scrolls away. */}
                      {!tier.isPublished && (
                        <span className="text-caption font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {t(locale, "prov_off_tier_pending")}
                        </span>
                      )}
                      <button
                        onClick={() => void onRemoveTier(tier.id)}
                        className="text-outline hover:text-error transition-colors flex-shrink-0 ms-auto"
                        aria-label={t(locale, "prov_off_tier_remove")}
                      >
                        <Icon name="close" className="text-body" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                <input className="field-input col-span-2 !py-2 text-label" placeholder={t(locale, "prov_off_tier_label")} value={newTier.label}
                  onChange={(e) => setNewTier({ ...newTier, label: e.target.value })} />
                <input className="field-input !py-2 text-label" placeholder={t(locale, "prov_off_tier_from")} type="number" value={newTier.qtyMin}
                  onChange={(e) => setNewTier({ ...newTier, qtyMin: e.target.value })} />
                <input className="field-input !py-2 text-label" placeholder={t(locale, "prov_off_tier_to")} type="number" value={newTier.qtyMax}
                  onChange={(e) => setNewTier({ ...newTier, qtyMax: e.target.value })} />
              </div>
              <div className="flex gap-2 mt-2">
                <input className="field-input !py-2 text-label" placeholder={t(locale, "prov_off_tier_price")} type="number" value={newTier.priceMin}
                  onChange={(e) => setNewTier({ ...newTier, priceMin: e.target.value })} />
                <button
                  onClick={() => void onAddTier()} disabled={busy || !newTier.label.trim()}
                  className="bg-surface-container px-4 rounded-xl text-label font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-40 flex-shrink-0"
                >
                  {t(locale, "prov_off_tier_add")}
                </button>
              </div>
              {tierFlash && (
                <p className="text-caption font-bold text-primary mt-1.5">{tierFlash}</p>
              )}
              <p className="text-caption text-outline mt-1.5">
                {t(locale, "prov_off_tier_hint")}
              </p>
            </div>
          )}

        </div>

        {/* Separate sticky footer (not part of the scrolling body above) so
            Save/Cancel stay reachable at the bottom of the viewport instead of
            requiring a scroll past the rest of the form (incl. tiers) to reach
            them. */}
        <div className="flex items-center gap-3 p-5 border-t border-outline-variant/15 sticky bottom-0 bg-surface-container-lowest modal-footer-safe">
          <button
            onClick={() => void save()} disabled={busy || !form.name.trim()}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            <Icon name="save" className="text-subhead" />
            {busy ? t(locale, "prov_off_saving") : t(locale, offering?.isPublished ? "prov_off_send_review" : "prov_off_save")}
          </button>
          <button onClick={onClose} className="text-label font-bold text-outline hover:text-on-surface transition-colors">
            {t(locale, "prov_off_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
