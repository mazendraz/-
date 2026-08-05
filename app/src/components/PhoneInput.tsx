import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import {
  DEFAULT_COUNTRY, countryOptions, formatAsYouType, isValidE164,
  parseExisting, toE164, type CountryCode, type CountryOption,
} from "../lib/phone";
import Icon from "./Icon";

interface PhoneInputProps {
  id?: string;
  name?: string;
  /** E.164, controlled — e.g. "+201001234567", or "" when empty. */
  value: string;
  onChange: (e164: string) => void;
  /** Preselected country when `value` is empty or doesn't parse. Defaults to Egypt (#9). */
  defaultCountry?: CountryCode;
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
 * Stripe/Google-style phone input: searchable country picker (flag + name +
 * dial code) plus a text box that live-formats as the user types and
 * normalizes to E.164 on every change. Built to sit inside whatever field
 * wrapper a page already uses (LField, Field, a raw <label>) — it renders
 * only the control itself, styled to match `.field-input` rather than
 * inventing a new visual language (no reusable input component existed to
 * extend — see PhoneInput plan).
 */
export default function PhoneInput({
  id, name, value, onChange, defaultCountry = DEFAULT_COUNTRY, disabled, placeholder, className, onValidityChange,
  hideError, ariaInvalid, describedById, hasError,
}: PhoneInputProps) {
  const { locale } = useLocale();
  const options = useMemo(() => countryOptions(locale), [locale]);

  const [country, setCountry] = useState<CountryCode>(() => parseExisting(value, defaultCountry).country);
  const [national, setNational] = useState(() => parseExisting(value, defaultCountry).national);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Closing on the trigger BUTTON's onBlur (the obvious first approach) is
  // wrong here: opening the dropdown moves focus to its auto-focused search
  // box, which blurs the button and would close the dropdown ~150ms after it
  // opened — before the user can type. A real click-outside check (does the
  // event target land inside the whole picker, button + panel alike) is what
  // CategoryMultiSelect's simpler onBlur-with-timeout didn't need, because
  // there the search box IS the trigger, not a separate element.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Re-derive from `value` only when it changed from OUTSIDE (initial load,
  // baseline reset/cancel) — not when it's simply the E.164 we just emitted
  // ourselves from a keystroke, which would otherwise fight the user's typing.
  useEffect(() => {
    const current = national ? toE164(national, country) : null;
    if (value === (current ?? "")) return;
    const parsed = parseExisting(value, defaultCountry);
    setCountry(parsed.country);
    setNational(parsed.national);
  }, [value]);

  const current = national ? toE164(national, country) : null;
  const valid = isValidE164(current ?? "");
  const showError = touched && national.trim().length > 0 && !valid;

  useEffect(() => { onValidityChange?.(valid); }, [valid]);

  const selected = options.find((o) => o.code === country);

  function emit(nextNational: string, nextCountry: CountryCode) {
    const e164 = toE164(nextNational, nextCountry);
    const digits = nextNational.replace(/\D/g, "");
    onChange(e164 ?? (digits ? `+${options.find((o) => o.code === nextCountry)?.dialCode}${digits}` : ""));
  }

  function handleTextChange(raw: string) {
    const formatted = formatAsYouType(raw, country);
    setNational(formatted);
    emit(raw, country);
  }

  function selectCountry(opt: CountryOption) {
    setCountry(opt.code);
    setOpen(false);
    setQuery("");
    const formatted = formatAsYouType(national, opt.code);
    setNational(formatted);
    emit(national, opt.code);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q) || o.dialCode.includes(q));
  }, [options, query]);

  return (
    <div className={className}>
      {/* Phone numbers stay LTR as a unit even on an RTL page — the same
          convention RequestForm's old plain input used (`dir="ltr"`), needed
          because a grouped number like "+20 100 123 4567" can otherwise
          visually reorder under the Arabic bidi context. */}
      <div className="flex gap-2" dir="ltr">
        <div className="relative flex-shrink-0" ref={pickerRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t(locale, "phone_select_country_aria")}
            className={`field-input !w-auto flex items-center gap-1.5 px-3 disabled:opacity-60 ${showError ? "error" : ""}`}
          >
            {selected && <span className={`fi fi-${selected.code.toLowerCase()} rounded-[3px]`} />}
            <span className="text-label font-bold text-on-surface">+{selected?.dialCode}</span>
            <Icon name="expand_more" className="text-outline text-body" />
          </button>

          {open && (
            <div className="absolute z-20 mt-1 start-0 w-72 max-w-[85vw] max-h-72 flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-bloom overflow-hidden">
              <div className="relative p-2 border-b border-outline-variant/15 flex-shrink-0">
                <Icon name="search" className="absolute start-4 top-1/2 -translate-y-1/2 text-outline text-label pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(locale, "phone_search_ph")}
                  className="field-input ps-9 !py-2 text-label"
                />
              </div>
              <div className="overflow-y-auto">
                {matches.length === 0 ? (
                  <p className="px-3 py-3 text-caption text-outline text-center">{t(locale, "phone_no_match")}</p>
                ) : (
                  matches.map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCountry(opt)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-start text-label transition-colors hover:bg-surface-container ${
                        opt.code === country ? "bg-primary/8 text-primary font-bold" : "text-on-surface"
                      }`}
                    >
                      <span className={`fi fi-${opt.code.toLowerCase()} rounded-[3px] flex-shrink-0`} />
                      <span className="flex-1 truncate">{opt.name}</span>
                      <span className="text-caption text-outline">+{opt.dialCode}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
          className={`field-input flex-1 min-w-0 ${showError || hasError ? "error" : ""}`}
        />
      </div>
      {!hideError && showError && <p className="text-caption text-error font-bold mt-1">{t(locale, "phone_invalid")}</p>}
    </div>
  );
}
