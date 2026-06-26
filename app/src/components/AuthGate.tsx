import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { login, logout, useAuth, type AuthUser, type Role } from "../lib/auth";
import { ApiError } from "../lib/api";
import Logo from "./Logo";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", PROVIDER: "Provider" };

function Spinner() {
  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

function LoginScreen({ requiredRole }: { requiredRole: Role }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : "Couldn't sign in. Please try again.",
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
            <h1 className="font-display font-bold text-[22px] text-on-surface">Al Assemah</h1>
            <p className="text-[13px] text-outline">{ROLE_LABEL[requiredRole]} sign in</p>
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
            <span className="text-[12px] font-bold text-on-surface-variant mb-1.5 block">Email</span>
            <input
              type="email"
              required
              autoFocus
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-on-surface-variant mb-1.5 block">Password</span>
            <input
              type="password"
              required
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-[14px] hover:bg-primary-container transition-colors btn-press disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <Link
          to="/"
          className="mt-5 flex items-center justify-center gap-1 text-[13px] font-bold text-outline hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to site
        </Link>
      </div>
    </div>
  );
}

function AccessDenied({ requiredRole, user }: { requiredRole: Role; user: AuthUser }) {
  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 text-center page-enter">
        <div className="w-14 h-14 rounded-2xl bg-error-container text-on-error-container flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">lock</span>
        </div>
        <h1 className="font-display font-bold text-[20px] text-on-surface mb-1">
          {ROLE_LABEL[requiredRole]} access required
        </h1>
        <p className="text-[13px] text-outline mb-5">
          You're signed in as <span className="font-bold text-on-surface-variant">{user.email}</span> ({user.role}).
        </p>
        <button
          onClick={() => logout()}
          className="w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-[14px] hover:bg-primary-container transition-colors btn-press"
        >
          Sign out
        </button>
        <Link to="/" className="mt-4 inline-block text-[13px] font-bold text-outline hover:text-on-surface transition-colors">
          Back to site
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
