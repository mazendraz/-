import { useRef, useState } from "react";
import {
  addCategory, updateCategory, deleteCategory, type ServiceCategory,
} from "../../lib/catalog";
import type { CategoryPricingMode } from "../../lib/data";
import { LField } from "./components/ModalShell";
import Modal from "../../components/Modal";
import { ConfirmDialog } from "./components/confirm";
import { ImageUpload } from "./components/fields";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useLocale } from "../../context/LocaleContext";
import { t, tCount } from "../../lib/i18n";
import Icon from "../../components/Icon";

// ══════════════════════════════════════════════════════════════════════════
//  CATEGORY EDITOR
// ══════════════════════════════════════════════════════════════════════════
export function CategoryEditor({ category, onClose }: { category: ServiceCategory | null; onClose: () => void }) {
  const { locale } = useLocale();
  const isNew = !category;
  const [label, setLabel] = useState(category?.label ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "category");
  const [description, setDescription] = useState(category?.description ?? "");
  const [cover, setCover] = useState(category?.cover ?? "");
  const [pricingMode, setPricingMode] = useState<CategoryPricingMode>(category?.pricingMode ?? "QUOTE_ONLY");
  // Shown only when switching FIXED_CATALOG → QUOTE_ONLY on a category that
  // already has companies with published prices — see selectPricingMode.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(category?.metaDescription ?? "");

  // UX-09: no per-field `set()` helper here (each field owns its own
  // `useState`), so dirty-tracking just diffs the live values against what
  // they started as, instead of threading a `setDirty(true)` into every
  // individual `onChange`.
  const initial = useRef({
    label: category?.label ?? "", icon: category?.icon ?? "category", description: category?.description ?? "",
    cover: category?.cover ?? "", pricingMode: category?.pricingMode ?? "QUOTE_ONLY",
    metaTitle: category?.metaTitle ?? "", metaDescription: category?.metaDescription ?? "",
  }).current;
  const dirty = label !== initial.label || icon !== initial.icon || description !== initial.description
    || cover !== initial.cover || pricingMode !== initial.pricingMode
    || metaTitle !== initial.metaTitle || metaDescription !== initial.metaDescription;
  const [confirmingClose, setConfirmingClose] = useState(false);
  const navBlocker = useUnsavedChangesGuard(dirty);

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  const affectedCompanyCount = category?.publishedOfferingCompanyCount ?? 0;

  // Turning the catalog off never deletes anything already published (see
  // offerings.service.ts assertCatalogEnabled — it only blocks NEW create/
  // edit/publish), so this is a confirmation, never a block.
  function selectPricingMode(mode: CategoryPricingMode) {
    if (mode === "QUOTE_ONLY" && pricingMode === "FIXED_CATALOG" && affectedCompanyCount > 0) {
      setConfirmingSwitch(true);
      return;
    }
    setPricingMode(mode);
    setConfirmingSwitch(false);
  }

  function save() {
    if (!label.trim()) { alert(t(locale, "admin_cat_label_required")); return; }
    const fields = { label, icon, description, cover, pricingMode, metaTitle, metaDescription };
    if (category) updateCategory(category.slug, fields);
    else addCategory({ slug: "", ...fields });
    onClose();
  }

  return (
    <>
    <Modal title={isNew ? t(locale, "admin_add_category") : `${t(locale, "admin_edit")} — ${category!.label}`} onClose={requestClose}>
      <div className="p-5">
      <div className="space-y-4">
        <LField label={t(locale, "admin_cat_label")} required><input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t(locale, "admin_cat_label_ph")} /></LField>
        <LField label={t(locale, "admin_cat_icon")}><input className="field-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder={t(locale, "admin_cat_icon_ph")} /></LField>
        <LField label={t(locale, "admin_cat_description")}><textarea className="field-input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></LField>

        {/* Phase 9 — per-category pricing mode. This only decides what a
            provider in the category is offered; the real enforcement lives
            server-side (offerings.service.ts assertCatalogEnabled). */}
        <LField label={t(locale, "admin_cat_pricing_mode_label")}>
          <div className="space-y-2">
            <PricingModeOption
              active={pricingMode === "QUOTE_ONLY"}
              onClick={() => selectPricingMode("QUOTE_ONLY")}
              title={t(locale, "admin_cat_pricing_quote_only_label")}
              desc={t(locale, "admin_cat_pricing_quote_only_desc")}
            />
            <PricingModeOption
              active={pricingMode === "FIXED_CATALOG"}
              onClick={() => selectPricingMode("FIXED_CATALOG")}
              title={t(locale, "admin_cat_pricing_fixed_label")}
              desc={t(locale, "admin_cat_pricing_fixed_desc")}
            />
          </div>
          {pricingMode === "FIXED_CATALOG" && (
            <p className="text-caption text-outline mt-2">{t(locale, "admin_cat_pricing_fixed_hint")}</p>
          )}
          {confirmingSwitch && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-caption font-bold text-amber-800 leading-relaxed">
                {t(locale, "admin_cat_has")} {affectedCompanyCount} {tCount(locale, "noun_company", affectedCompanyCount)} {t(locale, "admin_cat_pricing_switch_warning_suffix")}
              </p>
              <div className="flex gap-2 mt-2.5">
                <button type="button" onClick={() => { setPricingMode("QUOTE_ONLY"); setConfirmingSwitch(false); }}
                  className="flex-1 bg-amber-600 text-white py-2 rounded-lg text-caption font-bold hover:bg-amber-700 transition-colors">
                  {t(locale, "admin_cat_pricing_switch_confirm")}
                </button>
                <button type="button" onClick={() => setConfirmingSwitch(false)}
                  className="flex-1 bg-surface-container text-on-surface py-2 rounded-lg text-caption font-bold hover:bg-surface-container-high transition-colors">
                  {t(locale, "admin_confirm_cancel")}
                </button>
              </div>
            </div>
          )}
        </LField>

        <ImageUpload label={t(locale, "admin_cat_cover")} value={cover} onChange={setCover} shape="wide" maxDim={1200} bucket="covers" />
        <div className="flex items-center gap-2 bg-surface-container rounded-xl p-3">
          <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{icon || "category"}</span>
          <span className="text-caption text-outline">{t(locale, "admin_cat_icon_preview")}</span>
        </div>
        {/* SEO overrides — optional; blank uses the label/description defaults. */}
        <LField label={t(locale, "admin_cat_meta_title")}><input className="field-input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={t(locale, "admin_cat_meta_title_ph")} /></LField>
        <LField label={t(locale, "admin_cat_meta_desc")}><textarea className="field-input resize-none" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder={t(locale, "admin_cat_meta_desc_ph")} /></LField>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant/20">
        <button onClick={requestClose} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors">{t(locale, "admin_confirm_cancel")}</button>
        <button onClick={save} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press">{t(locale, isNew ? "admin_create" : "admin_save")}</button>
      </div>
      </div>
    </Modal>
      {confirmingClose && (
        <ConfirmDialog
          title={t(locale, "unsaved_changes_title")}
          message={t(locale, "unsaved_changes_body")}
          confirmLabel={t(locale, "unsaved_changes_discard")}
          onConfirm={() => { setConfirmingClose(false); onClose(); }}
          onCancel={() => setConfirmingClose(false)}
        />
      )}
      {navBlocker.state === "blocked" && (
        <ConfirmDialog
          title={t(locale, "unsaved_changes_title")}
          message={t(locale, "unsaved_changes_body")}
          confirmLabel={t(locale, "unsaved_changes_discard")}
          onConfirm={() => navBlocker.proceed()}
          onCancel={() => navBlocker.reset()}
        />
      )}
    </>
  );
}

// One selectable pricing-mode row. Not a native <input type="radio"> — those
// are near-impossible to restyle consistently (esp. mirrored in RTL), and this
// project has no existing radio pattern to match, so a plain toggle button
// styled like the app's other selectable rows is the more consistent choice.
function PricingModeOption({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 text-start rounded-xl border p-3 transition-colors touch-press ${
        active ? "border-primary bg-primary/5" : "border-outline-variant/30 bg-surface-container hover:border-outline-variant"
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        active ? "border-primary" : "border-outline-variant"
      }`}>
        {active && <span className="w-2 h-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-label font-bold text-on-surface">{title}</span>
        <span className="block text-caption text-outline mt-0.5 leading-snug">{desc}</span>
      </span>
    </button>
  );
}

// Edit + Delete actions for a category card. Deleting a category NEVER deletes
// a company — it only removes that one category link (a company can belong to
// several). If any company would be left with zero categories, the API (and
// the demo-mode mirror) blocks the delete with a 409-style error instead.
export function CategoryCardActions({ cat, onEdit }: { cat: ServiceCategory; onEdit: () => void }) {
  const { locale } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const count = cat.count ?? 0;

  async function doDelete() {
    setBusy(true);
    setErr("");
    try {
      await deleteCategory(cat.slug);
      // On success the card disappears via the catalog re-sync; nothing else to do.
      setConfirming(false);
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(locale, "admin_cat_delete_failed"));
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 mt-3">
      {/* DM-06: py-2 + text-caption measured 32px. */}
      <button onClick={onEdit} className="flex-1 bg-surface-container py-2 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors">{t(locale, "admin_edit")}</button>
      <button onClick={() => setConfirming(true)}
        aria-label={`${t(locale, "admin_delete")} ${cat.label}`}
        className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors w-11 h-11 -m-2.5 text-caption">
        <Icon name="delete" className="text-body" />
      </button>
      {confirming && (
        <ConfirmDialog
          title={`${t(locale, "admin_delete")} ${cat.label}`}
          message={
            <>
              {count > 0
                ? `${t(locale, "admin_cat_has")} ${count} ${tCount(locale, "noun_company", count)}. ${t(locale, count === 1 ? "admin_cat_cascade_one" : "admin_cat_cascade_many")} ${t(locale, "admin_cat_undone")}`
                : t(locale, "admin_cat_undone")}
              {err && <span className="block font-bold text-error mt-2">{err}</span>}
            </>
          }
          confirmLabel={busy ? t(locale, "admin_deleting") : t(locale, "admin_delete")}
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => { setConfirming(false); setErr(""); }}
        />
      )}
    </div>
  );
}
