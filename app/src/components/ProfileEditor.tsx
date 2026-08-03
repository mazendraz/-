import { useEffect, useMemo, useState } from "react";
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

/**
 * The provider's editable profile.
 *
 * Nothing here writes to the company directly — every save files a ChangeRequest
 * and the public profile stays exactly as it was until an admin approves.
 */

// Fields we render, in display order, with the input type each one needs.
const FIELDS: { key: string; type: "text" | "textarea" | "number" | "list" | "url" }[] = [
  { key: "name", type: "text" },
  { key: "tagline", type: "text" },
  { key: "about", type: "textarea" },
  { key: "phone", type: "text" },
  { key: "whatsapp", type: "text" },
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

export default function ProfileEditor() {
  const { locale } = useLocale();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [note, setNote] = useState("");

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

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!profile || dirty.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const changes: Record<string, unknown> = {};
      for (const k of dirty) {
        const field = FIELDS.find((f) => f.key === k);
        changes[k] = field?.type === "number" ? Number(form[k]) || 0 : form[k];
      }
      await submitChangeRequest({ entityId: profile.company.id, changes, note: note || undefined });
      setNote("");
      setFlash(t(locale, "prov_profile_flash_sent"));
      setTimeout(() => setFlash(""), 6000);
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
      setFlash(t(locale, "prov_profile_flash_withdrawn"));
      setTimeout(() => setFlash(""), 4000);
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

  return (
    <>
    <div className="max-w-2xl space-y-5">
      {error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{error}</div>
      )}
      {flash && (
        <div className="bg-primary/10 border border-primary/25 text-primary rounded-xl px-4 py-2.5 text-label font-bold">{flash}</div>
      )}

      {pending && <PendingBanner request={pending} onWithdraw={() => withdraw(pending.id)} busy={saving} />}
      {!pending && lastReviewed && <ReviewedBanner request={lastReviewed} />}

      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom space-y-4">
        <div>
          <h3 className=" text-title text-on-surface">{t(locale, "prov_profile_title")}</h3>
          <p className="text-label text-outline mt-0.5">
            {t(locale, "prov_profile_desc")}
          </p>
        </div>

        {FIELDS.map(({ key, type }) => {
          const changed = dirty.includes(key);
          return (
            <div key={key}>
              <label className="flex items-center gap-2 text-caption font-bold text-outline mb-1.5">
                {FIELD_LABEL_KEYS[key] ? t(locale, FIELD_LABEL_KEYS[key]) : key}
                {changed && (
                  <span className="text-caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    {t(locale, "prov_profile_changed_badge")}
                  </span>
                )}
              </label>
              {type === "textarea" ? (
                <textarea
                  className="field-input" rows={4}
                  value={String(form[key] ?? "")}
                  onChange={(e) => set(key, e.target.value)}
                />
              ) : type === "list" ? (
                <input
                  className="field-input"
                  value={Array.isArray(form[key]) ? (form[key] as string[]).join(", ") : String(form[key] ?? "")}
                  onChange={(e) => set(key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                  placeholder={t(locale, "prov_profile_list_ph")}
                />
              ) : (
                <input
                  className="field-input"
                  type={type === "number" ? "number" : "text"}
                  value={String(form[key] ?? "")}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
              {changed && (
                <p className="text-caption text-outline mt-1">
                  {t(locale, "prov_profile_currently_public")} <span className="font-bold text-on-surface-variant">{displayValue(baseline[key])}</span>
                </p>
              )}
            </div>
          );
        })}

        <div>
          <label className="block text-caption font-bold text-outline mb-1.5">{t(locale, "prov_profile_note_label")}</label>
          <input
            className="field-input" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, "prov_profile_note_ph")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => void save()}
            disabled={saving || dirty.length === 0}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors disabled:opacity-50 touch-press btn-press"
          >
            <Icon name="send" className="text-subhead" />
            {saving
              ? t(locale, "prov_profile_sending")
              : dirty.length
                ? `${t(locale, "prov_profile_send")} ${dirty.length} ${tCount(locale, "noun_profile_change", dirty.length)} ${t(locale, "prov_profile_send_suffix")}`
                : t(locale, "prov_profile_no_changes")}
          </button>
          {dirty.length > 0 && (
            <button
              onClick={() => setForm(baseline)}
              className="text-label font-bold text-outline hover:text-error transition-colors"
            >
              {t(locale, "prov_profile_discard")}
            </button>
          )}
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
    </div>
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
