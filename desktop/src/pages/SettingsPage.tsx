// Settings — Phase 12. Profile, Security, Notifications and a read-only
// Desktop Permissions panel, all backed by endpoints that already exist
// (GET /auth/me, PATCH /auth/password, GET/PUT /admin/notification-settings)
// — zero new backend code. Deliberately does NOT rebuild the public Platform
// Settings editor (site name, social links, hero images, legal pages,
// maintenance mode) that /admin/settings already backs: that's the Admin
// Dashboard's job (the brief says it "stays intact"), and duplicating it
// here for an internal desktop tool would be exactly the kind of duplicate
// system the brief warns against. Nothing here can read or display a DB URL,
// service-role key, JWT secret, or API secret — none of those are ever
// serialized into any endpoint this screen calls.
//
// "Application Preferences" (per the brief) has no real persisted setting
// behind it yet — no per-user desktop preference store exists in the
// backend, and inventing a fake theme/locale toggle that doesn't actually do
// anything would be exactly the "no fake buttons" rule this project keeps
// flagging. What IS real is the app's own identity — version, API endpoint
// — so that's what the "Application" section below shows: honest read-only
// info, not an invented preference.
import { useState, type FormEvent, type ReactNode } from "react";
import { apiGet, apiPatch, apiPut, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/hooks/useFetch";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState } from "@/components/states/States";
import { DESKTOP_PERMISSIONS, hasPermission, type DesktopPermission } from "@/lib/permissions";
import type { ApiAdminNotificationSettings } from "@/lib/apiTypes";

// Kept in sync with package.json / src-tauri/tauri.conf.json by hand — Vite
// doesn't expose the package version at runtime without extra build config,
// and this is read-only display text, not something worth a plugin for.
const APP_VERSION = "0.1.0";
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");

// One label per permission, reusing the exact wording the sidebar's NAV
// groups already use (navConfig.ts) rather than inventing new copy —
// "(write)" appended so finance:read and finance:write (same NAV group,
// finance:write only gated ad-hoc within FinanceLedgerScreen's "Add Expense"
// action, not a group permission of its own) stay distinguishable.
const PERMISSION_LABELS: Record<DesktopPermission, string> = {
  "overview:read": "Overview",
  "operations:read": "Operations",
  "business:read": "Business",
  "finance:read": "Finance",
  "finance:write": "Finance (write)",
  "analytics:read": "Analytics",
  "reports:read": "Reports",
  "settings:write": "Settings (write)",
};

export function SettingsPage() {
  const { user, logout, can } = useAuth();

  if (!user) return null;

  return (
    <>
      <PageHeader title="Settings" description="Your profile, security, and Business Control Center access." />

      <div className="flex flex-col gap-6">
        <ProfileSection name={user.name} email={user.email} role={user.role} />
        <SecuritySection onSignOut={logout} />
        <NotificationsSection canWrite={can("settings:write")} />
        <PermissionsSection permissions={user.desktopPermissions} />
        <ApplicationSection />
      </div>
    </>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-4">
        <span className="material-symbols-outlined text-[18px] text-outline">{icon}</span>
        <h3 className="font-headline-sm text-headline-sm font-semibold text-primary">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ProfileSection({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <Card title="Profile" icon="person">
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <dt className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Name</dt>
          <dd className="mt-1 font-body-md text-body-md text-on-surface">{name}</dd>
        </div>
        <div>
          <dt className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Email</dt>
          <dd className="mt-1 font-body-md text-body-md text-on-surface">{email}</dd>
        </div>
        <div>
          <dt className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Role</dt>
          <dd className="mt-1 font-body-md text-body-md text-on-surface">{role === "ADMIN" ? "Administrator" : role}</dd>
        </div>
      </dl>
      <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">
        Name and email are managed by another administrator from the Admin Dashboard&apos;s Team settings — not editable here.
      </p>
    </Card>
  );
}

function SecuritySection({ onSignOut }: { onSignOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiPatch<void>("/auth/password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Security" icon="shield">
      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
        <Field label="Current Password">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="New Password" hint="At least 8 characters.">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Confirm New Password">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {confirmPassword.length > 0 && confirmPassword !== newPassword && (
            <p className="mt-1 font-body-sm text-body-sm text-error">Passwords don&apos;t match.</p>
          )}
        </Field>

        {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
        {success && <p className="font-body-sm text-body-sm text-primary">Password changed.</p>}

        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="flex w-max items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Changing…" : "Change Password"}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between border-t border-outline-variant pt-5">
        <div>
          <p className="font-body-md text-body-md text-on-surface">Sign out of this session</p>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            Clears the credential stored on this machine — you&apos;ll need to sign in again to reopen the app.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:border-error hover:text-error"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Sign Out
        </button>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span>}
    </label>
  );
}

function NotificationsSection({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, refetch } = useFetch<ApiAdminNotificationSettings>(
    () => apiGet<ApiAdminNotificationSettings>("/admin/notification-settings"),
    [],
  );
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (!data || !canWrite) return;
    setSaving(true);
    try {
      await apiPut<ApiAdminNotificationSettings>("/admin/notification-settings", { chatEnabled: !data.chatEnabled });
      refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Notifications" icon="notifications">
      {loading && <LoadingState label="Loading notification settings…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body-md text-body-md text-on-surface">Chat message alerts</p>
            <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
              Notify administrators (push + Telegram) when a new client chat message arrives.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.chatEnabled}
            onClick={toggle}
            disabled={!canWrite || saving}
            title={canWrite ? undefined : "Requires Settings (write) access"}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              data.chatEnabled ? "bg-primary" : "bg-surface-container-high"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface-container-lowest shadow transition-transform ${
                data.chatEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      )}
    </Card>
  );
}

function PermissionsSection({ permissions }: { permissions: string[] }) {
  return (
    <Card title="Desktop Permissions" icon="admin_panel_settings">
      <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">
        Modules granted to your account. Read-only here — ask another administrator to change access from the Admin
        Dashboard&apos;s Team settings.
      </p>
      {permissions.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">No modules granted.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {DESKTOP_PERMISSIONS.filter((p) => hasPermission(permissions, p)).map((p) => (
            <span
              key={p}
              className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3 py-1 font-label-md text-label-md text-on-surface"
            >
              <span className="material-symbols-outlined text-[14px] text-primary">check_circle</span>
              {PERMISSION_LABELS[p]}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function ApplicationSection() {
  return (
    <Card title="Application" icon="info">
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <dt className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Version</dt>
          <dd className="mt-1 font-mono-data text-mono-data text-on-surface">{APP_VERSION}</dd>
        </div>
        <div>
          <dt className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">API Endpoint</dt>
          <dd className="mt-1 font-mono-data text-mono-data text-on-surface">{API_BASE_URL}</dd>
        </div>
      </dl>
    </Card>
  );
}
