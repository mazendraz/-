// No mockup exists for this screen (the 6 Stitch screens cover Overview,
// Clients, Finance x2, Operations x2, Pricing x2, Providers x2 — not auth) —
// built in the same DESIGN.md "Executive Minimalist" language as the rest.
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { user, login, loggingIn, loginError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from?.pathname ?? "/overview"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      /* loginError is already set by AuthProvider — nothing else to do here */
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-primary">AL ASIMA</h1>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Business Control Center</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-surface-variant bg-surface-container-lowest p-8"
        >
          <label className="block">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
              placeholder="you@alasima.com"
            />
          </label>

          <label className="mt-4 block">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          {loginError && (
            <p role="alert" className="mt-4 font-body-sm text-body-sm text-error">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="mt-6 w-full rounded bg-primary py-2.5 font-body-md text-body-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center font-body-sm text-body-sm text-on-surface-variant">
          Internal tool for Al Asima administrators only.
        </p>
      </div>
    </div>
  );
}
