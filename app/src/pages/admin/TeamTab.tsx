import { useState, useEffect } from "react";
import {
  canManageUsers, createUser, updateUser, deleteUser,
  type AdminUser, type Role,
} from "../../lib/users";
import { type Company } from "../../lib/catalog";
import SearchInput from "../../components/SearchInput";
import Pagination from "../../components/Pagination";
import { useServerSearch } from "../../hooks/useServerSearch";
import { LField } from "./components/ModalShell";
import Modal from "../../components/Modal";
import { ConfirmDelete } from "./components/confirm";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t, tCount, type StringKey } from "../../lib/i18n";
import Icon from "../../components/Icon";
import Select from "../../components/Select";

// Role is an API value; only its label is translated.
const ROLE_BADGE_KEYS: Record<Role, StringKey> = {
  ADMIN: "admin_role_badge_admin",
  PROVIDER: "admin_role_badge_provider",
};

// ══════════════════════════════════════════════════════════════════════════
//  TEAM — login accounts (ADMIN + PROVIDER). API-only; no localStorage analog.
// ══════════════════════════════════════════════════════════════════════════
export function TeamTab({ companies, initialCompanyId, onConsumeInitial }: {
  companies: Company[];
  initialCompanyId?: string | null;
  onConsumeInitial?: () => void;
}) {
  const { locale } = useLocale();
  const [editing, setEditing] = useState<{ user: AdminUser | null; companyId?: string } | null>(null);
  const [query, setQuery] = useState("");
  // Accounts live only on the server — search/paginate the COMPLETE set there
  // (no localStorage analog, so no demo fallback). Must run before the early
  // return below (rules of hooks).
  const userSearch = useServerSearch<AdminUser>(
    "/admin/users",
    query,
    {},
    { pageSize: 12, enabled: canManageUsers() },
  );

  // Deep-link from a company card: open a new-user editor pre-linked to it.
  useEffect(() => {
    if (initialCompanyId && canManageUsers()) {
      setEditing({ user: null, companyId: initialCompanyId });
      onConsumeInitial?.();
    }
  }, [initialCompanyId, onConsumeInitial]);

  // Accounts live only on the server — they can't be managed in demo mode.
  if (!canManageUsers()) {
    return (
      <div className="max-w-lg mx-auto mt-6 bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <Icon name="badge" className="text-headline" />
        </div>
        <h2 className="font-bold text-subhead text-on-surface mb-1.5">{t(locale, "admin_team_need_api_title")}</h2>
        <p className="text-label text-outline leading-relaxed">
          {t(locale, "admin_team_need_api_a")}{" "}
          (<span className="font-mono text-label">VITE_API_URL</span>){" "}
          {t(locale, "admin_team_need_api_b")}
        </p>
      </div>
    );
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-body text-on-surface">{t(locale, "admin_team_title")}</h2>
          <p className="text-caption text-outline mt-0.5">
            {t(locale, "admin_team_subtitle")}
          </p>
        </div>
        <button onClick={() => setEditing({ user: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press">
          <Icon name="person_add" className="text-subhead" /> {t(locale, "admin_team_add")}
        </button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "admin_team_search")} />

      {userSearch.loading && userSearch.data.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-label text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "admin_team_loading")}
        </div>
      )}
      {userSearch.error && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={t(locale, "admin_team_load_error")} icon="cloud_off" />
        </div>
      )}
      {!userSearch.loading && !userSearch.error && userSearch.data.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={t(locale, hasQuery ? "admin_team_none_search" : "admin_team_none")} icon="badge" />
        </div>
      )}

      {userSearch.data.length > 0 && (
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity ${userSearch.loading ? "opacity-60 pointer-events-none" : ""}`}
          aria-busy={userSearch.loading}
        >
          {userSearch.data.map((u) => (
            <div key={u.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-body flex-shrink-0
                ${u.role === "ADMIN" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-body text-on-surface truncate">{u.name}</p>
                  <span className={`text-caption font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                    ${u.role === "ADMIN" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>{t(locale, ROLE_BADGE_KEYS[u.role])}</span>
                  {!u.isActive && <span className="text-caption font-bold px-1.5 py-0.5 rounded-full bg-surface-container text-outline flex-shrink-0">{t(locale, "admin_inactive")}</span>}
                </div>
                <p className="text-caption text-outline truncate">{u.email}</p>
                <p className="text-caption text-outline mt-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{u.companyName ? "business" : "block"}</span>
                  {u.companyName ?? t(locale, "admin_team_no_company")}
                </p>
              </div>
              <button onClick={() => setEditing({ user: u })}
                className="flex items-center gap-1 bg-surface-container px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0">
                <Icon name="edit" className="text-label" /> {t(locale, "admin_team_manage")}
              </button>
            </div>
          ))}
        </div>
      )}

      <Pagination page={userSearch.page} pageCount={userSearch.pageCount} total={userSearch.total} pageSize={userSearch.pageSize} onPage={userSearch.setPage} nounKey="noun_account" />

      {editing && (
        <UserEditor
          user={editing.user}
          initialCompanyId={editing.companyId}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); userSearch.refresh(); }}
        />
      )}
    </div>
  );
}

export function UserEditor({ user, initialCompanyId, companies, onClose, onSaved }: {
  user: AdminUser | null;
  initialCompanyId?: string;
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const isNew = !user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "PROVIDER");
  const [companyId, setCompanyId] = useState(user?.companyId ?? initialCompanyId ?? "");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (name.trim().length < 2) { setError(t(locale, "admin_user_name_min")); return; }
    if (isNew && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError(t(locale, "admin_user_email_invalid")); return; }
    // Mirrors MIN_PASSWORD_LENGTH in api/src/lib/validation/password.ts. This is a
    // UX pre-check only — the server rejects short AND common passwords, and its
    // answer is the one that counts.
    if (isNew && password.length < 12) { setError(t(locale, "admin_user_password_min")); return; }
    if (!isNew && password && password.length < 12) { setError(t(locale, "admin_user_password_min")); return; }

    setBusy(true);
    try {
      if (isNew) {
        await createUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          companyId: companyId || null,
        });
      } else {
        await updateUser(user!.id, {
          name: name.trim(),
          role,
          companyId: companyId || null,
          isActive,
          ...(password ? { password } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "admin_user_save_failed"));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteUser(user!.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "admin_user_delete_failed"));
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? t(locale, "admin_team_add") : `${t(locale, "admin_team_manage")} — ${user!.name}`} onClose={onClose}>
      <div className="p-5">
      <div className="space-y-4">
        <LField label={t(locale, "admin_user_full_name")} required>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t(locale, "admin_user_name_ph")} />
        </LField>

        <LField label={t(locale, "admin_user_email")} required>
          <input className="field-input disabled:opacity-60" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={!isNew}
            placeholder={t(locale, "admin_user_email_ph")} autoComplete="off" />
          {!isNew && <p className="text-caption text-outline mt-1">{t(locale, "admin_user_email_locked")}</p>}
        </LField>

        <LField label={t(locale, isNew ? "admin_user_password" : "admin_user_reset_password")} required={isNew}>
          <input className="field-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(locale, isNew ? "admin_user_password_ph_new" : "admin_user_password_ph_edit")}
            autoComplete="new-password" />
        </LField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LField label={t(locale, "admin_user_role")}>
            <Select
              value={role}
              onChange={(v) => setRole(v as Role)}
              options={[
                { value: "PROVIDER", label: t(locale, "admin_role_provider") },
                { value: "ADMIN", label: t(locale, "admin_role_admin") },
              ]}
            />
          </LField>
          <LField label={t(locale, "admin_user_company")}>
            <Select
              value={companyId}
              onChange={setCompanyId}
              placeholder={t(locale, "admin_user_company_none")}
              options={[
                { value: "", label: t(locale, "admin_user_company_none") },
                ...companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </LField>
        </div>
        {role === "PROVIDER" && !companyId && (
          <p className="text-caption text-secondary bg-secondary/10 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <Icon name="info" className="text-body" />
            {t(locale, "admin_user_provider_warning")}
          </p>
        )}

        {!isNew && (
          <label className="flex items-center gap-3 bg-surface-container rounded-xl p-3.5 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div>
              <p className="font-bold text-label text-on-surface">{t(locale, "admin_user_active")}</p>
              <p className="text-caption text-outline">{t(locale, "admin_user_active_hint")}</p>
            </div>
          </label>
        )}

        {error && <p className="text-label text-error font-medium bg-error/8 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-outline-variant/20">
        {!isNew ? <ConfirmDelete onConfirm={remove} label={t(locale, "admin_noun_user")} big /> : <span />}
        <div className="flex gap-2.5 ms-auto">
          <button onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">{t(locale, "admin_confirm_cancel")}</button>
          <button onClick={save} disabled={busy} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60">
            {t(locale, busy ? "admin_saving" : isNew ? "admin_user_create" : "admin_user_save")}
          </button>
        </div>
      </div>
      </div>
    </Modal>
  );
}
