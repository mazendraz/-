import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import Icon from "../components/Icon";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { usePageMeta } from "../hooks/usePageMeta";
import { requestPasswordReset, useCustomerAuth } from "../lib/customerAuth";

/**
 * "Forgot your password?" — one field, one action, reached from the sign-in
 * page.
 *
 * ── Why it always ends the same way ──────────────────────────────────────────
 * The server answers identically whether the address has an account, is
 * Google-only, or is deactivated, and this screen must not undo that by
 * behaving differently. So the success state is reached on failure too: the
 * copy is written to be true either way ("if this address has an account…"),
 * and a network hiccup that swallowed the request costs nothing but a retry,
 * which the same screen offers.
 *
 * Completing the reset happens in ResetPassword, reached from the emailed link.
 * This page only ever asks for the address.
 */
export default function ForgotPassword() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { customer, loading: sessionLoading } = useCustomerAuth();

  // Prefilled from whatever was typed on the sign-in form, handed over in
  // router state (never the query string — see the link that sets it).
  const handedOver = (useLocation().state as { email?: string } | null)?.email;
  const [email, setEmail] = useState(handedOver ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Second and later sends from the confirmation screen, so the button can say
  // "sent" rather than looking like it did nothing.
  const [resent, setResent] = useState(false);

  usePageMeta(t(locale, "forgot_title"), t(locale, "forgot_meta_desc"));

  // Nobody signed in needs this page — and arriving here from a stale link
  // while signed in should not look like the account is in trouble.
  useEffect(() => {
    if (!sessionLoading && customer) navigate("/account", { replace: true });
  }, [sessionLoading, customer, navigate]);

  async function send(): Promise<void> {
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
    } catch {
      // Deliberately swallowed — see the note at the top of this file.
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    await send();
    setSent(true);
  }

  async function onResend() {
    if (busy) return;
    await send();
    setResent(true);
  }

  // ── Sent ──────────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <AuthCard icon="mark_email_unread" tone="success" title={t(locale, "forgot_sent_title")}>
        <p className="mt-3 text-center text-label text-outline leading-relaxed">
          {t(locale, "forgot_sent_body")}
        </p>

        {/* The address echoed back, so a typo is catchable without retyping it.
            dir="ltr" because an email is Latin text on an Arabic page. */}
        <p
          dir="ltr"
          className="mt-4 bg-surface-container rounded-xl px-3 py-2.5 text-center text-label font-bold text-on-surface-variant break-all"
        >
          {email.trim()}
        </p>

        <p className="mt-4 flex items-start justify-center gap-1.5 text-caption text-outline leading-relaxed">
          <Icon name="schedule" className="text-label shrink-0 mt-px" />
          <span>{t(locale, "forgot_sent_expiry")}</span>
        </p>

        {resent ? (
          <p className="mt-5 text-center text-label font-bold text-success">
            {t(locale, "signin_resent")}
          </p>
        ) : (
          <button
            onClick={onResend}
            disabled={busy}
            className="mt-5 block w-full text-label font-bold text-primary hover:underline disabled:opacity-60"
          >
            {t(locale, "forgot_resend")}
          </button>
        )}
      </AuthCard>
    );
  }

  // ── Ask ───────────────────────────────────────────────────────────────────
  return (
    <AuthCard icon="lock_reset" title={t(locale, "forgot_heading")}>
      <p className="mt-3 text-center text-label text-outline leading-relaxed">
        {t(locale, "forgot_sub")}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-caption font-bold text-on-surface-variant mb-1.5 block">
            {t(locale, "auth_email")}
          </span>
          <input
            type="email"
            required
            dir="ltr"
            autoFocus
            autoComplete="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(locale, "auth_email_placeholder")}
          />
        </label>

        <button
          type="submit"
          disabled={busy || email.trim() === ""}
          className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-label hover:bg-primary-container transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t(locale, busy ? "forgot_sending" : "forgot_submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-label text-outline">
        {t(locale, "signin_no_account")}{" "}
        <Link to="/signin" className="font-bold text-primary hover:underline">
          {t(locale, "signin_create_account")}
        </Link>
      </p>
    </AuthCard>
  );
}
