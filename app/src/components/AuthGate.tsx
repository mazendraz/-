import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { login, logout, useAuth, type AuthUser, type Role } from "../lib/auth";
import { ApiError } from "../lib/api";
import Logo from "./Logo";
import { useLocale } from "../context/LocaleContext";
import { t, type Locale, type StringKey } from "../lib/i18n";

const ROLE_LABEL_KEY: Record<Role, StringKey> = {
  ADMIN: "auth_role_admin",
  PROVIDER: "auth_role_provider",
};

const roleLabel = (role: Role, locale: Locale) => t(locale, ROLE_LABEL_KEY[role]);

function Spinner() {
  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

function LoginScreen({ requiredRole }: { requiredRole: Role }) {
  const { locale } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      // useAuth picks up the session via the auth-changed event.
    } catch (err) {
      setError(
        t(locale, err instanceof ApiError && err.status === 401
          ? "auth_err_credentials"
          : "auth_err_generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 page-enter">
        <div className="flex flex-col items-center gap-3 mb-6">
          <Logo className="h-14 w-14 rounded-2xl object-contain" />
          <div className="text-center">
            <h1 className="font-display font-bold text-[22px] text-on-surface">Al Assema</h1>
            <p className="text-[13px] text-outline">
              {roleLabel(requiredRole, locale)} {t(locale, "auth_sign_in_suffix")}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="bg-error-container text-on-error-container rounded-xl px-3 py-2.5 text-[13px] font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}
          <label className="block">
            <span className="text-[12px] font-bold text-on-surface-variant mb-1.5 block">{t(locale, "auth_email")}</span>
            <input
              type="email"
              required
              autoFocus
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t(locale, "auth_email_placeholder")}
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-on-surface-variant mb-1.5 block">{t(locale, "auth_password")}</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                className="field-input pe-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={t(locale, showPassword ? "auth_hide_password" : "auth_show_password")}
                aria-pressed={showPassword}
                className="absolute inset-y-0 end-0 flex items-center pe-3 text-outline hover:text-on-surface-variant transition-colors focus:outline-none"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-[14px] hover:bg-primary-container transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t(locale, busy ? "auth_signing_in" : "auth_sign_in")}
          </button>
        </form>

        <Link
          to="/"
          className="mt-5 flex items-center justify-center gap-1 text-[13px] font-bold text-outline hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          {t(locale, "auth_back_to_site")}
        </Link>
      </div>
    </div>
  );
}

function AccessDenied({ requiredRole, user }: { requiredRole: Role; user: AuthUser }) {
  const { locale } = useLocale();
  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 text-center page-enter">
        <div className="w-14 h-14 rounded-2xl bg-error-container text-on-error-container flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">lock</span>
        </div>
        <h1 className="font-display font-bold text-[20px] text-on-surface mb-1">
          {roleLabel(requiredRole, locale)} {t(locale, "auth_access_required_suffix")}
        </h1>
        <p className="text-[13px] text-outline mb-5">
          {t(locale, "auth_signed_in_as")} <span className="font-bold text-on-surface-variant">{user.email}</span> ({user.role}).
        </p>
        <button
          onClick={() => logout()}
          className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-[14px] hover:bg-primary-container transition-colors btn-press"
        >
          {t(locale, "auth_sign_out")}
        </button>
        <Link to="/" className="mt-4 inline-block text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          {t(locale, "auth_back_to_site")}
        </Link>
      </div>
    </div>
  );
}

/**
 * Guards a dashboard route. Enforced only when the API is configured; in demo
 * mode (no VITE_API_URL) it renders children directly, preserving offline use.
 */
export default function RequireAuth({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const { user, loading, enforced } = useAuth();

  if (!enforced) return <>{children}</>;
  if (loading) return <Spinner />;
  if (!user) return <LoginScreen requiredRole={role} />;
  if (user.role !== role) return <AccessDenied requiredRole={role} user={user} />;
  return <>{children}</>;
}
