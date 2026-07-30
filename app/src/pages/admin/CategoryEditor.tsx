import { useState } from "react";
import {
  addCategory, updateCategory, deleteCategory, type ServiceCategory,
} from "../../lib/catalog";
import { ModalShell, LField } from "./components/ModalShell";
import { ImageUpload } from "./components/fields";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";

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
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(category?.metaDescription ?? "");

  function save() {
    if (!label.trim()) { alert(t(locale, "admin_cat_label_required")); return; }
    const fields = { label, icon, description, cover, metaTitle, metaDescription };
    if (category) updateCategory(category.slug, fields);
    else addCategory({ slug: "", ...fields });
    onClose();
  }

  return (
    <ModalShell title={isNew ? t(locale, "admin_add_category") : `${t(locale, "admin_edit")} — ${category!.label}`} onClose={onClose}>
      <div className="space-y-4">
        <LField label={t(locale, "admin_cat_label")} required><input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t(locale, "admin_cat_label_ph")} /></LField>
        <LField label={t(locale, "admin_cat_icon")}><input className="field-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder={t(locale, "admin_cat_icon_ph")} /></LField>
        <LField label={t(locale, "admin_cat_description")}><textarea className="field-input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></LField>
        <ImageUpload label={t(locale, "admin_cat_cover")} value={cover} onChange={setCover} shape="wide" maxDim={1200} bucket="covers" />
        <div className="flex items-center gap-2 bg-surface-container rounded-xl p-3">
          <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon || "category"}</span>
          <span className="text-[12px] text-outline">{t(locale, "admin_cat_icon_preview")}</span>
        </div>
        {/* SEO overrides — optional; blank uses the label/description defaults. */}
        <LField label={t(locale, "admin_cat_meta_title")}><input className="field-input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={t(locale, "admin_cat_meta_title_ph")} /></LField>
        <LField label={t(locale, "admin_cat_meta_desc")}><textarea className="field-input resize-none" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder={t(locale, "admin_cat_meta_desc_ph")} /></LField>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant/20">
        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-[14px] text-on-surface hover:bg-surface-container transition-colors">{t(locale, "admin_confirm_cancel")}</button>
        <button onClick={save} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">{t(locale, isNew ? "admin_create" : "admin_save")}</button>
      </div>
    </ModalShell>
  );
}
// Edit + Delete actions for a category card. Deleting a category that still has
// companies prompts for confirmation and, on confirm, cascade-deletes those
// companies too (the API blocks a plain delete with a 409).
export function CategoryCardActions({ cat, onEdit }: { cat: ServiceCategory; onEdit: () => void }) {
  const { locale } = useLocale();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const count = cat.count ?? 0;

  async function doDelete() {
    setBusy(true);
    setErr("");
    try {
      await deleteCategory(cat.slug, count > 0);
      // On success the card disappears via the catalog re-sync; nothing else to do.
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(locale, "admin_cat_delete_failed"));
      setBusy(false);
    }
  }

  if (armed) {
    return (
      <div className="mt-3">
        <p className="text-[12px] font-bold text-error leading-snug mb-2">
          {count > 0
            ? `${t(locale, "admin_cat_has")} ${count} ${t(locale, count === 1 ? "admin_noun_company" : "admin_noun_companies")}. ${t(locale, count === 1 ? "admin_cat_cascade_one" : "admin_cat_cascade_many")} ${t(locale, "admin_cat_undone")}`
            : `${t(locale, "admin_delete")} “${cat.label}”? ${t(locale, "admin_cat_undone")}`}
        </p>
        {err && <p className="text-[12px] font-bold text-error mb-2">{err}</p>}
        <div className="flex gap-2">
          <button onClick={doDelete} disabled={busy}
            className="flex-1 bg-error text-white py-2 rounded-lg text-[12px] font-bold hover:bg-error/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? t(locale, "admin_deleting") : count > 0 ? `${t(locale, "admin_cat_delete_plus")} ${count}` : t(locale, "admin_delete")}
          </button>
          <button onClick={() => { setArmed(false); setErr(""); }} disabled={busy}
            className="flex-1 bg-surface-container text-on-surface py-2 rounded-lg text-[12px] font-bold hover:bg-surface-container-high transition-colors disabled:opacity-60">
            {t(locale, "admin_confirm_cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-3">
      <button onClick={onEdit} className="flex-1 bg-surface-container py-2 rounded-lg text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors">{t(locale, "admin_edit")}</button>
      <button onClick={() => setArmed(true)}
        className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors px-3 py-2 text-[12px]">
        <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </div>
  );
}
