import { useState, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isApiConfigured } from "../lib/api";
import { DISTRICTS, BUDGETS, addLead, getMyLeads, type Lead } from "../lib/requests";
import { getCompany } from "../lib/catalog";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type Locale } from "../lib/i18n";

type Step = "form" | "success";

interface FormState {
  name: string;
  phone: string;
  district: string;
  budget: string;
  description: string;
  service: string;
}

const EMPTY: FormState = { name: "", phone: "", district: "", budget: "", description: "", service: "" };
const DESCRIPTION_MAX = 500;

// Egyptian mobile, matching the backend (api/src/lib/validation/leads.ts). The
// server trims but does NOT strip internal spaces/dashes, so normalize to ASCII
// digits with no separators before validating/sending — otherwise a number like
// "+20 100 123 4567" would pass here yet be rejected by the API.
const EG_MOBILE = /^(?:\+?20)?0?1[0125]\d{8}$/;
function normalizePhone(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[\s\-()]/g, "")
    .trim();
}

export default function RequestForm() {
  usePageMeta("Request a Service | Al Assema", "Submit a service request to a verified company in the New Administrative Capital.");
  const { locale } = useLocale();
  const [params] = useSearchParams();
  const companySlug = params.get("company") ?? "";
  const companyNameParam = params.get("companyName") ?? "";
  const serviceParam = params.get("service") ?? "";

  const company = companySlug ? getCompany(companySlug) : undefined;
  const companyName = company?.name ?? (companyNameParam || "Al Assema");

  // Smart pre-fill: reuse contact details from this device's last request
  const lastLead = getMyLeads()[0];
  const [prefilled, setPrefilled] = useState(!!lastLead);

  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    service: serviceParam,
    name: lastLead?.name ?? "",
    phone: lastLead?.phone ?? "",
    district: lastLead?.district ?? "",
  });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shakeForm, setShakeForm] = useState(false);
  const [submittedLead, setSubmittedLead] = useState<Lead | null>(null);
  const [honeypot, setHoneypot] = useState(""); // bot trap — see hidden field below

  function clearPrefill() {
    setForm((f) => ({ ...f, name: "", phone: "", district: "" }));
    setPrefilled(false);
  }

  function set(field: keyof FormState, val: string) {
    if (field === "description" && val.length > DESCRIPTION_MAX) return;
    setForm((f) => ({ ...f, [field]: val }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validate(): boolean {
    const e: Partial<FormState> = {};
    if (!form.name.trim()) e.name = t(locale, "form_err_name");
    if (!form.phone.trim()) e.phone = t(locale, "form_err_phone");
    else if (!EG_MOBILE.test(normalizePhone(form.phone))) e.phone = t(locale, "form_err_phone_invalid");
    if (!form.district) e.district = t(locale, "form_err_district");
    if (!form.budget) e.budget = t(locale, "form_err_budget");
    if (!form.description.trim()) e.description = t(locale, "form_err_description");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 500);
      // Scroll to first error
      const firstError = document.querySelector("[data-has-error='true']");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const lead = await addLead({
        companySlug: companySlug || "general",
        companyName,
        service: form.service || "General Inquiry",
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        district: form.district,
        budget: form.budget,
        description: form.description.trim(),
      }, honeypot);
      setSubmittedLead(lead);
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError(t(locale, "form_err_submit"));
      setIsSubmitting(false);
    }
  }

  if (step === "success" && submittedLead) {
    return <SuccessScreen lead={submittedLead} companyName={companyName} locale={locale} />;
  }

  // A lead must attach to a real company the platform can route it to. When the
  // API is live and no company was selected, there's no server-side "general"
  // company to receive it — so guide the user to pick one instead of rendering a
  // form that would fail on submit. Demo mode (no API) keeps the offline flow.
  if (!companySlug && isApiConfigured()) {
    return <ChooseCompanyPrompt locale={locale} />;
  }

  return (
    <div className="bg-surface min-h-screen pt-20 pb-16">
      <div className="max-w-xl mx-auto px-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-outline mb-6 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
          <span className="material-symbols-outlined text-[14px] rtl-flip">chevron_right</span>
          {companySlug && (
            <>
              <Link to={`/companies/${companySlug}`} className="hover:text-primary transition-colors">{companyName}</Link>
              <span className="material-symbols-outlined text-[14px] rtl-flip">chevron_right</span>
            </>
          )}
          <span className="text-on-surface">{t(locale, "form_title")}</span>
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="font-black text-[26px] md:text-headline-lg text-on-surface mb-2 tracking-tight">
            {t(locale, "form_title")}
          </h1>
          {companySlug && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] text-outline">{t(locale, "form_requesting_from")}</span>
              <Link to={`/companies/${companySlug}`}
                className="text-primary font-bold text-[14px] hover:underline flex items-center gap-1">
                {companyName}
                <span className="material-symbols-outlined text-primary text-[13px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              </Link>
            </div>
          )}
        </div>

        {/* Smart pre-fill notice */}
        {prefilled && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-3.5 mb-4">
            <span className="material-symbols-outlined text-green-600 text-[20px] flex-shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <p className="flex-1 text-[13px] text-green-800 font-medium leading-snug">
              {t(locale, "form_prefill_note")}
            </p>
            <button
              onClick={clearPrefill}
              className="text-[12px] font-bold text-green-700 hover:text-green-900 transition-colors flex-shrink-0 underline"
            >
              {t(locale, "common_clear")}
            </button>
          </div>
        )}

        {/* Trust bar */}
        <div className="flex items-start gap-3 bg-primary/6 border border-primary/18 rounded-2xl p-4 mb-7">
          <span className="material-symbols-outlined text-primary text-[22px] flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          <div>
            <p className="font-bold text-[14px] text-on-surface mb-0.5">{t(locale, "form_no_account_title")}</p>
            <p className="text-[13px] text-outline leading-relaxed">
              {t(locale, "form_no_account_sub")}
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className={`bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-bloom space-y-5 ${shakeForm ? "shake" : ""}`}
        >
          <Field label={t(locale, "form_full_name")} required error={errors.name}>
            {(p) => (
              <input
                id={p.id}
                aria-invalid={p.invalid}
                aria-describedby={p.describedById}
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t(locale, "form_name_ph")}
                autoComplete="name"
                className={`field-input ${errors.name ? "error" : ""}`}
                data-has-error={!!errors.name}
              />
            )}
          </Field>

          <Field label={t(locale, "form_phone")} required error={errors.phone}>
            {(p) => (
              <input
                id={p.id}
                aria-invalid={p.invalid}
                aria-describedby={p.describedById}
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+20 100 123 4567"
                autoComplete="tel"
                inputMode="tel"
                dir="ltr"
                className={`field-input ${errors.phone ? "error" : ""}`}
                data-has-error={!!errors.phone}
              />
            )}
          </Field>

          {/* Service selector — only if company has services */}
          {company && company.services.length > 0 && (
            <Field label={t(locale, "form_service_needed")}>
              {(p) => (
                <select
                  id={p.id}
                  value={form.service}
                  onChange={(e) => set("service", e.target.value)}
                  className="field-input"
                >
                  <option value="">{t(locale, "form_service_optional")}</option>
                  {company.services.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label={t(locale, "form_district")} required error={errors.district}>
            {(p) => (
              <select
                id={p.id}
                aria-invalid={p.invalid}
                aria-describedby={p.describedById}
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
                className={`field-input ${errors.district ? "error" : ""}`}
                data-has-error={!!errors.district}
              >
                <option value="">{t(locale, "form_district_ph")}</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </Field>

          <Field label={t(locale, "form_budget")} required error={errors.budget}>
            {(p) => (
              <select
                id={p.id}
                aria-invalid={p.invalid}
                aria-describedby={p.describedById}
                value={form.budget}
                onChange={(e) => set("budget", e.target.value)}
                className={`field-input ${errors.budget ? "error" : ""}`}
                data-has-error={!!errors.budget}
              >
                <option value="">{t(locale, "form_budget_ph")}</option>
                {BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </Field>

          <Field label={t(locale, "form_description")} required error={errors.description}>
            {(p) => (
              <div className="relative">
                <textarea
                  id={p.id}
                  aria-invalid={p.invalid}
                  aria-describedby={p.describedById}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={t(locale, "form_description_ph")}
                  rows={4}
                  className={`field-input resize-none ${errors.description ? "error" : ""}`}
                  data-has-error={!!errors.description}
                  style={{ paddingBottom: "2.5rem" }}
                />
                {/* Character counter */}
                <span className={`absolute bottom-3 right-3 rtl:right-auto rtl:left-3 text-[11px] font-bold pointer-events-none
                  ${form.description.length > DESCRIPTION_MAX * 0.9 ? "text-error" : "text-outline/60"}`}>
                  {form.description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
            )}
          </Field>

          {/* Steps preview */}
          <div className="bg-surface-container rounded-xl p-4">
            <p className="text-[12px] font-bold text-outline uppercase tracking-wider mb-3">{t(locale, "form_next_title")}</p>
            <div className="space-y-2">
              {[
                t(locale, "form_next_1"),
                t(locale, "form_next_2"),
                t(locale, "form_next_3"),
                t(locale, "form_next_4"),
              ].map((s, i) => (
                <div key={s} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-[13px] text-on-surface-variant">{s}</span>
                </div>
              ))}
            </div>
          </div>

          {submitError && (
            <div className="flex items-center gap-2 bg-error/10 border border-error/30 rounded-xl p-3.5 text-[13px] font-medium text-error">
              <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-3 bg-primary text-on-primary
                        font-bold text-[15px] py-4 rounded-xl transition-all shadow-bloom touch-press
                        ${isSubmitting
                          ? "opacity-80 cursor-not-allowed"
                          : "hover:bg-primary-container btn-press"
                        }`}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden />
                {t(locale, "form_submitting")}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">send</span>
                {t(locale, "form_submit")}
              </>
            )}
          </button>
          <p className="text-center text-[12px] text-outline">
            {t(locale, "form_contact_24h")}
          </p>

          {/* Honeypot — hidden from real users; bots auto-fill it and the server
              rejects the submission. Kept out of the tab order + a11y tree. The
              data-*-ignore attrs stop password managers (1Password/LastPass/
              Bitwarden) from autofilling it, which would falsely flag a real user. */}
          <input
            type="text"
            name="hp_field"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="absolute -left-[9999px] top-0 w-px h-px opacity-0"
          />
        </form>
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────
// The label is bound to the real control via htmlFor/id, and error text is
// wired up with aria-describedby + aria-invalid. The child is a render function
// so these ids land on the actual <input>/<select>/<textarea>, not a wrapper.
function Field({
  label, required, error, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: (props: { id: string; describedById?: string; invalid: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block font-bold text-[14px] text-on-surface mb-1.5">
        {label}
        {required && <span className="text-error ms-0.5">*</span>}
      </label>
      {children({ id, describedById: error ? errorId : undefined, invalid: !!error })}
      {error && (
        <p id={errorId} className="mt-1.5 text-[12px] font-bold text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

// ── Choose-a-company prompt ───────────────────────────────────────────────
// Shown when the form is opened with no company and the live API is in use: a
// lead must attach to a real company, so we send the user to the directory.
function ChooseCompanyPrompt({ locale }: { locale: Locale }) {
  return (
    <div className="bg-surface min-h-screen pt-20 pb-16 px-5 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-bloom">
          <span className="material-symbols-outlined text-primary text-[44px]"
            style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
        </div>
        <h1 className="font-black text-[26px] text-on-surface mb-2 tracking-tight">
          {t(locale, "form_pick_company_title")}
        </h1>
        <p className="text-[15px] text-outline mb-7 leading-relaxed max-w-sm mx-auto">
          {t(locale, "form_pick_company_sub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/companies"
            className="flex-1 bg-primary text-on-primary py-3.5 rounded-xl font-bold text-[15px]
                       hover:bg-primary-container transition-colors text-center touch-press btn-press">
            {t(locale, "common_browse_companies")}
          </Link>
          <Link to="/"
            className="flex-1 bg-surface-container-lowest text-on-surface py-3.5 rounded-xl font-bold text-[15px]
                       hover:bg-surface-container-low transition-colors text-center border border-outline-variant/25 touch-press">
            {t(locale, "common_back_to_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────
function SuccessScreen({ lead, companyName, locale }: { lead: Lead; companyName: string; locale: Locale }) {
  return (
    <div className="bg-surface min-h-screen pt-20 pb-16 px-5 flex items-center justify-center">
      <div className="max-w-md w-full text-center">

        {/* Animated check */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-bloom">
          <span className="material-symbols-outlined text-primary text-[48px]"
            style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>

        <h1 className="font-black text-[28px] text-on-surface mb-2 tracking-tight">{t(locale, "form_success_title")}</h1>
        <p className="text-[15px] text-outline mb-7 leading-relaxed max-w-sm mx-auto">
          {t(locale, "form_success_sub")}
        </p>

        {/* Reference card */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom mb-6 text-start">
          <p className="text-[11px] font-black text-outline uppercase tracking-[0.12em] mb-1.5">{t(locale, "form_ref_number")}</p>
          <p className="font-black text-primary text-[1.8rem] tracking-widest mb-5 font-mono" dir="ltr">{lead.refNumber}</p>
          <div className="space-y-2.5 pt-4 border-t border-outline-variant/20">
            <InfoRow icon="person" label={t(locale, "form_name")} val={lead.name} />
            <InfoRow icon="phone" label={t(locale, "form_phone_label")} val={lead.phone} />
            <InfoRow icon="location_on" label={t(locale, "requests_district")} val={lead.district} />
            <InfoRow icon="payments" label={t(locale, "requests_budget")} val={lead.budget} />
            <InfoRow icon="business" label={t(locale, "form_company")} val={companyName} />
          </div>
        </div>

        <div className="flex items-start gap-3 bg-primary/6 border border-primary/18 rounded-xl p-4 mb-7 text-start">
          <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(locale, "form_save_ref")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/"
            className="flex-1 bg-primary text-on-primary py-3.5 rounded-xl font-bold text-[15px]
                       hover:bg-primary-container transition-colors text-center touch-press btn-press">
            {t(locale, "common_back_to_home")}
          </Link>
          <Link to="/companies"
            className="flex-1 bg-surface-container-lowest text-on-surface py-3.5 rounded-xl font-bold text-[15px]
                       hover:bg-surface-container-low transition-colors text-center border border-outline-variant/25 touch-press">
            {t(locale, "common_browse_companies")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, val }: { icon: string; label: string; val: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-outline text-[16px] flex-shrink-0">{icon}</span>
      <span className="text-outline text-[13px] w-20 flex-shrink-0">{label}</span>
      <span className="text-on-surface text-[13px] font-bold truncate">{val}</span>
    </div>
  );
}
