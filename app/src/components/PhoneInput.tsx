import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { DEFAULT_COUNTRY, formatAsYouType, isValidE164, parseExisting, toE164 } from "../lib/phone";

interface PhoneInputProps {
  id?: string;
  name?: string;
  /** E.164, controlled — e.g. "+201001234567", or "" when empty. */
  value: string;
  onChange: (e164: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Lets a page's own submit-time validate() stay in sync without re-deriving. */
  onValidityChange?: (valid: boolean) => void;
  /** Suppress the built-in inline error message — for pages (RequestForm,
   *  CompanyProfile modals) that already render their own error paragraph
   *  keyed off `onValidityChange`, so the two don't show duplicate text. The
   *  red border still applies; only the caption is suppressed. */
  hideError?: boolean;
  /** Wired from a page's own Field wrapper for a11y parity with its other inputs. */
  ariaInvalid?: boolean;
  describedById?: string;
  /** Mirrors this codebase's `data-has-error` convention (see RequestForm.tsx) —
   *  submit's focus-first-invalid-field logic looks for it on a real, focusable
   *  element, so it has to land on the underlying <input>, not a wrapper div. */
  hasError?: boolean;
}

/**
 * Egypt-only phone field: fixed "+20" prefix plus a text box that live-formats
 * as the user types and normalizes to E.164 on every change. The platform only
 * serves Egyptian numbers, so there's no country picker — see PhoneInput plan.
 */
export default function PhoneInput({
  id, name, value, onChange, disabled, placeholder, className, onValidityChange,
  hideError, ariaInvalid, describedById, hasError,
}: PhoneInputProps) {
  const { locale } = useLocale();
  const country = DEFAULT_COUNTRY;

  const [national, setNational] = useState(() => parseExisting(value, country).national);
  const [touched, setTouched] = useState(false);

  // Re-derive from `value` only when it changed from OUTSIDE (initial load,
  // baseline reset/cancel) — not when it's simply the E.164 we just emitted
  // ourselves from a keystroke, which would otherwise fight the user's typing.
  useEffect(() => {
    const current = national ? toE164(national, country) : null;
    if (value === (current ?? "")) return;
    setNational(parseExisting(value, country).national);
  }, [value]);

  const current = national ? toE164(national, country) : null;
  const valid = isValidE164(current ?? "");
  const showError = touched && national.trim().length > 0 && !valid;

  useEffect(() => { onValidityChange?.(valid); }, [valid]);

  // Only emit once libphonenumber can build a real E.164 number — while the
  // user is still mid-digit, concatenating the dial code onto whatever's
  // typed so far (e.g. "+20" + "0100...") produced a malformed number (an
  // extra leading trunk "0", or the dial code alone once the field was
  // cleared back down to one character) that then round-tripped into
  // `value` on every keystroke.
  function handleTextChange(raw: string) {
    const formatted = formatAsYouType(raw, country);
    setNational(formatted);
    onChange(toE164(raw, country) ?? "");
  }

  return (
    <div className={className}>
      {/* Single bordered field (not two boxes side by side) — "+20" sits
          inside it as a fixed, non-editable prefix. Phone numbers stay LTR as
          a unit even on an RTL page — the same convention RequestForm's old
          plain input used (`dir="ltr"`), needed because a grouped number like
          "+20 100 123 4567" can otherwise visually reorder under the Arabic
          bidi context. */}
      <div
        dir="ltr"
        className={`field-input flex items-center gap-2 ${showError || hasError ? "error" : ""} ${disabled ? "opacity-60" : ""}`}
      >
        <span
          className="border-e border-outline-variant/40 pe-2 text-label font-bold text-on-surface select-none"
          aria-hidden="true"
        >
          +20
        </span>

        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={disabled}
          value={national}
          placeholder={placeholder}
          aria-invalid={ariaInvalid ?? showError}
          aria-describedby={describedById}
          data-has-error={hasError}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className="flex-1 min-w-0 border-0 bg-transparent p-0 text-inherit outline-none"
        />
      </div>
      {!hideError && showError && <p className="text-caption text-error font-bold mt-1">{t(locale, "phone_invalid")}</p>}
    </div>
  );
}
