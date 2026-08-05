import { useState } from "react";
import {
  addCompany, updateCompany, deleteCompany, emptyCompany, MAX_CATEGORIES_PER_COMPANY,
  type Company, type CompanyDraft, type ServiceCategory, type Project,
} from "../../lib/catalog";
import { isApiConfigured } from "../../lib/api";
import { setCompanyAvailability, isBusy } from "../../lib/availability";
import AvailabilityControl from "../../components/AvailabilityControl";
import BusyWindowsEditor from "../../components/BusyWindowsEditor";
import WaitlistManager from "../../components/WaitlistManager";
import CategoryMultiSelect, { type CategorySelection } from "../../components/CategoryMultiSelect";
import { AdminOfferingsPanel } from "./AdminOfferingsPanel";
import { LField } from "./components/ModalShell";
import Modal from "../../components/Modal";
import Tabs, { TabPanel } from "../../components/Tabs";
import { TagField, ImageUpload, GalleryUpload } from "./components/fields";
import { ConfirmDelete } from "./components/confirm";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useLocale } from "../../context/LocaleContext";
import { t, type StringKey } from "../../lib/i18n";
import { isValidE164 } from "../../lib/phone";
import Icon from "../../components/Icon";
import PhoneInput from "../../components/PhoneInput";

// Sub-tab id → label key. The ids are internal state, the labels are not.
const EDITOR_TAB_KEYS: Record<EditorTab, StringKey> = {
  details: "admin_ce_tab_details",
  projects: "admin_ce_tab_projects",
  availability: "admin_ce_tab_availability",
  offerings: "admin_ce_tab_offerings",
};

// ══════════════════════════════════════════════════════════════════════════
//  COMPANY EDITOR
// ══════════════════════════════════════════════════════════════════════════
export type EditorTab = "details" | "projects" | "availability" | "offerings";

export function CompanyEditor({ company, categories, onClose }: {
  company: Company | null;
  categories: ServiceCategory[];
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const isNew = !company;
  const [tab, setTab] = useState<EditorTab>("details");
  const [draft, setDraft] = useState<CompanyDraft & { id?: string }>(() =>
    company ? { ...company } : emptyCompany()
  );
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const navBlocker = useUnsavedChangesGuard(dirty);

  function set<K extends keyof CompanyDraft>(key: K, val: CompanyDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
    setDirty(true);
  }

  // `categories` (the full membership) is the source of truth; `category`/
  // `categoryLabel` (the primary) are kept in sync alongside it so every other
  // spot in the codebase that still reads those two singular fields for
  // display stays correct without needing to know about the list.
  function onCategoriesChange(next: CategorySelection[]) {
    const primary = next.find((c) => c.isPrimary) ?? next[0];
    setDraft((d) => ({
      ...d,
      categories: next,
      category: primary?.slug ?? "",
      categoryLabel: primary?.label ?? "",
    }));
    setDirty(true);
  }

  // UX-09: the × button and backdrop-click both route through `onClose` — a
  // dirty draft gets a confirm instead of being discarded on a stray click.
  // (`useUnsavedChangesGuard` above covers the OTHER two ways to lose it:
  // closing the tab, and navigating away via the sidebar while this is open.)
  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  // Validate the fields the live API requires before saving — otherwise the
  // create/update is rejected server-side and the row vanishes on the next sync.
  // In demo mode (no API) only the name is enforced.
  function validate(): string | null {
    if (draft.name.trim().length < 2) return t(locale, "admin_ce_name_min");
    if (isApiConfigured()) {
      if (draft.categories.length === 0) return t(locale, "admin_ce_pick_category");
      if (!draft.logo) return t(locale, "admin_ce_need_logo");
      if (!draft.cover) return t(locale, "admin_ce_need_cover");
      if (!isValidE164(draft.phone)) return t(locale, "admin_ce_need_phone");
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) { setSaveError(problem); setTab("details"); return; }
    setSaving(true);
    setSaveError("");
    try {
      if (company) await updateCompany(company.id, draft);
      else await addCompany(draft);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setSaveError(
        /quota/i.test(msg) || (err as { name?: string })?.name === "QuotaExceededError"
          ? t(locale, "admin_ce_quota")
          : msg || t(locale, "admin_ce_save_failed")
      );
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal title={isNew ? t(locale, "admin_add_company") : `${t(locale, "admin_edit")} — ${company!.name}`} onClose={requestClose} wide>
      <div className="p-5">
      {/* Sub-tabs. Availability and Pricing are per-company and use their own
          endpoints, so they only show once the company exists (needs an id) —
          Pricing additionally only when the company's category has opted into
          a fixed catalog (see Phase 9 — CategoryEditor). */}
      <Tabs
        idPrefix="ce"
        activeId={tab}
        onChange={setTab}
        className="flex gap-1 border-b border-outline-variant/20 px-1 -mt-2 mb-5"
        // whitespace-nowrap + flex-shrink-0 are what make the scroll container
        // on <Tabs> actually scroll (DM-09) — without them the labels wrap and
        // squash instead of overflowing.
        // DM-06: py-2.5 + text-label measured 38px (logged during Phase 1).
        tabClassName={(active) => `px-4 py-2.5 min-h-[44px] text-label font-bold border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${active ? "text-primary border-primary" : "text-outline border-transparent hover:text-on-surface"}`}
        items={([
          "details", "projects",
          ...(isNew ? [] : ["availability" as const]),
          // Permissive union — ANY of the company's linked categories may
          // enable the catalog, not just its primary (see offerings.service.ts
          // assertCatalogEnabled).
          ...(!isNew && company?.categories?.some((c) => c.pricingMode === "FIXED_CATALOG") ? ["offerings" as const] : []),
        ] as EditorTab[]).map((id) => ({
          id,
          label: (
            <>
              {t(locale, EDITOR_TAB_KEYS[id])}
              {id === "projects" && draft.projects.length > 0 && <span className="ms-1 text-outline">({draft.projects.length})</span>}
            </>
          ),
        }))}
      />

      {tab === "details" && (
        <TabPanel idPrefix="ce" id="details" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_name")} required><input className="field-input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={t(locale, "admin_ce_name_ph")} /></LField>
            <LField label={t(locale, "admin_ce_tagline")}><input className="field-input" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder={t(locale, "admin_ce_tagline_ph")} /></LField>
          </div>
          <LField label={t(locale, "admin_ce_categories")} required>
            <CategoryMultiSelect
              categories={categories}
              selected={draft.categories}
              onChange={onCategoriesChange}
              max={MAX_CATEGORIES_PER_COMPANY}
            />
          </LField>
          <LField label={t(locale, "admin_ce_about")}><textarea className="field-input resize-none" rows={3} value={draft.about} onChange={(e) => set("about", e.target.value)} /></LField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUpload label={t(locale, "admin_ce_logo")} value={draft.logo} onChange={(v) => set("logo", v)} shape="logo" maxDim={256} bucket="logos" />
            <ImageUpload label={t(locale, "admin_ce_cover")} value={draft.cover} onChange={(v) => set("cover", v)} shape="wide" maxDim={1200} bucket="covers" />
          </div>
          <GalleryUpload images={draft.gallery} onChange={(g) => set("gallery", g)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_phone")}><PhoneInput value={draft.phone} onChange={(v) => set("phone", v)} /></LField>
            <LField label={t(locale, "admin_ce_location")}><input className="field-input" value={draft.location} onChange={(e) => set("location", e.target.value)} /></LField>
          </div>

          {/* Internal lead-notification contact — NOT shown publicly. New-lead
              emails are sent to this address; leave blank to disable email alerts
              for this company. */}
          <div className="bg-surface-container rounded-xl p-3.5 space-y-4">
            <p className="text-caption font-bold text-outline flex items-center gap-1.5">
              <Icon name="notifications" className="text-body" />
              {t(locale, "admin_ce_notif_title")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LField label={t(locale, "admin_ce_notif_email")}>
                <input className="field-input" type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder={t(locale, "admin_ce_notif_email_ph")} />
              </LField>
              <LField label={t(locale, "admin_ce_whatsapp")}>
                <PhoneInput value={draft.whatsapp ?? ""} onChange={(v) => set("whatsapp", v)} />
              </LField>
            </div>
          </div>

          <TagField label={t(locale, "admin_ce_services")} tags={draft.services} onChange={(v) => set("services", v)} placeholder={t(locale, "admin_ce_services_ph")} />
          {/* Trust numbers. Rating + Reviews are auto-calculated from the Review
              table unless an admin ticks "set manually" below to override them. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <LField label={t(locale, "admin_ce_rating")}>
              {draft.ratingOverridden ? (
                <input type="number" min="0" max="5" step="0.1" className="field-input" value={draft.rating ?? 0}
                  onChange={(e) => set("rating", Math.min(5, Math.max(0, Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title={t(locale, "admin_ce_auto_title")}>
                  {Number(draft.rating ?? 0).toFixed(1)}
                </div>
              )}
            </LField>
            <LField label={t(locale, "admin_ce_reviews")}>
              {draft.ratingOverridden ? (
                <input type="number" min="0" className="field-input" value={draft.reviewCount ?? 0}
                  onChange={(e) => set("reviewCount", Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title={t(locale, "admin_ce_auto_title")}>
                  {draft.reviewCount ?? 0}
                </div>
              )}
            </LField>
            <LField label={t(locale, "admin_ce_projects")}><input type="number" min="0" className="field-input" value={draft.completedProjects} onChange={(e) => set("completedProjects", Number(e.target.value))} /></LField>
            <LField label={t(locale, "admin_ce_years")}><input type="number" min="0" className="field-input" value={draft.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} /></LField>
          </div>
          <label className="flex items-start gap-2.5 -mt-1 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" checked={draft.ratingOverridden === true}
              onChange={(e) => set("ratingOverridden", e.target.checked)} />
            <span className="text-caption text-outline">
              {t(locale, draft.ratingOverridden ? "admin_ce_rating_manual" : "admin_ce_rating_auto")}
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_response")}><input className="field-input" value={draft.responseTime} onChange={(e) => set("responseTime", e.target.value)} placeholder={t(locale, "admin_ce_response_ph")} /></LField>
            <LField label={t(locale, "admin_ce_verified_since")}><input className="field-input" value={draft.verifiedSince} onChange={(e) => set("verifiedSince", e.target.value)} placeholder="2021" /></LField>
          </div>
          <TagField label={t(locale, "admin_ce_badges")} tags={draft.badges} onChange={(v) => set("badges", v)} placeholder={t(locale, "admin_ce_badges_ph")} />
          {/* Verified toggle */}
          <label className="flex items-center gap-3 bg-primary/6 border border-primary/18 rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={draft.verified === true} onChange={(e) => set("verified", e.target.checked)} />
            <div>
              <p className="font-bold text-label text-on-surface flex items-center gap-1.5">
                <Icon name="verified" className="text-primary text-body" style={{ fontVariationSettings: "'FILL' 1" }} />
                {t(locale, "admin_ce_verified")}
              </p>
              <p className="text-caption text-outline">{t(locale, "admin_ce_verified_hint")}</p>
            </div>
          </label>

          {/* Featured toggle */}
          <label className="flex items-center gap-3 bg-surface-container rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={draft.featured !== false} onChange={(e) => set("featured", e.target.checked)} />
            <div>
              <p className="font-bold text-label text-on-surface">{t(locale, "admin_ce_featured")}</p>
              <p className="text-caption text-outline">{t(locale, "admin_ce_featured_hint")}</p>
            </div>
          </label>

          {/* SEO overrides — optional; blank uses the name/tagline defaults. */}
          <div className="bg-surface-container rounded-xl p-3.5 space-y-4">
            <p className="text-caption font-bold text-outline flex items-center gap-1.5">
              <Icon name="travel_explore" className="text-body" />
              {t(locale, "admin_ce_seo_title")}
            </p>
            <LField label={t(locale, "admin_ce_meta_title")}>
              <input className="field-input" value={draft.metaTitle ?? ""} onChange={(e) => set("metaTitle", e.target.value)} placeholder={t(locale, "admin_ce_meta_title_ph")} />
            </LField>
            <LField label={t(locale, "admin_ce_meta_desc")}>
              <textarea className="field-input resize-none" rows={2} value={draft.metaDescription ?? ""} onChange={(e) => set("metaDescription", e.target.value)} placeholder={t(locale, "admin_cat_meta_desc_ph")} />
            </LField>
          </div>
        </TabPanel>
      )}

      {tab === "projects" && (
        <TabPanel idPrefix="ce" id="projects">
          <ProjectsEditor projects={draft.projects} onChange={(p) => set("projects", p)} />
        </TabPanel>
      )}

      {tab === "availability" && company && (
        <TabPanel idPrefix="ce" id="availability" className="space-y-6">
          <div>
            <p className="text-label text-outline mb-4 leading-relaxed">
              {t(locale, "admin_ce_availability_hint")}
            </p>
            <AvailabilityControl
              key={`${company.id}-${company.busy}-${company.busyUntil ?? ""}`}
              initialBusy={isBusy(company)}
              initialBusyUntil={company.busyUntil}
              initialNote={company.busyNote}
              onSave={(p) => setCompanyAvailability(company.id, p)}
            />
          </div>
          <div className="border-t border-outline-variant/20 pt-6">
            <WaitlistManager scope={{ kind: "admin", companyId: company.id }} />
          </div>
        </TabPanel>
      )}

      {tab === "offerings" && company && (
        <TabPanel idPrefix="ce" id="offerings">
          <AdminOfferingsPanel companyId={company.id} />
        </TabPanel>
      )}

      {/* Footer actions — sticky so Save is always reachable */}
      <div className="sticky bottom-0 -mx-5 px-5 py-3.5 mt-6 bg-surface-container-lowest/97 backdrop-blur-lg border-t border-outline-variant/20 flex flex-col gap-2">
        {saveError && (
          <p className="text-label text-error font-medium bg-error/8 rounded-lg px-3 py-2">{saveError}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          {!isNew ? (
            <ConfirmDelete onConfirm={() => { deleteCompany(company!.id); onClose(); }} label={t(locale, "admin_noun_company")} big />
          ) : <span />}
          <div className="flex gap-2.5 ms-auto">
            <button onClick={requestClose} disabled={saving} className="px-4 sm:px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">{t(locale, "admin_confirm_cancel")}</button>
            <button onClick={save} disabled={saving} className="px-5 sm:px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
              {saving && <Icon name="progress_activity" className="text-subhead animate-spin" />}
              {t(locale, saving ? "admin_saving" : isNew ? "admin_create" : "admin_save_changes")}
            </button>
          </div>
        </div>
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

// ── Projects editor ──
export function ProjectsEditor({ projects, onChange }: { projects: Project[]; onChange: (p: Project[]) => void }) {
  const { locale } = useLocale();
  const blank = (): Project => ({ title: "", img: "", description: "", year: String(new Date().getFullYear()), featured: false });
  const [d, setD] = useState<Project>(blank);
  function add() {
    if (!d.title.trim()) return;
    onChange([{ ...d }, ...projects]);
    setD(blank());
  }
  function toggleFeatured(i: number) {
    onChange(projects.map((p, idx) => (idx === i ? { ...p, featured: !p.featured } : p)));
  }
  return (
    <div className="space-y-4">
      <div className="bg-surface-container rounded-xl p-4 space-y-3">
        <p className="text-caption font-black ltr:uppercase ltr:tracking-wide text-outline">{t(locale, "admin_pe_add")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="field-input sm:col-span-2" placeholder={t(locale, "admin_pe_title_ph")} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <input className="field-input" placeholder={t(locale, "admin_pe_year_ph")} value={d.year} onChange={(e) => setD({ ...d, year: e.target.value })} />
        </div>
        <ImageUpload label={t(locale, "admin_pe_image")} value={d.img} onChange={(v) => setD({ ...d, img: v })} shape="wide" maxDim={1200} bucket="projects" />
        <textarea className="field-input resize-none" rows={2} placeholder={t(locale, "admin_pe_desc_ph")} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <label className="flex items-center gap-2 text-label font-bold text-on-surface cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-secondary" checked={d.featured ?? false} onChange={(e) => setD({ ...d, featured: e.target.checked })} />
          {t(locale, "admin_pe_feature_label")}
        </label>
        <button onClick={add} className="bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-label hover:bg-primary-container transition-colors">{t(locale, "admin_pe_add")}</button>
      </div>
      {projects.length === 0 ? (
        <p className="text-label text-outline text-center py-6">{t(locale, "admin_pe_none")}</p>
      ) : projects.map((p, i) => (
        <div key={i} className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-3">
          {p.img && <img src={p.img} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" loading="lazy" width={48} height={48} />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-label text-on-surface truncate">{p.title}</p>
            <p className="text-caption text-outline truncate">{p.year} · {p.description}</p>
          </div>
          {/* DM-06: was ~38px. */}
          <button onClick={() => toggleFeatured(i)} title={t(locale, p.featured ? "admin_ce_featured" : "admin_pe_feature_title")}
            aria-label={`${t(locale, p.featured ? "admin_ce_featured" : "admin_pe_feature_title")} — ${p.title}`}
            className={`w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ${p.featured ? "text-secondary" : "text-outline hover:text-secondary"}`}>
            <Icon name="star" className="text-subhead" style={{ fontVariationSettings: p.featured ? "'FILL' 1" : "'FILL' 0" }} />
          </button>
          <button onClick={() => onChange(projects.filter((_, idx) => idx !== i))} aria-label={`${t(locale, "admin_delete")} ${p.title}`} className="w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg hover:bg-error/10 text-outline hover:text-error transition-colors flex-shrink-0">
            <Icon name="delete" className="text-subhead" />
          </button>
        </div>
      ))}
    </div>
  );
}
