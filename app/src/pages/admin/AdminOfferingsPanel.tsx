import { useEffect, useState } from "react";
import {
  listCompanyOfferings, adminCreateOffering, adminUpdateOffering,
  adminDeleteOffering, adminSetOfferingVisibility,
  type Offering, type OfferingInput, type PricingModel, type PriceUnit,
} from "../../lib/offerings";
import { formatPrice, PRICING_MODEL_LABELS, PRICE_UNITS, unitLabel } from "../../lib/pricing";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import Icon from "../../components/Icon";
import { useVisualViewport } from "../../hooks/useVisualViewport";

/**
 * Admin's own "Services & Pricing" panel for one company — CompanyEditor's
 * "offerings" tab. Deliberately simpler than the provider's OfferingsEditor:
 * every write here goes straight through and is published immediately (see
 * offerings.service.ts adminUpsert) — there is no draft/pending-review dance,
 * because the admin editing it directly IS the review. No tier management
 * either; this covers exactly what was asked for — services/products with a
 * price — the provider dashboard remains where quantity bands are built.
 *
 * Only ever rendered for a company whose category is FIXED_CATALOG (the tab
 * that hosts this is hidden otherwise) — the same gate is enforced server-side
 * regardless, so this is a UX nicety, not the actual protection.
 */

type RowState = "draft" | "hidden" | "live";

function rowState(o: Offering): RowState {
  if (!o.isPublished) return "draft";
  if (!o.isActive) return "hidden";
  return "live";
}

const STATE_BADGES: Record<RowState, { key: StringKey; cls: string }> = {
  draft: { key: "admin_off_state_draft", cls: "bg-surface-container text-outline" },
  hidden: { key: "admin_off_state_hidden", cls: "bg-surface-container text-outline" },
  live: { key: "admin_off_state_live", cls: "bg-green-100 text-green-800" },
};

export function AdminOfferingsPanel({ companyId }: { companyId: string }) {
  const { locale } = useLocale();
  const [items, setItems] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Offering | "new" | null>(null);
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    listCompanyOfferings(companyId)
      .then((rows) => { setItems(rows); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "admin_off_err_load")))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function say(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
  }

  async function run(id: string, fn: () => Promise<unknown>, done: string) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      refresh();
      say(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "admin_off_err_generic"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{error}</div>
      )}
      {flash && (
        <div className="bg-primary/10 border border-primary/25 text-primary rounded-xl px-4 py-2.5 text-label font-bold">{flash}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-outline">{t(locale, "admin_off_desc")}</p>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors flex-shrink-0 touch-press btn-press"
        >
          <Icon name="add" className="text-subhead" /> {t(locale, "admin_off_add")}
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState msg={t(locale, "admin_off_empty")} icon="sell" />
      ) : (
        <div className="space-y-3">
          {items.map((o) => {
            const state = rowState(o);
            const badge = STATE_BADGES[state];
            return (
              <div key={o.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-body text-on-surface truncate">{o.name}</p>
                      <span className={`text-caption font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{t(locale, badge.key)}</span>
                      <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-surface-container text-outline">
                        {t(locale, o.kind === "SERVICE" ? "prov_off_kind_service" : "prov_off_kind_product")}
                      </span>
                    </div>
                    <p className="text-label font-bold text-primary mt-1">{formatPrice(o, locale)}</p>
                    {o.description && <p className="text-label text-outline mt-0.5 line-clamp-2">{o.description}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setEditing(o)}
                      disabled={busyId === o.id}
                      className="flex items-center gap-1 bg-surface-container px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40"
                    >
                      <Icon name="edit" className="text-label" /> {t(locale, "admin_off_edit")}
                    </button>

                    {o.isPublished && (
                      <button
                        onClick={() => run(o.id, () => adminSetOfferingVisibility(companyId, o.id, { isActive: !o.isActive }), t(locale, o.isActive ? "admin_off_flash_hidden" : "admin_off_flash_visible"))}
                        disabled={busyId === o.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold text-outline hover:text-primary transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{o.isActive ? "visibility_off" : "visibility"}</span>
                        {t(locale, o.isActive ? "prov_off_hide" : "prov_off_show")}
                      </button>
                    )}

                    <button
                      onClick={() => run(o.id, () => adminDeleteOffering(companyId, o.id), t(locale, "admin_off_flash_deleted"))}
                      disabled={busyId === o.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold text-outline hover:text-error transition-colors disabled:opacity-40"
                    >
                      <Icon name="delete" className="text-label" /> {t(locale, "prov_off_delete")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AdminOfferingModal
          companyId={companyId}
          offering={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); refresh(); say(msg); }}
        />
      )}
    </div>
  );
}

const MODELS: PricingModel[] = ["FIXED", "RANGE", "PER_UNIT", "ON_INSPECTION"];

function AdminOfferingModal({ companyId, offering, onClose, onSaved }: {
  companyId: string;
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

  const model = form.pricingModel ?? "RANGE";
  const quoteOnly = model === "ON_INSPECTION";

  function set<K extends keyof OfferingInput>(key: K, value: OfferingInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const payload: OfferingInput = {
        ...form,
        priceMin: quoteOnly ? null : form.priceMin,
        priceMax: quoteOnly || model === "FIXED" ? null : form.priceMax,
        unit: model === "PER_UNIT" ? form.unit : null,
      };
      if (offering) await adminUpdateOffering(companyId, offering.id, payload);
      else await adminCreateOffering(companyId, payload);
      onSaved(t(locale, "admin_off_flash_saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_off_err_save"));
      setBusy(false);
    }
  }

  // See ProjectEditorModal's comment in ProjectsPage.tsx: caps the panel to the
  // visible height once the on-screen keyboard opens, so the sticky footer
  // doesn't end up rendered underneath it.
  const { height: vvHeight } = useVisualViewport();
  const keyboardOpen = typeof window !== "undefined" && window.innerHeight - vvHeight > 60;

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm">
      <div
        className="bg-surface-container-lowest w-full max-w-lg sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto"
        style={keyboardOpen ? { maxHeight: vvHeight } : undefined}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 sticky top-0 bg-surface-container-lowest z-10">
          <h3 className="font-bold text-body text-on-surface">
            {t(locale, offering ? "admin_off_modal_edit" : "admin_off_modal_new")}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container" aria-label={t(locale, "common_close")}>
            <Icon name="close" className="text-outline" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{error}</div>
          )}

          {offering && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
              <p className="text-label text-primary font-bold">{t(locale, "admin_off_edit_note")}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_type")}</label>
              <select className="field-input" value={form.kind} onChange={(e) => set("kind", e.target.value as "SERVICE" | "PRODUCT")}>
                <option value="SERVICE">{t(locale, "prov_off_kind_service")}</option>
                <option value="PRODUCT">{t(locale, "prov_off_kind_product")}</option>
              </select>
            </div>
            <div>
              <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_off_pricing")}</label>
              <select className="field-input" value={model} onChange={(e) => set("pricingModel", e.target.value as PricingModel)}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>{PRICING_MODEL_LABELS[m][locale]}</option>
                ))}
              </select>
            </div>
          </div>

          {quoteOnly ? (
            <p className="text-label text-outline bg-surface-container rounded-xl px-3 py-2.5">
              {t(locale, "prov_off_quote_note_before")} “{formatPrice({ pricingModel: "ON_INSPECTION", priceMin: null, priceMax: null, unit: null }, locale)}”. {t(locale, "prov_off_quote_note_after")}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <select
                    className="field-input" value={form.unit ?? ""}
                    onChange={(e) => set("unit", (e.target.value || null) as PriceUnit | null)}
                  >
                    <option value="">{t(locale, "prov_off_choose")}</option>
                    {PRICE_UNITS.map((u) => (
                      <option key={u} value={u}>{unitLabel(u, locale)}</option>
                    ))}
                  </select>
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

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => void save()} disabled={busy || !form.name.trim()}
              className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors disabled:opacity-50 touch-press btn-press"
            >
              <Icon name="save" className="text-subhead" />
              {busy ? t(locale, "prov_off_saving") : t(locale, "admin_off_save")}
            </button>
            <button onClick={onClose} className="text-label font-bold text-outline hover:text-on-surface transition-colors">
              {t(locale, "prov_off_cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
