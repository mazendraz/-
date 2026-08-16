import { useState, useId, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isApiConfigured } from "../lib/api";
import { useCustomerAuth } from "../lib/customerAuth";
import { savePendingRequest, takePendingRequest } from "../lib/pendingRequest";
import { DISTRICTS, addLead, getMyLeads, type Lead } from "../lib/requests";
import { useSettings, parseLines } from "../lib/settings";
import { useCompanyDetail } from "../lib/catalog";
import { isBusy, formatReopenDate, availableAgainAt } from "../lib/availability";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type Locale } from "../lib/i18n";
import Captcha from "../components/Captcha";
import { captchaConfigured } from "../lib/captcha";
import RequestItemPicker from "../components/RequestItemPicker";
import Select from "../components/Select";
import { readCart, clearCart, type CartItem } from "../lib/cart";
import { chatAvailable } from "../lib/chat";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import PhoneInput from "../components/PhoneInput";
import { isValidE164, formatPhoneDisplay } from "../lib/phone";
import Icon from "../components/Icon";

type Step = "form" | "success";

interface FormState {
  name: string;
  phone: string;
  district: string;
  description: string;
  service: string;
}

const EMPTY: FormState = { name: "", phone: "", district: "", description: "", service: "" };
const DESCRIPTION_MAX = 500;

export default function RequestForm() {
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "meta_request_title")} | ${t(locale, "brand_name")}`, t(locale, "meta_request_desc"));
  const [params] = useSearchParams();
  const companySlug = params.get("company") ?? "";
  const companyNameParam = params.get("companyName") ?? "";
  const serviceParam = params.get("service") ?? "";

  // The full record, not the cached card: list payloads carry offerings: []
  // (serializeCompanyCard omits the relation), so the cached copy would never
  // show the item picker.
  const { company } = useCompanyDetail(companySlug);
  const companyName = company?.name ?? (companyNameParam || t(locale, "brand_name"));

  // District options are admin-configurable (Settings); fall back to the
  // built-in list when not overridden.
  const settings = useSettings();
  const districts = parseLines(settings.districts, DISTRICTS);

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
  // Seeded from the basket the customer filled on the company profile, so
  // arriving here does not silently lose what they already picked.
  const [items, setItems] = useState<CartItem[]>(() => readCart(companySlug));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shakeForm, setShakeForm] = useState(false);
  const [submittedLead, setSubmittedLead] = useState<Lead | null>(null);
  const [honeypot, setHoneypot] = useState(""); // bot trap — see hidden field below
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0); // bump to reset the widget
  // UX-09: a half-filled form used to be discarded with no prompt on Back or a
  // stray nav click. `touched` (not "does form differ from blank") because the
  // smart-prefill above already seeds real values — arriving with prefilled,
  // unedited fields isn't "unsaved work" yet.
  const [touched, setTouched] = useState(false);

  // ── Sign-in gate ───────────────────────────────────────────────────────────
  // Enforced only when the API is configured — demo mode (no VITE_API_URL) keeps
  // the offline flow working, same rule the rest of the app follows.
  const navigate = useNavigate();
  const { customer, loading: authLoading } = useCustomerAuth();
  const gateOn = isApiConfigured();
  const [restored, setRestored] = useState(false);
  // Consume the stash exactly once per mount. Under StrictMode the effect runs
  // twice in development, and the second pass would find an empty store and
  // wipe the freshly restored form.
  const restoreDone = useRef(false);

  useEffect(() => {
    if (restoreDone.current || authLoading || !customer) return;
    restoreDone.current = true;

    const pending = takePendingRequest();
    if (!pending) return;

    setForm(pending.form);
    setItems(pending.items);
    setTouched(true);
    setRestored(true);
  }, [authLoading, customer]);

  function clearPrefill() {
    setForm((f) => ({ ...f, name: "", phone: "", district: "" }));
    setPrefilled(false);
  }

  function set(field: keyof FormState, val: string) {
    if (field === "description" && val.length > DESCRIPTION_MAX) return;
    setForm((f) => ({ ...f, [field]: val }));
    setTouched(true);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  }

  // Above the early returns below: hooks can't be conditional. Nothing left to
  // lose once the request actually sent, so the guard turns off at "success".
  const navBlocker = useUnsavedChangesGuard(touched && step === "form");

  // Drives the submit button's label. Not `!customer` alone: while the session
  // is still being checked the honest answer is "not yet known", and flashing
  // "Sign in and send" at a signed-in customer for one frame reads as being
  // logged out.
  const needsSignIn = gateOn && !authLoading && !customer;

  function validate(): boolean {
    const e: Partial<FormState> = {};
    if (!form.name.trim()) e.name = t(locale, "form_err_name");
    if (!form.phone.trim()) e.phone = t(locale, "form_err_phone");
    else if (!isValidE164(form.phone)) e.phone = t(locale, "form_err_phone_invalid");
    if (!form.district) e.district = t(locale, "form_err_district");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 500);
      // Scroll to AND focus the first invalid field — a screen-reader user
      // gets nothing from scrollIntoView alone (FORM-01: nothing else here
      // announces that submit failed or where).
      const firstError = document.querySelector<HTMLElement>("[data-has-error='true']");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstError?.focus();
      return;
    }
    // ── Sign-in gate ────────────────────────────────────────────────────────
    // After validation, before the CAPTCHA: sending them to sign in over a form
    // that was going to be rejected anyway would mean doing the trip twice. By
    // here the input is known good, so the only thing left is who they are.
    if (gateOn && !authLoading && !customer) {
      savePendingRequest({
        companySlug,
        companyName,
        form,
        items,
      });
      // The guard would otherwise throw a "you have unsaved changes" dialog over
      // a navigation WE initiated to preserve exactly those changes.
      setTouched(false);
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      navigate(`/signin?next=${next}`);
      return;
    }

    // CAPTCHA gate — only when a Turnstile key is configured.
    if (captchaConfigured() && !captchaToken) {
      setSubmitError(t(locale, "form_err_captcha"));
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const lead = await addLead({
        companySlug: companySlug || "general",
        companyName,
        // With items the server overwrites this with their names; it stays the
        // human-readable summary the older screens and emails read.
        service: form.service || "General Inquiry",
        name: form.name.trim(),
        phone: form.phone,
        district: form.district,
        // Budget is no longer collected on this form; the field stays required
        // on the Lead/API shape (existing leads have real values), so send "".
        budget: "",
        description: form.description.trim(),
        ...(items.length > 0 ? { items } : {}),
      }, honeypot, captchaToken);
      // The basket has become a request — leaving it would re-offer the same
      // items next visit as if nothing had been sent.
      if (companySlug) clearCart(companySlug);
      setSubmittedLead(lead);
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError(t(locale, "form_err_submit"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1); // token is single-use — refresh for retry
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
    <>
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-xl mx-auto px-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-label font-bold text-outline mb-6 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
          <Icon name="chevron_right" className="text-label rtl-flip" />
          {companySlug && (
            <>
              <Link to={`/companies/${companySlug}`} className="hover:text-primary transition-colors">{companyName}</Link>
              <Icon name="chevron_right" className="text-label rtl-flip" />
            </>
          )}
          <span className="text-on-surface">{t(locale, "form_title")}</span>
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="font-black text-headline md:text-display text-on-surface mb-2 tracking-tight">
            {t(locale, "form_title")}
          </h1>
          {companySlug && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-label text-outline">{t(locale, "form_requesting_from")}</span>
              <Link to={`/companies/${companySlug}`}
                className="text-primary font-bold text-label hover:underline flex items-center gap-1">
                {companyName}
                <Icon name="verified" className="text-primary text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
              </Link>
            </div>
          )}
        </div>

        {/* Busy notice — this company can't take new requests right now; point the
            customer to the waiting list on the profile. Doesn't hard-block submitting. */}
        {company && isBusy(company) && (() => {
          // Hoisted: resolved across the manual switch AND any running scheduled
          // window, so a company busy because of a scheduled period still shows
          // its return date instead of falling through to the date-less wording.
          const backAt = availableAgainAt(company);
          return (
            <Notice variant="warning" icon="event_busy">
              <p className="text-label text-amber-900 font-bold leading-snug">
                {backAt
                  ? `${companyName} ${t(locale, "busy_banner_booked_until_inline")} ${formatReopenDate(backAt, locale)}`
                  : `${companyName} — ${t(locale, "busy_banner_fully_booked")}`}
              </p>
              <Link to={`/companies/${companySlug}`} className="text-label text-amber-800 font-bold hover:underline inline-flex items-center gap-1 mt-1">
                <Icon name="hourglass_top" className="text-body" />
                {t(locale, "waitlist_join_cta")}
              </Link>
            </Notice>
          );
        })()}

        {/* Smart pre-fill notice */}
        {prefilled && (
          <Notice
            variant="success"
            icon="auto_awesome"
            action={
              <button
                onClick={clearPrefill}
                className="text-caption font-bold text-green-700 hover:text-green-900 transition-colors flex-shrink-0 underline"
              >
                {t(locale, "common_clear")}
              </button>
            }
          >
            <p className="text-label text-green-800 font-medium leading-snug">
              {t(locale, "form_prefill_note")}
            </p>
          </Notice>
        )}

        {/* Trust bar */}
        <Notice variant="info" icon="lock" className="mb-7">
          <p className="font-bold text-label text-on-surface mb-0.5">{t(locale, "form_signin_note_title")}</p>
          <p className="text-label text-outline leading-relaxed">
            {t(locale, "form_signin_note_sub")}
          </p>
        </Notice>

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
              <PhoneInput
                id={p.id}
                ariaInvalid={p.invalid}
                describedById={p.describedById}
                hasError={!!errors.phone}
                value={form.phone}
                onChange={(v) => set("phone", v)}
                hideError
              />
            )}
          </Field>

          {/* Multi-item picker when the company has priced offerings; otherwise
              the original single-service dropdown, which is still the right UI
              for a company the Feature B backfill hasn't reached. */}
          {company && (company.offerings?.length ?? 0) > 0 ? (
            <Field label={t(locale, "form_service_needed")}>
              {() => (
                <RequestItemPicker
                  offerings={company.offerings ?? []}
                  // Same rules the server prices with — an empty list here made
                  // the estimate on this page disagree with the saved lead.
                  bundleRules={company.bundleRules ?? []}
                  value={items}
                  onChange={setItems}
                />
              )}
            </Field>
          ) : company && company.services.length > 0 ? (
            <Field label={t(locale, "form_service_needed")}>
              {(p) => (
                <Select
                  id={p.id}
                  value={form.service}
                  onChange={(v) => set("service", v)}
                  placeholder={t(locale, "form_service_optional")}
                  options={[
                    { value: "", label: t(locale, "form_service_optional") },
                    ...company.services.map((s) => ({ value: s, label: s })),
                  ]}
                />
              )}
            </Field>
          ) : null}

          <Field label={t(locale, "form_district")} required error={errors.district}>
            {(p) => (
              <Select
                id={p.id}
                ariaInvalid={p.invalid}
                describedById={p.describedById}
                value={form.district}
                onChange={(v) => set("district", v)}
                placeholder={t(locale, "form_district_ph")}
                dataHasError={!!errors.district}
                options={[
                  { value: "", label: t(locale, "form_district_ph") },
                  ...districts.map((d) => ({ value: d, label: d })),
                ]}
              />
            )}
          </Field>

          <Field label={t(locale, "form_description")}>
            {(p) => (
              <div className="relative">
                <textarea
                  id={p.id}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={t(locale, "form_description_ph")}
                  rows={4}
                  className="field-input resize-none"
                  style={{ paddingBottom: "2.5rem" }}
                />
                {/* Character counter */}
                <span className={`absolute bottom-3 right-3 rtl:right-auto rtl:left-3 text-caption font-bold pointer-events-none
                  ${form.description.length > DESCRIPTION_MAX * 0.9 ? "text-error" : "text-outline/60"}`}>
                  {form.description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
            )}
          </Field>

          {/* Steps preview */}
          <div className="bg-surface-container rounded-xl p-4">
            <p className="text-caption font-bold text-outline ltr:uppercase ltr:tracking-wider mb-3">{t(locale, "form_next_title")}</p>
            <div className="space-y-2">
              {[
                t(locale, "form_next_1"),
                t(locale, "form_next_2"),
                t(locale, "form_next_3"),
                t(locale, "form_next_4"),
              ].map((s, i) => (
                <div key={s} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-caption font-black flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-label text-on-surface-variant">{s}</span>
                </div>
              ))}
            </div>
          </div>

          {submitError && (
            <Notice variant="error" icon="error" className="">
              <p className="text-label font-medium">{submitError}</p>
            </Notice>
          )}

          {/* Back from signing in with the form intact. Says so explicitly —
              seeing your own data still there is the reassurance; leaving it
              unremarked makes people re-check every field. */}
          {restored && (
            <Notice variant="success" icon="check_circle" className="">
              <p className="text-label font-medium">{t(locale, "form_restored")}</p>
            </Notice>
          )}

          {/* CAPTCHA — renders only when VITE_TURNSTILE_SITE_KEY is set */}
          <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-3 bg-primary text-on-primary
                        font-bold text-body py-4 rounded-xl transition shadow-bloom touch-press
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
                {/* The button says what the next click actually does. A visitor
                    who presses "Send" and lands on a sign-in page was misled,
                    even though the request does go out a moment later. */}
                <Icon name={needsSignIn ? "login" : "send"} className="text-title" />
                {t(locale, needsSignIn ? "form_submit_signin" : "form_submit")}
              </>
            )}
          </button>
          <p className="text-center text-caption text-outline">
            {t(locale, needsSignIn ? "form_signin_why" : "form_contact_24h")}
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
            className="sr-only"
          />
        </form>
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

// ── Notice ────────────────────────────────────────────────────────────────
// One shared container for the form's alert-style boxes (busy / smart
// pre-fill / trust bar / submit error) — previously each was hand-styled with
// its own combination of colors, padding and alignment. The text and
// per-notice conditional logic are unchanged (still owned by each call site);
// this only unifies the box they sit in.
function Notice({ variant, icon, children, action, className = "mb-4" }: {
  variant: "info" | "success" | "warning" | "error";
  icon: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Margin override — the trust bar needs more breathing room before the
   *  form starts, and the submit error sits inside the form's own space-y-5
   *  flow and needs none. */
  className?: string;
}) {
  const styles = {
    info: "bg-primary/6 border-primary/18 text-primary",
    success: "bg-green-50 border-green-200 text-green-700",
    warning: "bg-amber-50 border-amber-200 text-amber-600",
    error: "bg-error/8 border-error/25 text-error",
  }[variant];
  return (
    <div role={variant === "error" ? "alert" : undefined} className={`flex items-start gap-3 rounded-2xl border p-3.5 ${className} ${styles}`}>
      <span className="material-symbols-outlined text-title flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{icon}</span>
      <div className="flex-1">{children}</div>
      {action}
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
      <label htmlFor={id} className="block font-bold text-label text-on-surface mb-1.5">
        {label}
        {required && <span className="text-error ms-0.5">*</span>}
      </label>
      {children({ id, describedById: error ? errorId : undefined, invalid: !!error })}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-caption font-bold text-error flex items-center gap-1">
          <Icon name="error" className="text-label" />
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
    <div className="bg-surface min-h-screen pb-16 px-5 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-bloom">
          <Icon name="storefront" className="text-primary text-[44px]" style={{ fontVariationSettings: "'FILL' 1" }} />
        </div>
        <h1 className="font-black text-headline text-on-surface mb-2 tracking-tight">
          {t(locale, "form_pick_company_title")}
        </h1>
        <p className="text-body text-outline mb-7 leading-relaxed max-w-sm mx-auto">
          {t(locale, "form_pick_company_sub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/companies"
            className="flex-1 bg-primary text-on-primary py-3.5 rounded-xl font-bold text-body
                       hover:bg-primary-container transition-colors text-center touch-press btn-press">
            {t(locale, "common_browse_companies")}
          </Link>
          <Link to="/"
            className="flex-1 bg-surface-container-lowest text-on-surface py-3.5 rounded-xl font-bold text-body
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
    <div className="bg-surface min-h-screen pb-16 px-5 flex items-center justify-center">
      <div className="max-w-md w-full text-center">

        {/* Animated check */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-bloom">
          <Icon name="check_circle" className="text-primary text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }} />
        </div>

        <h1 className="font-black text-headline text-on-surface mb-2 tracking-tight">{t(locale, "form_success_title")}</h1>
        <p className="text-body text-outline mb-7 leading-relaxed max-w-sm mx-auto">
          {t(locale, "form_success_sub")}
        </p>

        {/* Reference card */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom mb-6 text-start">
          <p className="text-caption font-black text-outline ltr:uppercase ltr:tracking-[0.12em] mb-1.5">{t(locale, "form_ref_number")}</p>
          <p className="font-black text-primary text-[1.8rem] ltr:tracking-widest mb-5 font-mono" dir="ltr">{lead.refNumber}</p>
          <div className="space-y-2.5 pt-4 border-t border-outline-variant/20">
            <InfoRow icon="person" label={t(locale, "form_name")} val={lead.name} />
            <InfoRow icon="phone" label={t(locale, "form_phone_label")} val={formatPhoneDisplay(lead.phone)} />
            <InfoRow icon="location_on" label={t(locale, "requests_district")} val={lead.district} />
            <InfoRow icon="business" label={t(locale, "form_company")} val={companyName} />
          </div>
        </div>

        <div className="flex items-start gap-3 bg-primary/6 border border-primary/18 rounded-xl p-4 mb-7 text-start">
          <Icon name="info" className="text-primary text-subhead flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }} />
          <p className="text-label text-on-surface-variant leading-relaxed">
            {t(locale, "form_save_ref")}
          </p>
        </div>

        {/* The customer does not have to wait for the company to write first —
            the thread is created the moment either side sends into it. Without
            this link the only way here was Requests → find the card → open the
            chat button, so the request that had JUST been submitted was the
            hardest one to start talking about. */}
        {chatAvailable() && (
          <Link to={`/messages?ref=${encodeURIComponent(lead.refNumber)}`}
            className="flex items-center justify-center gap-2 w-full bg-primary text-on-primary py-3.5 rounded-xl font-bold text-body
                       hover:bg-primary-container transition-colors touch-press btn-press mb-3">
            <Icon name="chat" className="text-title" />
            {t(locale, "form_message_company_now")}
          </Link>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/"
            className={`flex-1 py-3.5 rounded-xl font-bold text-body transition-colors text-center touch-press btn-press ${
              chatAvailable()
                ? "bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border border-outline-variant/25"
                : "bg-primary text-on-primary hover:bg-primary-container"
            }`}>
            {t(locale, "common_back_to_home")}
          </Link>
          <Link to="/companies"
            className="flex-1 bg-surface-container-lowest text-on-surface py-3.5 rounded-xl font-bold text-body
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
      <span className="material-symbols-outlined text-outline text-body flex-shrink-0" aria-hidden="true" translate="no">{icon}</span>
      <span className="text-outline text-label w-20 flex-shrink-0">{label}</span>
      <span className="text-on-surface text-label font-bold truncate">{val}</span>
    </div>
  );
}
