import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Logo from "../components/Logo";
import Icon from "../components/Icon";
import PasswordField from "../components/PasswordField";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { usePageMeta } from "../hooks/usePageMeta";
import { isGoogleSignInConfigured, renderGoogleButton } from "../lib/googleSignIn";
import {
  registerWithPassword,
  resendVerification,
  signInWithGoogle,
  signInWithPassword,
  useCustomerAuth,
} from "../lib/customerAuth";
import { ApiError } from "../lib/api";

type Mode = "signin" | "register";

/**
 * Customer sign-in and registration.
 *
 * One page, two modes, because they are the same decision: people arrive knowing
 * they want in, not knowing which form they need. Splitting them across routes
 * means half the visitors land on the wrong one and have to find the other.
 *
 * Google sits above the email form rather than beside it — it is one click
 * against six fields, and the layout should say so.
 */
export default function SignIn() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer, loading: sessionLoading } = useCustomerAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const buttonSlot = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The one failure that isn't a dead end: the account exists and the password
  // was right, but the address was never confirmed. Offering the resend here is
  // the difference between recovering and giving up.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);
  // Registration succeeds into a waiting state, not a session.
  const [registered, setRegistered] = useState(false);
  // Registration succeeded but the email did not go out — a different screen,
  // because "check your inbox" sends people to wait for nothing.
  const [mailFailed, setMailFailed] = useState(false);

  // Only ever a path on this site. An absolute URL here would turn the sign-in
  // page into an open redirect — the standard way a phishing link borrows a real
  // domain's credibility.
  const rawNext = params.get("next") ?? "/requests";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/requests";

  usePageMeta(t(locale, "signin_title"), t(locale, "signin_meta_desc"));

  useEffect(() => {
    if (!sessionLoading && customer) navigate(next, { replace: true });
  }, [sessionLoading, customer, navigate, next]);

  // Clear per-attempt state when switching modes — a "wrong password" left
  // hanging over the registration form is confusing and false.
  useEffect(() => {
    setError("");
    setNeedsVerify(false);
    setResent(false);
  }, [mode]);

  // ── Google ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isGoogleSignInConfigured() || customer || sessionLoading || registered) return;

    let active = true;
    const slot = buttonSlot.current;
    if (!slot) return;

    renderGoogleButton(slot, locale, (idToken) => {
      if (!active) return;
      setError("");
      setBusy(true);
      signInWithGoogle(idToken)
        .then((outcome) =>
          navigate(outcome === "created" ? "/requests?welcome=1" : next, { replace: true }),
        )
        .catch((err) => {
          if (!active) return;
          setBusy(false);
          setError(
            t(
              locale,
              err instanceof ApiError && err.status === 401
                ? "signin_err_rejected"
                : "signin_err_generic",
            ),
          );
        });
    })
      .then(() => active && setGoogleReady(true))
      .catch(() => {
        if (!active) return;
        // An ad blocker and a too-narrow CSP look identical from here, and mean
        // the same thing to the visitor.
        setError(t(locale, "signin_err_blocked"));
      });

    return () => {
      active = false;
      if (slot) slot.innerHTML = "";
    };
  }, [locale, customer, sessionLoading, registered, navigate, next]);

  // ── Email + password ──────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerify(false);
    setBusy(true);

    try {
      if (mode === "register") {
        const { verificationSent } = await registerWithPassword({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        // The account exists either way, but it is unusable until the link is
        // clicked — so "check your inbox" would be a lie if nothing was sent.
        setMailFailed(!verificationSent);
        setRegistered(true);
        return;
      }
      const outcome = await signInWithPassword(email.trim(), password);
      navigate(outcome === "created" ? "/requests?welcome=1" : next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // The server sends this exact message for an unconfirmed address; it is
        // the only 401 here that has a next step attached to it.
        if (err.status === 401 && /confirm your email/i.test(err.message)) {
          setNeedsVerify(true);
        } else {
          // The server's own text for a conflict (address taken), a weak
          // password, or a rate limit is more specific than anything we could
          // substitute — the generic string is only for the cases it isn't.
          setError(
            err.status === 409 || err.status === 400 || err.status === 429
              ? err.message
              : t(locale, mode === "register" ? "signin_err_generic" : "signin_err_credentials"),
          );
        }
      } else {
        setError(t(locale, "signin_err_generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    try {
      await resendVerification(email.trim());
      setResent(true);
    } catch {
      setError(t(locale, "signin_err_generic"));
    } finally {
      setBusy(false);
    }
  }

  // ── Post-registration screen ──────────────────────────────────────────────
  if (registered) {
    return (
      <Shell>
        <div className="text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            mailFailed
              ? "bg-error-container text-on-error-container"
              : "bg-success-container text-on-success-container"
          }`}>
            <Icon name={mailFailed ? "error" : "mark_email_unread"} className="text-headline" />
          </div>
          <h1 className="font-display font-bold text-title text-on-surface mb-2">
            {t(locale, mailFailed ? "signin_mail_failed" : "signin_check_inbox")}
          </h1>
          <p className="text-label text-outline leading-relaxed">
            {mailFailed ? (
              t(locale, "signin_mail_failed_body")
            ) : (
              <>
                {t(locale, "signin_check_inbox_body")}{" "}
                <span className="font-bold text-on-surface-variant" dir="ltr">
                  {email.trim()}
                </span>
              </>
            )}
          </p>

          {resent ? (
            <p className="mt-5 text-label font-bold text-success">{t(locale, "signin_resent")}</p>
          ) : (
            <button
              onClick={onResend}
              disabled={busy}
              className="mt-5 text-label font-bold text-primary hover:underline disabled:opacity-60"
            >
              {t(locale, "signin_resend")}
            </button>
          )}

          <button
            onClick={() => {
              setRegistered(false);
              setMode("signin");
            }}
            className="mt-6 block w-full text-label font-bold text-outline hover:text-on-surface transition-colors"
          >
            {t(locale, "signin_back_to_signin")}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 mb-6">
        <Logo className="h-14 w-14 rounded-2xl object-contain" width={56} height={56} />
        <div className="text-center">
          <h1 className="font-display font-bold text-title text-on-surface">
            {t(locale, mode === "signin" ? "signin_heading" : "signin_heading_register")}
          </h1>
          <p className="text-label text-outline mt-1">{t(locale, "signin_sub")}</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container rounded-xl px-3 py-2.5 text-label font-medium flex items-start gap-2 mb-4"
        >
          <Icon name="error" className="text-subhead shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {needsVerify && (
        <div
          role="alert"
          className="bg-warning-container text-on-warning-container rounded-xl px-3 py-2.5 text-label mb-4"
        >
          <p className="font-medium mb-1.5">{t(locale, "signin_err_unverified")}</p>
          {resent ? (
            <p className="font-bold">{t(locale, "signin_resent")}</p>
          ) : (
            <button
              onClick={onResend}
              disabled={busy}
              className="font-bold underline disabled:opacity-60"
            >
              {t(locale, "signin_resend")}
            </button>
          )}
        </div>
      )}

      {/* Google first — one click against six fields. */}
      {isGoogleSignInConfigured() && (
        <>
          <div className="flex justify-center">
            <div ref={buttonSlot} className={busy ? "opacity-50 pointer-events-none" : undefined} />
            {!googleReady && !error && (
              <div className="h-10 w-full rounded-full bg-surface-container animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-3 my-5">
            <span className="h-px flex-1 bg-outline-variant/40" />
            <span className="text-caption text-outline">{t(locale, "signin_or")}</span>
            <span className="h-px flex-1 bg-outline-variant/40" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "register" && (
          <label className="block">
            <span className="text-caption font-bold text-on-surface-variant mb-1.5 block">
              {t(locale, "signin_name")}
            </span>
            <input
              type="text"
              required
              autoComplete="name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}

        <label className="block">
          <span className="text-caption font-bold text-on-surface-variant mb-1.5 block">
            {t(locale, "auth_email")}
          </span>
          <input
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(locale, "auth_email_placeholder")}
          />
        </label>

        <PasswordField
          label="auth_password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          // Stated up front, not discovered by being rejected.
          hint={mode === "register" ? "signin_password_hint" : undefined}
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-label hover:bg-primary-container transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t(
            locale,
            busy
              ? "auth_signing_in"
              : mode === "signin"
                ? "auth_sign_in"
                : "signin_create_account",
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-label text-outline">
        {t(locale, mode === "signin" ? "signin_no_account" : "signin_have_account")}{" "}
        <button
          onClick={() => setMode(mode === "signin" ? "register" : "signin")}
          className="font-bold text-primary hover:underline"
        >
          {t(locale, mode === "signin" ? "signin_create_account" : "auth_sign_in")}
        </button>
      </p>

      <p className="mt-5 text-caption text-outline text-center leading-relaxed">
        {t(locale, "signin_legal_prefix")}{" "}
        <Link to="/terms" className="font-bold text-primary hover:underline">
          {t(locale, "signin_legal_terms")}
        </Link>{" "}
        {t(locale, "signin_legal_and")}{" "}
        <Link to="/privacy" className="font-bold text-primary hover:underline">
          {t(locale, "signin_legal_privacy")}
        </Link>
        .
      </p>

      <Link
        to="/"
        className="mt-5 flex items-center justify-center gap-1 text-label font-bold text-outline hover:text-on-surface transition-colors"
      >
        <Icon name="arrow_back" className="text-body" />
        {t(locale, "auth_back_to_site")}
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 page-enter">
        {children}
      </div>
    </div>
  );
}
