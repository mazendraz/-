import { useState } from "react";
import {
  addCompany, updateCompany, deleteCompany, emptyCompany, MAX_CATEGORIES_PER_COMPANY,
  type Company, type CompanyDraft, type ServiceCategory, type Project,
} from "../../lib/catalog";
import { isApiConfigured, ApiError, type ApiErrorDetails } from "../../lib/api";
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
import { t, type StringKey, type Locale } from "../../lib/i18n";
import { isValidE164 } from "../../lib/phone";
import Icon from "../../components/Icon";
import PhoneInput from "../../components/PhoneInput";

// Server field path → the label THIS form already shows for that field.
//
// The API has always answered a rejected write with per-field messages
// (ApiErrorBody.details); the client just dropped them, so every refusal
// rendered as the bare "Validation failed" — on a form with forty fields, on a
// payload the admin never assembled by hand (the editor PUTs the COMPLETE
// record on every save, so the field at fault is very often one the admin never
// touched). Naming the field is the whole point: that is the difference between
// "something is wrong" and "the gallery has too many images".
const ERROR_FIELD_LABEL_KEYS: Record<string, StringKey> = {
  categoryIds: "admin_ce_categories",
  primaryCategoryId: "admin_ce_categories",
  name: "admin_ce_name",
  nameAr: "admin_ce_name_ar",
  tagline: "admin_ce_tagline",
  about: "admin_ce_about",
  logo: "admin_ce_logo",
  cover: "admin_ce_cover",
  gallery: "prov_field_gallery",
  services: "admin_ce_services",
  badges: "admin_ce_badges",
  phone: "admin_ce_phone",
  location: "admin_ce_location",
  yearsExperience: "admin_ce_years",
  responseTime: "admin_ce_response",
  verifiedSince: "admin_ce_verified_since",
  completedProjects: "admin_ce_projects",
  rating: "admin_ce_rating",
  reviewCount: "admin_ce_reviews",
  metaTitle: "admin_ce_meta_title",
  metaDescription: "admin_ce_meta_desc",
  email: "admin_ce_notif_email",
  whatsapp: "admin_ce_whatsapp",
  projects: "admin_ce_tab_projects",
};

/**
 * A Zod sentence ("Too big: expected array to have <=100 items") turned into
 * something that reads as advice under an Arabic form field. Anything this
 * doesn't recognise is passed through untouched — a message the admin can quote
 * to a developer beats a friendly one that hides which rule was broken.
 */
function humanizeIssue(message: string, locale: Locale): string {
  const withN = (key: StringKey, n: string) => t(locale, key).replace("{n}", n);
  const bound = (kind: "array" | "string", dir: "<=" | ">=") =>
    new RegExp(`${kind} to have ${dir}(\\d+)`).exec(message);
  let m: RegExpExecArray | null;
  if ((m = bound("array", "<="))) return withN("admin_ce_err_max_items", m[1]);
  if ((m = bound("array", ">="))) return withN("admin_ce_err_min_items", m[1]);
  if ((m = bound("string", "<="))) return withN("admin_ce_err_max_chars", m[1]);
  // ">=1 characters" is Zod's way of saying the box is empty; "at least 1
  // character" is a sentence nobody has ever needed to read.
  if ((m = bound("string", ">=")))
    return m[1] === "1" ? t(locale, "admin_ce_err_required") : withN("admin_ce_err_min_chars", m[1]);
  if (/URL, data URL, or site-relative path/i.test(message)) return t(locale, "admin_ce_err_image");
  if (/email/i.test(message)) return t(locale, "admin_ce_err_email");
  if (/expected number|expected int/i.test(message)) return t(locale, "admin_ce_err_number");
  if (/required|expected string, received/i.test(message)) return t(locale, "admin_ce_err_required");
  return message;
}

type FieldFlags = Record<string, string>;

/**
 * Server field paths → { formField: message }, so each message can be printed
 * on the control it belongs to.
 *
 * Paths arrive dotted: "gallery", but also "projects.2.img". Only the head
 * segment names a control the admin can see, so that is the key; a numeric
 * second segment becomes a row number in the text, because with 40 projects
 * "one of them has no image" is not an actionable sentence.
 */
function toFieldFlags(details: ApiErrorDetails, locale: Locale): FieldFlags {
  const flags: FieldFlags = {};
  for (const [path, messages] of Object.entries(details)) {
    const [head, second] = path.split(".");
    const human = messages.map((msg) => humanizeIssue(msg, locale)).join(" — ");
    const row = /^\d+$/.test(second ?? "")
      ? `${t(locale, "admin_ce_err_row").replace("{n}", String(Number(second) + 1))}: `
      : "";
    flags[head] = flags[head] ? `${flags[head]} • ${row}${human}` : `${row}${human}`;
  }
  return flags;
}

/**
 * Fields the form has no control for (a schema key this editor doesn't render,
 * or one added later) still have to be reported SOMEWHERE — a red ring on a
 * control that doesn't exist is silence. Those go to the banner instead.
 */
function unflaggableSummary(flags: FieldFlags, locale: Locale): string {
  return Object.entries(flags)
    .filter(([field]) => !(field in ERROR_FIELD_LABEL_KEYS))
    .map(([field, message]) => `${field}: ${message}`)
    .join("\n");
}

/**
 * Marks a COMPOSITE field a rejected save named — the tag editors, the image
 * pickers, the gallery, the projects tab. `LField` does this for plain inputs;
 * these render their own label and chrome and have no single input to ring.
 */
function Flagged({ error, children }: { error?: string; children: React.ReactNode }) {
  if (!error) return <>{children}</>;
  return (
    <div>
      <div className="field-flag">{children}</div>
      <p className="field-flag-msg text-caption">{error}</p>
    </div>
  );
}

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
  // Which controls the last rejected save named, keyed by form field. Cleared
  // per-field the moment the admin edits that field, so the red goes away where
  // they fixed it and stays where they haven't.
  const [fieldFlags, setFieldFlags] = useState<FieldFlags>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const navBlocker = useUnsavedChangesGuard(dirty);

  function clearFlags(...fields: string[]) {
    setFieldFlags((flags) => {
      if (!fields.some((f) => f in flags)) return flags; // no re-render for nothing
      const next = { ...flags };
      for (const f of fields) delete next[f];
      return next;
    });
  }

  function set<K extends keyof CompanyDraft>(key: K, val: CompanyDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
    setDirty(true);
    clearFlags(String(key));
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
    // The server names these `categoryIds`/`primaryCategoryId`; the form calls
    // the control "categories". Both spellings clear together.
    clearFlags("categoryIds", "primaryCategoryId");
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
  // Keyed by the same field names the SERVER uses, so a locally-caught problem
  // and a server-rejected one light up the same control the same way. Every
  // problem is collected, not just the first: returning early meant an admin
  // with three empty fields fixed them one save at a time.
  function validate(): FieldFlags {
    const flags: FieldFlags = {};
    if (draft.name.trim().length < 2) flags.name = t(locale, "admin_ce_name_min");
    if (isApiConfigured()) {
      if (draft.categories.length === 0) flags.categoryIds = t(locale, "admin_ce_pick_category");
      if (!draft.logo) flags.logo = t(locale, "admin_ce_need_logo");
      if (!draft.cover) flags.cover = t(locale, "admin_ce_need_cover");
      if (!isValidE164(draft.phone)) flags.phone = t(locale, "admin_ce_need_phone");
    }
    return flags;
  }

  /** Does this tab hold a flagged field? Everything except `projects` is edited
   *  on Details, so a flag that isn't a project belongs to that tab. */
  function tabHasFlag(id: EditorTab): boolean {
    const fields = Object.keys(fieldFlags);
    if (id === "projects") return fields.includes("projects");
    if (id === "details") return fields.some((f) => f !== "projects");
    return false;
  }

  /** Put the admin on the tab holding a flagged field — Details unless the only
   *  thing wrong is a project, which lives behind another tab entirely. */
  function focusFlags(flags: FieldFlags) {
    if (Object.keys(flags).length === 0) return;
    setTab(Object.keys(flags).every((f) => f === "projects") ? "projects" : "details");
  }

  async function save() {
    const problems = validate();
    if (Object.keys(problems).length > 0) {
      setFieldFlags(problems);
      setSaveError(t(locale, "admin_ce_err_banner"));
      focusFlags(problems);
      return;
    }
    setSaving(true);
    setSaveError("");
    setFieldFlags({});
    try {
      if (company) await updateCompany(company.id, draft);
      else await addCompany(draft);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // A validation refusal carries the useful half in `details`; `message` is
      // the constant "Validation failed" and says nothing worth printing.
      const flags = err instanceof ApiError && err.details ? toFieldFlags(err.details, locale) : {};
      const flagged = Object.keys(flags).length > 0;
      setFieldFlags(flags);
      focusFlags(flags);
      const leftover = flagged ? unflaggableSummary(flags, locale) : "";
      setSaveError(
        /quota/i.test(msg) || (err as { name?: string })?.name === "QuotaExceededError"
          ? t(locale, "admin_ce_quota")
          : flagged
            ? [t(locale, "admin_ce_err_banner"), leftover].filter(Boolean).join("\n")
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
              {/* A flagged field can sit on a tab that isn't open — without this
                  the admin reads "fix the fields in red" and sees none. */}
              {tabHasFlag(id) && (
                <span className="ms-1.5 inline-block w-1.5 h-1.5 rounded-full bg-error align-middle" aria-hidden="true" />
              )}
            </>
          ),
        }))}
      />

      {tab === "details" && (
        <TabPanel idPrefix="ce" id="details" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_name")} required error={fieldFlags.name}><input className="field-input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={t(locale, "admin_ce_name_ph")} /></LField>
            <LField label={t(locale, "admin_ce_name_ar")} error={fieldFlags.nameAr}><input className="field-input" dir="rtl" value={draft.nameAr ?? ""} onChange={(e) => set("nameAr", e.target.value)} placeholder={t(locale, "admin_ce_name_ar_ph")} /></LField>
            <LField label={t(locale, "admin_ce_tagline")} error={fieldFlags.tagline}><input className="field-input" value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder={t(locale, "admin_ce_tagline_ph")} /></LField>
          </div>
          <LField label={t(locale, "admin_ce_categories")} required error={fieldFlags.categoryIds ?? fieldFlags.primaryCategoryId}>
            <CategoryMultiSelect
              categories={categories}
              selected={draft.categories}
              onChange={onCategoriesChange}
              max={MAX_CATEGORIES_PER_COMPANY}
            />
          </LField>
          <LField label={t(locale, "admin_ce_about")} error={fieldFlags.about}><textarea className="field-input resize-none" rows={3} value={draft.about} onChange={(e) => set("about", e.target.value)} /></LField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Flagged error={fieldFlags.logo}>
              <ImageUpload label={t(locale, "admin_ce_logo")} value={draft.logo} onChange={(v) => set("logo", v)} shape="logo" maxDim={256} bucket="logos" />
            </Flagged>
            <Flagged error={fieldFlags.cover}>
              <ImageUpload label={t(locale, "admin_ce_cover")} value={draft.cover} onChange={(v) => set("cover", v)} shape="wide" maxDim={1200} bucket="covers" />
            </Flagged>
          </div>
          <Flagged error={fieldFlags.gallery}>
            <GalleryUpload images={draft.gallery} onChange={(g) => set("gallery", g)} />
          </Flagged>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_phone")} error={fieldFlags.phone}><PhoneInput value={draft.phone} onChange={(v) => set("phone", v)} /></LField>
            <LField label={t(locale, "admin_ce_location")} error={fieldFlags.location}><input className="field-input" value={draft.location} onChange={(e) => set("location", e.target.value)} /></LField>
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
              <LField label={t(locale, "admin_ce_notif_email")} error={fieldFlags.email}>
                <input className="field-input" type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder={t(locale, "admin_ce_notif_email_ph")} />
              </LField>
              <LField label={t(locale, "admin_ce_whatsapp")} error={fieldFlags.whatsapp}>
                <PhoneInput value={draft.whatsapp ?? ""} onChange={(v) => set("whatsapp", v)} />
              </LField>
            </div>
          </div>

          <Flagged error={fieldFlags.services}>
            <TagField label={t(locale, "admin_ce_services")} tags={draft.services} onChange={(v) => set("services", v)} placeholder={t(locale, "admin_ce_services_ph")} />
          </Flagged>
          {/* Trust numbers. Rating + Reviews are auto-calculated from the Review
              table unless an admin ticks "set manually" below to override them. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <LField label={t(locale, "admin_ce_rating")} error={fieldFlags.rating}>
              {draft.ratingOverridden ? (
                <input type="number" min="0" max="5" step="0.1" className="field-input" value={draft.rating ?? 0}
                  onChange={(e) => set("rating", Math.min(5, Math.max(0, Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title={t(locale, "admin_ce_auto_title")}>
                  {Number(draft.rating ?? 0).toFixed(1)}
                </div>
              )}
            </LField>
            <LField label={t(locale, "admin_ce_reviews")} error={fieldFlags.reviewCount}>
              {draft.ratingOverridden ? (
                <input type="number" min="0" className="field-input" value={draft.reviewCount ?? 0}
                  onChange={(e) => set("reviewCount", Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
              ) : (
                <div className="field-input bg-surface-container/50 text-on-surface-variant cursor-not-allowed flex items-center" title={t(locale, "admin_ce_auto_title")}>
                  {draft.reviewCount ?? 0}
                </div>
              )}
            </LField>
            <LField label={t(locale, "admin_ce_projects")} error={fieldFlags.completedProjects}><input type="number" min="0" className="field-input" value={draft.completedProjects} onChange={(e) => set("completedProjects", Number(e.target.value))} /></LField>
            <LField label={t(locale, "admin_ce_years")} error={fieldFlags.yearsExperience}><input type="number" min="0" className="field-input" value={draft.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} /></LField>
          </div>
          <label className="flex items-start gap-2.5 -mt-1 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" checked={draft.ratingOverridden === true}
              onChange={(e) => set("ratingOverridden", e.target.checked)} />
            <span className="text-caption text-outline">
              {t(locale, draft.ratingOverridden ? "admin_ce_rating_manual" : "admin_ce_rating_auto")}
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LField label={t(locale, "admin_ce_response")} error={fieldFlags.responseTime}><input className="field-input" value={draft.responseTime} onChange={(e) => set("responseTime", e.target.value)} placeholder={t(locale, "admin_ce_response_ph")} /></LField>
            <LField label={t(locale, "admin_ce_verified_since")} error={fieldFlags.verifiedSince}><input className="field-input" value={draft.verifiedSince} onChange={(e) => set("verifiedSince", e.target.value)} placeholder="2021" /></LField>
          </div>
          <Flagged error={fieldFlags.badges}>
            <TagField label={t(locale, "admin_ce_badges")} tags={draft.badges} onChange={(v) => set("badges", v)} placeholder={t(locale, "admin_ce_badges_ph")} />
          </Flagged>
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
            <LField label={t(locale, "admin_ce_meta_title")} error={fieldFlags.metaTitle}>
              <input className="field-input" value={draft.metaTitle ?? ""} onChange={(e) => set("metaTitle", e.target.value)} placeholder={t(locale, "admin_ce_meta_title_ph")} />
            </LField>
            <LField label={t(locale, "admin_ce_meta_desc")} error={fieldFlags.metaDescription}>
              <textarea className="field-input resize-none" rows={2} value={draft.metaDescription ?? ""} onChange={(e) => set("metaDescription", e.target.value)} placeholder={t(locale, "admin_cat_meta_desc_ph")} />
            </LField>
          </div>
        </TabPanel>
      )}

      {tab === "projects" && (
        <TabPanel idPrefix="ce" id="projects">
          <Flagged error={fieldFlags.projects}>
            <ProjectsEditor projects={draft.projects} onChange={(p) => set("projects", p)} />
          </Flagged>
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
          // whitespace-pre-line: describeFieldErrors returns one line per field.
          <p className="text-label text-error font-medium bg-error/8 rounded-lg px-3 py-2 whitespace-pre-line">{saveError}</p>
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
