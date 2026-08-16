import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

/**
 * A password input with a show/hide toggle.
 *
 * Shared rather than repeated, because the layout below is easy to get wrong in
 * exactly one way and the bug is invisible in English.
 *
 * ── Why `dir="ltr"` sits on the WRAPPER ──────────────────────────────────────
 * A password is Latin characters and symbols; it should read left-to-right even
 * on an Arabic page. But putting `dir="ltr"` on the <input> alone leaves the
 * wrapper inheriting the page's RTL, and then the two logical properties that
 * position the toggle resolve against OPPOSITE directions:
 *
 *   • `pe-11` on the input   → the input is LTR → padding on the RIGHT
 *   • `end-0` on the button  → the wrapper is RTL → button on the LEFT
 *
 * The reserved space ends up on one side and the button on the other, so the
 * icon lands on top of the text. Marking the WRAPPER `ltr` makes both resolve
 * the same way — space and button both on the right — and the input inherits it.
 *
 * Everything outside the wrapper (the label, the hint) stays in the page's own
 * direction, which is what those should follow.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  placeholder = "••••••••",
  required = true,
  autoFocus = false,
}: {
  /**
   * i18n key for the field label. OMIT it when the field sits inside a wrapper
   * that already renders one (the admin forms' LField does) — otherwise the
   * label appears twice.
   */
  label?: StringKey;
  value: string;
  onChange: (value: string) => void;
  /** "new-password" when setting one, "current-password" when signing in — the
   *  wrong value here is why so many forms fight the browser's password manager. */
  autoComplete: "new-password" | "current-password";
  /** i18n key for a hint under the field (e.g. the strength rule on sign-up). */
  hint?: StringKey;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);

  const control = (
    // dir="ltr" belongs HERE, on the wrapper — see the note above.
    <div className="relative" dir="ltr">
      <input
        type={visible ? "text" : "password"}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className="field-input pe-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={t(locale, visible ? "auth_hide_password" : "auth_show_password")}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 flex items-center pe-3 text-outline hover:text-on-surface-variant transition-colors focus:outline-none"
      >
        <span className="material-symbols-outlined text-title" aria-hidden="true" translate="no">
          {visible ? "visibility_off" : "visibility"}
        </span>
      </button>
    </div>
  );

  // Unlabelled: return the control bare so the caller's own <label> stays the
  // only one. The hint still rides along, in the page's direction.
  if (!label) {
    return (
      <>
        {control}
        {hint && <p className="text-caption text-outline mt-1.5">{t(locale, hint)}</p>}
      </>
    );
  }

  return (
    <label className="block">
      <span className="text-caption font-bold text-on-surface-variant mb-1.5 block">
        {t(locale, label)}
      </span>
      {control}
      {hint && <p className="text-caption text-outline mt-1.5">{t(locale, hint)}</p>}
    </label>
  );
}
