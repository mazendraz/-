import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useProvider } from "../context";
import type { Lead } from "../../../lib/requests";
import { useLocale } from "../../../context/LocaleContext";
import { useToast } from "../../../context/ToastContext";
import { t } from "../../../lib/i18n";
import { fetchProviderLead, submitLeadCompletion } from "../../../lib/requests";
import { ApiError } from "../../../lib/api";
import { formatEgp } from "../../../lib/pricing";
import StepIndicator from "../../../components/StepIndicator";
import EmptyState from "../../../components/EmptyState";
import { Loading } from "../../admin/components/Loading";
import OrderSummary from "./OrderSummary";
import FinalAmountInput from "./FinalAmountInput";
import AdditionalWorkSelector from "./AdditionalWorkSelector";
import { CompletionReviewCard, CompletionSidebar } from "./CompletionSummary";
import CompletionActions from "./CompletionActions";

type Step = 1 | 2 | 3;

/** Parses a form amount string to a non-negative integer, or null if invalid. */
function parseAmount(raw: string): number | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export default function CompleteServicePage() {
  const { id } = useParams<{ id: string }>();
  const { leads } = useProvider();
  const { locale } = useLocale();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Whatever this page can show immediately: the lead handed over via navigate()
  // state (set when the route is opened from an already-loaded row — see
  // LeadsPage.tsx / OverviewPage.tsx), else the outlet's local cache.
  //
  // Both are opportunistic. State is gone the moment the page is reloaded or the
  // URL is opened directly, and `leads` is explicitly "fine for previews, NOT for
  // totals" (see ProviderOutletContext) — one capped ~100-row page, fetched when
  // the dashboard loaded and not refilled on an in-app navigation. A lead the
  // provider accepted off the waiting list minutes ago is in NEITHER: it was
  // created after that page was fetched. Treating them as the only sources is
  // what made this page report "not found" for a lead that plainly exists,
  // right after the one action most likely to lead here.
  const stateLead = (location.state as { lead?: Lead } | null)?.lead;
  const cached = (stateLead?.id === id ? stateLead : undefined) ?? leads.find((l) => l.id === id);

  const [fetched, setFetched] = useState<Lead | null>(null);
  // Only ever "the request for this lead came back empty-handed" — never the
  // reason a lead is merely absent from the caches above, which is what the old
  // not-found screen actually reported.
  const [missing, setMissing] = useState(false);

  // Always ask, even when a cached copy is already on screen — never "ask only
  // if the cache came up empty".
  //
  // `cached` is not stable for the life of this page: `leads` is one shared
  // localStorage list that background hydration rewrites wholesale (see
  // hydrateLeadsFromApi), so a lead present on the first render can be gone two
  // renders later. Gating the request on it meant the one render that mattered
  // decided, forever, that no request was needed — and when the cache was then
  // replaced the page had nothing left to show and sat on the spinner until it
  // was reloaded by hand.
  //
  // Asking unconditionally also keeps this page honest about the number it is
  // built around: the amount below is pre-filled from the lead's own estimate,
  // and a cached lead can be arbitrarily old.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchProviderLead(id)
      .then((l) => { if (alive) setFetched(l); })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [id]);

  // The server's copy wins once it lands; the cached one renders in the
  // meantime so opening this page from a dashboard row stays instant.
  const lead = fetched ?? cached;

  // The lead's own catalog total, when the order was booked with real priced
  // items (not "quoted after inspection", where no single number is known
  // yet). Pre-fills the amount field below so the provider confirms/adjusts
  // a number the system already has instead of retyping it from scratch.
  const knownAmount = lead && !lead.hasOnInspection && lead.estimatedMax != null ? lead.estimatedMax : null;

  const [step, setStep] = useState<Step>(1);
  const [providerAmount, setProviderAmount] = useState<string>(() => (knownAmount != null ? String(knownAmount) : ""));
  // The initialiser above only fires on the first render, which is enough when
  // the lead arrived with the navigation and too early when it arrives from the
  // fetch — that page would open with an empty amount and lose the pre-fill
  // entirely. Seed it once the lead lands, and only while the field is still
  // untouched, so this can never overwrite a number the provider typed.
  const seededAmount = useRef(knownAmount != null);
  useEffect(() => {
    if (seededAmount.current || knownAmount == null) return;
    seededAmount.current = true;
    setProviderAmount((current) => (current === "" ? String(knownAmount) : current));
  }, [knownAmount]);
  const [hasExtra, setHasExtra] = useState<boolean | null>(null);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [extraErrors, setExtraErrors] = useState<{ description?: string; amount?: string }>({});
  const [sending, setSending] = useState(false);

  if (!lead) {
    // Still asking. Saying "not found" here is what made a lead that exists look
    // deleted; the answer simply had not arrived yet.
    if (!missing) return <Loading msg={t(locale, "prov_wl_loading")} />;
    return (
      <EmptyState
        icon="search_off"
        title={t(locale, "completion_lead_not_found")}
        actionHref={{ label: t(locale, "prov_tab_leads"), to: "/provider/leads" }}
      />
    );
  }

  if (lead.completion) {
    return (
      <EmptyState
        icon="check_circle"
        title={t(locale, "completion_status_pending")}
        actionHref={{ label: t(locale, "prov_tab_leads"), to: "/provider/leads" }}
      />
    );
  }

  function handleStep1Continue() {
    const amount = parseAmount(providerAmount);
    if (amount === null) {
      setAmountError(t(locale, "completion_error_amount"));
      return;
    }
    setAmountError(undefined);
    setStep(2);
  }

  function handleStep2Continue() {
    if (hasExtra === null) return;
    if (hasExtra) {
      const errors: { description?: string; amount?: string } = {};
      if (!extraDescription.trim()) errors.description = t(locale, "completion_error_extra_desc");
      if (parseAmount(extraAmount) === null) errors.amount = t(locale, "completion_error_extra_amount");
      if (Object.keys(errors).length > 0) {
        setExtraErrors(errors);
        return;
      }
    }
    setExtraErrors({});
    setStep(3);
  }

  // "Confirm & Send to Client" lives in the sidebar, visible on every step —
  // a provider can reach it before ever touching step 2/3. It used to just
  // silently no-op if the data wasn't there yet; now it runs the same
  // validation each step's own Continue button does, jumps to whichever step
  // is actually incomplete, shows that step's inline error, and tells the
  // provider why nothing was sent instead of leaving them guessing.
  function validateAll(): boolean {
    const amount = parseAmount(providerAmount);
    if (amount === null) {
      setAmountError(t(locale, "completion_error_amount"));
      setStep(1);
      showToast({ message: t(locale, "completion_error_incomplete"), variant: "error" });
      return false;
    }
    if (hasExtra === null) {
      setStep(2);
      showToast({ message: t(locale, "completion_error_incomplete"), variant: "error" });
      return false;
    }
    if (hasExtra) {
      const errors: { description?: string; amount?: string } = {};
      if (!extraDescription.trim()) errors.description = t(locale, "completion_error_extra_desc");
      if (parseAmount(extraAmount) === null) errors.amount = t(locale, "completion_error_extra_amount");
      if (Object.keys(errors).length > 0) {
        setExtraErrors(errors);
        setStep(2);
        showToast({ message: t(locale, "completion_error_incomplete"), variant: "error" });
        return false;
      }
    }
    return true;
  }

  async function handleSend() {
    if (!validateAll()) return;
    const amount = parseAmount(providerAmount)!; // validateAll() just confirmed this
    setSending(true);
    try {
      // Narrowed by the early `if (!lead) return` above, but TS doesn't carry
      // that through a `const` derived from a `??` expression into a nested
      // function declaration — safe assertion, not a runtime risk.
      await submitLeadCompletion(lead!.id, {
        providerAmount: amount,
        additionalWork: hasExtra
          ? { description: extraDescription.trim(), amount: parseAmount(extraAmount) ?? 0 }
          : null,
        notes: notes.trim() || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      showToast({ message: t(locale, "completion_sent_toast"), variant: "success" });
      navigate("/provider/leads");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t(locale, "completion_error_generic");
      showToast({ message, variant: "error" });
    } finally {
      setSending(false);
    }
  }

  const totals = {
    providerAmount: parseAmount(providerAmount) ?? 0,
    hasExtra: hasExtra === true,
    extraAmount: parseAmount(extraAmount) ?? 0,
    extraDescription,
    attachmentsCount: attachments.length,
  };

  const referenceLabel = knownAmount != null ? t(locale, "completion_amount_from_order") : t(locale, "completion_amount_originally");
  const referenceValue = knownAmount != null ? formatEgp(knownAmount, locale) : lead.budget;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="font-black text-headline md:text-display text-on-surface tracking-tight mb-2">{t(locale, "completion_page_title")}</h1>
      <p className="text-body text-outline max-w-2xl mb-6">{t(locale, "completion_page_sub")}</p>

      <OrderSummary service={lead.service} clientName={lead.name} refNumber={lead.refNumber} createdAt={lead.createdAt} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div>
          <StepIndicator
            steps={[t(locale, "completion_step_amount"), t(locale, "completion_step_additional"), t(locale, "completion_step_review")]}
            current={step}
            onStepClick={(n) => {
              // Only backward navigation is free — advancing must go through
              // the same validation as the step's own Continue button.
              if (n < step) setStep(n as Step);
            }}
          />

          {step === 1 && (
            <FinalAmountInput
              value={providerAmount}
              onChange={setProviderAmount}
              referenceLabel={referenceLabel}
              referenceValue={referenceValue}
              prefilled={knownAmount != null && providerAmount === String(knownAmount)}
              error={amountError}
              onContinue={handleStep1Continue}
            />
          )}

          {step === 2 && (
            <AdditionalWorkSelector
              hasExtra={hasExtra}
              onHasExtraChange={setHasExtra}
              description={extraDescription}
              onDescriptionChange={setExtraDescription}
              amount={extraAmount}
              onAmountChange={setExtraAmount}
              notes={notes}
              onNotesChange={setNotes}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              errors={extraErrors}
              onBack={() => setStep(1)}
              onContinue={handleStep2Continue}
            />
          )}

          {step === 3 && (
            <CompletionReviewCard totals={totals} onBack={() => setStep(2)} locale={locale} />
          )}
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-5">
          <CompletionSidebar totals={totals} locale={locale} />
          <CompletionActions onSend={handleSend} sending={sending} onSaveLater={() => navigate("/provider/leads")} />
        </div>
      </div>
    </div>
  );
}
