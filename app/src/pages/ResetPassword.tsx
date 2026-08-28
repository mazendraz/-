import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import Icon from "../components/Icon";
import PasswordField from "../components/PasswordField";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { usePageMeta } from "../hooks/usePageMeta";
import { resetPassword } from "../lib/customerAuth";
import { ApiError } from "../lib/api";

/** Matches customerPasswordSchema in the API. Kept as a constant so the button's
 *  enabled state, the rule shown under the field, and the value the server will
 *  actually enforce are one number rather than three. */
const MIN_LENGTH = 8;

/**
 * The landing page for the emailed reset link (/reset-password?token=…).
 *
 * One step longer than VerifyEmail, which needs nothing but its token: this one
 * still needs the NEW password before it can call anything, so there is a real
 * form here rather than a redirect on mount.
 *
 * Succeeding signs them in — the link came out of the inbox they are proving
 * they control — so it lands on their requests rather than back on a sign-in
 * form asking for the password they set two seconds ago.
 */
export default function ResetPassword() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A DEAD LINK is a different screen from a failed submit, not a message above
  // the form: expired, already used, and absent all mean "this form can never
  // succeed", so leaving it on screen to be retried is a trap. Seeded from the
  // token's absence, and set again if the server rejects the one we have.
  const [linkDead, setLinkDead] = useState(token === "");

  usePageMeta(t(locale, "reset_title"), t(locale, "reset_meta_desc"));

  const longEnough = password.length >= MIN_LENGTH;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !longEnough) return;
    setError("");
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate("/requests", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The token itself was refused — same terminal state as never having
        // had one.
        setLinkDead(true);
      } else {
        // The server's own message when it has one: it is the only thing that
        // can say "pick a password that isn't part of your email address".
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : t(locale, "reset_err_generic"),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Dead link ─────────────────────────────────────────────────────────────
  if (linkDead) {
    return (
      <AuthCard
        icon="link_off"
        tone="error"
        title={t(locale, "reset_invalid_title")}
        backTo="/signin"
      >
        <p className="mt-3 text-center text-label text-outline leading-relaxed">
          {t(locale, "reset_invalid_body")}
        </p>
        <button
          onClick={() => navigate("/forgot-password", { replace: true })}
          className="mt-6 w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-label hover:bg-primary-container transition-colors btn-press"
        >
          {t(locale, "reset_invalid_action")}
        </button>
      </AuthCard>
    );
  }

  // ── Set a new one ─────────────────────────────────────────────────────────
  return (
    <AuthCard icon="key" title={t(locale, "reset_heading")}>
      <p className="mt-3 text-center text-label text-outline leading-relaxed">
        {t(locale, "reset_sub")}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-5 bg-error-container text-on-error-container rounded-xl px-3 py-2.5 text-label font-medium flex items-start gap-2"
        >
          <Icon name="error" className="text-subhead shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <PasswordField
          label="reset_password_label"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
        />

        {/* The rule as a live checkmark rather than a static hint. The password
            is masked by default, so "is what I typed long enough" is otherwise
            something you can only learn by being rejected. */}
        <p
          className={`flex items-center gap-1.5 text-caption transition-colors ${
            longEnough ? "text-success" : "text-outline"
          }`}
        >
          <Icon
            name={longEnough ? "check_circle" : "radio_button_unchecked"}
            className="text-label"
            fill={longEnough}
          />
          {t(locale, "reset_rule_length")}
        </p>

        <button
          type="submit"
          disabled={busy || !longEnough}
          className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-label hover:bg-primary-container transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t(locale, busy ? "reset_working" : "reset_submit")}
        </button>
      </form>

      <p className="mt-5 flex items-start justify-center gap-1.5 text-caption text-outline leading-relaxed">
        <Icon name="devices" className="text-label shrink-0 mt-px" />
        <span>{t(locale, "reset_revokes_note")}</span>
      </p>
    </AuthCard>
  );
}
