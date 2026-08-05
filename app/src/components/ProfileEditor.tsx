import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchProviderProfile, submitChangeRequest, cancelChangeRequest,
  displayValue, FIELD_LABEL_KEYS,
  type ChangeRequest, type ProviderProfile,
} from "../lib/changeRequests";
import { isApiConfigured } from "../lib/api";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { ConfirmDialog } from "./ConfirmDialog";
import { useLocale } from "../context/LocaleContext";
import { t, tCount } from "../lib/i18n";
import Icon from "./Icon";
import PhoneInput from "./PhoneInput";
import ImagePicker from "../pages/provider/components/ImagePicker";
import GalleryManager from "../pages/provider/components/GalleryManager";
import StickySaveBar from "../pages/provider/components/StickySaveBar";
import SuccessNotice from "../pages/provider/components/SuccessNotice";

/**
 * The provider's editable profile.
 *
 * Nothing here writes to the company directly — every save files a ChangeRequest
 * and the public profile stays exactly as it was until an admin approves.
 *
 * Redesigned as sectioned cards (Company Information / Images / Gallery /
 * Services / Contact / Business Details / SEO) instead of one generic field
 * loop — see plan for the full rationale. `FIELDS` below is still the single
 * source of truth for which keys exist and how they're coerced at submit
 * time; only the rendering is section-driven now.
 */

// Fields we submit, in the shape the server's allow-list expects. Unchanged
// from before this redesign — do not add/remove keys here without a matching
// server-side change to EDITABLE_FIELDS.COMPANY.
const FIELDS: { key: string; type: "text" | "textarea" | "number" | "list" | "url" | "phone" }[] = [
  { key: "name", type: "text" },
  { key: "tagline", type: "text" },
  { key: "about", type: "textarea" },
  { key: "phone", type: "phone" },
  { key: "whatsapp", type: "phone" },
  { key: "email", type: "text" },
  { key: "location", type: "text" },
  { key: "yearsExperience", type: "number" },
  { key: "responseTime", type: "text" },
  { key: "badges", type: "list" },
  { key: "logo", type: "url" },
  { key: "cover", type: "url" },
  { key: "gallery", type: "list" },
  { key: "metaTitle", type: "text" },
  { key: "metaDescription", type: "textarea" },
];

type FormState = Record<string, unknown>;

/** Build the editable form state from the company + private contact fields. */
function toForm(profile: ProviderProfile): FormState {
  const c = profile.company as Record<string, unknown>;
  const form: FormState = {};
  for (const { key } of FIELDS) form[key] = c[key] ?? "";
  // email/whatsapp are stripped from the public company payload, so they arrive
  // separately — the owner is exactly who should see and edit them.
  form.email = profile.contact.email ?? "";
  form.whatsapp = profile.contact.whatsapp ?? "";
  return form;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return String(a ?? "") === String(b ?? "");
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export default function ProfileEditor() {
  const { locale } = useLocale();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [note, setNote] = useState("");
  const [badgeDraft, setBadgeDraft] = useState("");

  const load = () => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    fetchProviderProfile()
      .then((p) => { setProfile(p); setForm(toForm(p)); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "prov_profile_err_load")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const baseline = useMemo(() => (profile ? toForm(profile) : {}), [profile]);

  // Only genuinely-changed fields are submitted — sending untouched fields would
  // pad the admin's diff with rows that show the same value on both sides.
  const dirty = useMemo(
    () => FIELDS.map((f) => f.key).filter((k) => !sameValue(form[k], baseline[k])),
    [form, baseline],
  );

  // UX-09: covers losing a draft by closing the tab or navigating fully away
  // from /provider (Back-to-site link, browser Back). Doesn't cover switching
  // to a different provider-dashboard TAB while this one has unsaved edits —
  // those tabs are local state, not routes (see NAV-06 — only admin moved to
  // real routes), so no navigation actually happens for `useBlocker` to catch.
  const navBlocker = useUnsavedChangesGuard(dirty.length > 0);

  const pending = profile?.pending ?? null;
  const lastReviewed = profile?.changeRequests.find(
    (r) => r.status === "APPROVED" || r.status === "REJECTED",
  );
  const services = asStringArray(profile?.company.services);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function cancel() {
    setForm(baseline);
    setBadgeDraft("");
  }

  function addBadge() {
    const v = badgeDraft.trim();
    const tags = asStringArray(form.badges);
    if (v && !tags.includes(v)) set("badges", [...tags, v]);
    setBadgeDraft("");
  }

  async function save() {
    if (!profile || dirty.length === 0) return;
    setSaving(true);
    setError("");
    setFlash(false);
    try {
      const changes: Record<string, unknown> = {};
      for (const k of dirty) {
        const field = FIELDS.find((f) => f.key === k);
        changes[k] = field?.type === "number" ? Number(form[k]) || 0 : form[k];
      }
      await submitChangeRequest({ entityId: profile.company.id, changes, note: note || undefined });
      setNote("");
      setFlash(true);
      setTimeout(() => setFlash(false), 6000);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_profile_err_submit"));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(id: string) {
    setSaving(true);
    try {
      await cancelChangeRequest(id);
      setFlash(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "prov_profile_err_withdraw"));
    } finally {
      setSaving(false);
    }
  }

  if (!isApiConfigured()) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Icon name="info" className="text-primary text-title flex-shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant">
          {t(locale, "prov_profile_needs_api")}
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

  // Not components — plain closures that hand off to the module-level
  // <TextRow>/<BadgesField> below with this render's values. Declaring the
  // row components themselves inside ProfileEditor() would give them a new
  // function identity every render, which React treats as a brand-new
  // component type — the underlying <input> would unmount/remount (losing
  // focus) on every single keystroke.
  const isDirty = (key: string) => dirty.includes(key);
  const field = (key: string, type: "text" | "number" | "textarea" | "phone", rows?: number) => (
    <TextRow
      key={key} fieldKey={key} type={type} rows={rows}
      value={String(form[key] ?? "")} baselineValue={baseline[key]}
      changed={isDirty(key)} saving={saving}
      onChange={(v) => set(key, v)}
    />
  );

  return (
    <>
    <div className="max-w-3xl space-y-5">
      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{error}</div>
      )}
      {flash && (
        <SuccessNotice title={t(locale, "prov_profile_submitted_title")} message={t(locale, "prov_profile_submitted_body")} />
      )}

      {pending && <PendingBanner request={pending} onWithdraw={() => withdraw(pending.id)} busy={saving} />}
      {!pending && lastReviewed && <ReviewedBanner request={lastReviewed} />}

      {/* One continuous surface for the whole form — section headers + hairline
          dividers (divide-y) instead of a stack of separately-elevated cards.
          Each SectionCard used to carry its own shadow-bloom/rounded-2xl/gap,
          which reads as a series of distinct floating panels ("pages") once
          you're scrolling past them rather than one flowing document (Notion/
          Shopify-style settings pages use exactly this single-panel pattern). */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-5 sm:p-6 divide-y divide-outline-variant/15">
        <SectionBlock icon="storefront" title={t(locale, "prov_profile_section_info_title")} desc={t(locale, "prov_profile_section_info_desc")}>
          {field("name", "text")}
          {field("tagline", "text")}
          {field("about", "textarea", 4)}
        </SectionBlock>

        <SectionBlock icon="image" title={t(locale, "prov_profile_section_images_title")} desc={t(locale, "prov_profile_section_images_desc")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <ImagePicker
              label={t(locale, "prov_field_logo")} shape="logo" bucket="logos" maxDim={512} disabled={saving}
              value={String(form.logo ?? "")} onChange={(v) => set("logo", v)}
            />
            <ImagePicker
              label={t(locale, "prov_field_cover")} shape="cover" bucket="covers" maxDim={1600} disabled={saving}
              value={String(form.cover ?? "")} onChange={(v) => set("cover", v)}
            />
          </div>
        </SectionBlock>

        <SectionBlock icon="collections" title={t(locale, "prov_field_gallery")} desc={t(locale, "prov_profile_section_gallery_desc")}>
          <GalleryManager images={asStringArray(form.gallery)} onChange={(g) => set("gallery", g)} disabled={saving} />
        </SectionBlock>

        {services.length > 0 && (
          <SectionBlock icon="handyman" title={t(locale, "prov_profile_services")} desc={t(locale, "prov_profile_section_services_note")}>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <span key={s} className="bg-surface-container px-3 py-1.5 rounded-full text-label font-display text-on-surface-variant border border-outline-variant/20">{s}</span>
              ))}
            </div>
          </SectionBlock>
        )}

        <SectionBlock icon="call" title={t(locale, "prov_profile_section_contact_title")} desc={t(locale, "prov_profile_section_contact_desc")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("phone", "phone")}
            {field("whatsapp", "phone")}
            {field("email", "text")}
            {field("location", "text")}
          </div>
        </SectionBlock>

        <SectionBlock icon="workspace_premium" title={t(locale, "prov_profile_section_business_title")} desc={t(locale, "prov_profile_section_business_desc")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("yearsExperience", "number")}
            {field("responseTime", "text")}
          </div>
          <BadgesField
            tags={asStringArray(form.badges)} baselineTags={baseline.badges}
            changed={isDirty("badges")} saving={saving}
            draft={badgeDraft} onDraftChange={setBadgeDraft} onAdd={addBadge}
            onRemove={(tag) => set("badges", asStringArray(form.badges).filter((x) => x !== tag))}
          />
        </SectionBlock>

        <SectionBlock icon="travel_explore" title={t(locale, "prov_profile_section_seo_title")} desc={t(locale, "prov_profile_section_seo_desc")}>
          {field("metaTitle", "text")}
          {field("metaDescription", "textarea", 3)}
        </SectionBlock>

        <SectionBlock icon="sticky_note_2" title={t(locale, "prov_profile_note_label")}>
          {/* The section heading above is an <h3>, not a <label> — give the
              input its own accessible name rather than relying on visual
              adjacency (A11Y-17 regression class, see the note on the field
              loop above). */}
          <input
            id="profile-note"
            aria-label={t(locale, "prov_profile_note_label")}
            className="field-input disabled:opacity-60" value={note} disabled={saving} onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, "prov_profile_note_ph")}
          />
        </SectionBlock>
      </div>

      {pending && dirty.length > 0 && (
        // The backend MERGES into the pending request rather than replacing it.
        // Saying so up front prevents "where did my earlier edit go?".
        <p className="text-caption text-outline bg-surface-container rounded-xl px-3 py-2">
          {t(locale, "prov_profile_merge_before")} {Object.keys(pending.changes).length}{" "}
          {tCount(locale, "noun_profile_change", Object.keys(pending.changes).length)}{" "}
          {t(locale, "prov_profile_merge_after")}
        </p>
      )}
    </div>

    {dirty.length > 0 && (
      <StickySaveBar dirtyCount={dirty.length} saving={saving} onSave={() => void save()} onCancel={cancel} />
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

/**
 * A section within the single continuous form panel (see the `divide-y`
 * wrapper in ProfileEditor) — a header plus its fields, NOT its own card.
 * `py-6 first:pt-0 last:pb-0` gives consistent rhythm between sections while
 * the divider (from the parent's `divide-y`) reads as one flowing document.
 */
function SectionBlock({ icon, title, desc, children }: { icon: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="py-6 first:pt-0 last:pb-0">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-title text-on-surface">
          <Icon name={icon} className="text-primary text-subhead" />
          {title}
        </h3>
        {desc && <p className="text-label text-outline mt-1">{desc}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function TextRow({ fieldKey, type, rows, value, baselineValue, changed, saving, onChange }: {
  fieldKey: string; type: "text" | "number" | "textarea" | "phone"; rows?: number;
  value: string; baselineValue: unknown; changed: boolean; saving: boolean;
  onChange: (v: string) => void;
}) {
  const { locale } = useLocale();
  const label = FIELD_LABEL_KEYS[fieldKey] ? t(locale, FIELD_LABEL_KEYS[fieldKey]) : fieldKey;
  return (
    <div>
      <label htmlFor={`profile-${fieldKey}`} className="flex items-center gap-2 text-caption font-bold text-outline mb-1.5">
        {label}
        {changed && (
          <span className="text-caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {t(locale, "prov_profile_changed_badge")}
          </span>
        )}
      </label>
      {type === "textarea" ? (
        <textarea
          id={`profile-${fieldKey}`}
          className="field-input disabled:opacity-60" rows={rows ?? 4}
          value={value}
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : type === "phone" ? (
        <PhoneInput
          id={`profile-${fieldKey}`}
          value={value}
          disabled={saving}
          onChange={onChange}
        />
      ) : (
        <input
          id={`profile-${fieldKey}`}
          className="field-input disabled:opacity-60"
          type={type === "number" ? "number" : "text"}
          value={value}
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {changed && (
        <p className="text-caption text-outline mt-1">
          {t(locale, "prov_profile_currently_public")} <span className="font-bold text-on-surface-variant">{displayValue(baselineValue)}</span>
        </p>
      )}
    </div>
  );
}

function BadgesField({ tags, baselineTags, changed, saving, draft, onDraftChange, onAdd, onRemove }: {
  tags: string[]; baselineTags: unknown; changed: boolean; saving: boolean;
  draft: string; onDraftChange: (v: string) => void; onAdd: () => void; onRemove: (tag: string) => void;
}) {
  const { locale } = useLocale();
  return (
    <div>
      <label className="flex items-center gap-2 text-caption font-bold text-outline mb-1.5">
        {t(locale, "prov_field_badges")}
        {changed && (
          <span className="text-caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {t(locale, "prov_profile_changed_badge")}
          </span>
        )}
      </label>
      <div className="flex gap-2 mb-2">
        <input
          className="field-input disabled:opacity-60" value={draft} disabled={saving}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder={t(locale, "prov_badges_ph")}
        />
        <button type="button" onClick={onAdd} disabled={saving} className="bg-surface-container px-4 rounded-xl font-bold text-label text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0 disabled:opacity-60">
          {t(locale, "prov_badges_add")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1 rounded-full text-caption font-bold">
            {tag}
            <button type="button" disabled={saving} onClick={() => onRemove(tag)}>
              <Icon name="close" className="text-label" />
            </button>
          </span>
        ))}
      </div>
      {changed && (
        <p className="text-caption text-outline mt-1.5">
          {t(locale, "prov_profile_currently_public")} <span className="font-bold text-on-surface-variant">{displayValue(baselineTags)}</span>
        </p>
      )}
    </div>
  );
}

function PendingBanner({ request, onWithdraw, busy }: {
  request: ChangeRequest; onWithdraw: () => void; busy: boolean;
}) {
  const { locale } = useLocale();
  const fields = Object.keys(request.changes);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-label text-amber-900 flex items-center gap-1.5">
            <Icon name="hourglass_top" className="text-subhead" />
            {t(locale, "prov_profile_under_review")}
          </p>
          <p className="text-label text-amber-800 mt-1">
            {fields.length}{" "}
            {tCount(locale, "noun_profile_change", fields.length)}{" "}
            {t(locale, "prov_profile_waiting_admin")}{" "}
            <span className="font-bold">
              {fields.map((f) => (FIELD_LABEL_KEYS[f] ? t(locale, FIELD_LABEL_KEYS[f]) : f)).join("، ")}
            </span>
          </p>
        </div>
        <button
          onClick={onWithdraw} disabled={busy}
          className="text-label font-bold text-amber-900 hover:text-error transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {t(locale, "prov_profile_withdraw")}
        </button>
      </div>
    </div>
  );
}

function ReviewedBanner({ request }: { request: ChangeRequest }) {
  const { locale } = useLocale();
  const approved = request.status === "APPROVED";
  return (
    <div className={`rounded-xl p-4 border ${approved ? "bg-primary/5 border-primary/20" : "bg-error/5 border-error/20"}`}>
      <p className={`font-bold text-label flex items-center gap-1.5 ${approved ? "text-primary" : "text-error"}`}>
        <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{approved ? "check_circle" : "cancel"}</span>
        {t(locale, approved ? "prov_profile_approved" : "prov_profile_rejected")}
      </p>
      {request.reviewNote && (
        <p className="text-label text-on-surface-variant mt-1">
          <span className="font-bold">{t(locale, "prov_profile_reason")}</span> {request.reviewNote}
        </p>
      )}
    </div>
  );
}
