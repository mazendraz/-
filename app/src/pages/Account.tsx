import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import PersonalTabs from "../components/PersonalTabs";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { usePageMeta } from "../hooks/usePageMeta";
import {
  deleteAccount,
  fetchSessions,
  revokeSessions,
  useCustomerAuth,
  type CustomerSession,
} from "../lib/customerAuth";

/**
 * The customer's account: who they are, which devices can get in, and the way
 * out.
 *
 * The delete path is here because Apple requires an account that can be created
 * in the app to be deletable in the app (guideline 5.1.1(v)) — a support email
 * does not satisfy it. Building it on the web first means the mobile screen is
 * a port of something already working rather than something invented under
 * review pressure.
 */
export default function Account() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { customer, loading } = useCustomerAuth();

  const [sessions, setSessions] = useState<CustomerSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");
  const [error, setError] = useState("");

  usePageMeta(t(locale, "account_title"), t(locale, "account_meta_desc"));

  useEffect(() => {
    if (!loading && !customer) navigate("/signin?next=/account", { replace: true });
  }, [loading, customer, navigate]);

  useEffect(() => {
    if (!customer) return;
    let active = true;
    fetchSessions()
      .then((rows) => active && setSessions(rows))
      .catch(() => active && setSessions([]));
    return () => {
      active = false;
    };
  }, [customer]);

  if (loading || !customer) return null;

  async function onRevoke(sessionId?: string) {
    setBusy(true);
    setError("");
    try {
      await revokeSessions(sessionId);
      setSessions(await fetchSessions());
      // Revoking everything includes the session this page is running on, but
      // the access token in the cookie outlives it — so send them to sign in
      // rather than leave a page that looks signed in and isn't.
      if (!sessionId) navigate("/signin", { replace: true });
    } catch {
      setError(t(locale, "account_err_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteAccount(typedEmail);
      navigate("/?deleted=1", { replace: true });
    } catch {
      setError(t(locale, "account_delete_mismatch"));
      setBusy(false);
    }
  }

  const emailMatches = typedEmail.trim().toLowerCase() === customer.email.toLowerCase();

  return (
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-5">
        <PersonalTabs active="account" />

        <div className="mb-6">
          <h1 className="font-black text-headline md:text-display text-on-surface tracking-tight mb-2">
            {t(locale, "account_title")}
          </h1>
          <p className="text-label text-outline">{t(locale, "account_sub")}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 bg-error-container text-on-error-container rounded-xl px-4 py-3 text-label font-medium flex items-center gap-2"
          >
            <Icon name="error" className="text-subhead" />
            {error}
          </div>
        )}

        {/* ── Profile ───────────────────────────────────────────────────────── */}
        <section className="bg-surface-container-lowest rounded-2xl shadow-bloom p-5 mb-5">
          <div className="flex items-center gap-4">
            {customer.avatarUrl ? (
              // Google serves avatars only when the referrer isn't leaked.
              <img
                src={customer.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover"
                width={56}
                height={56}
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-title">
                {customer.name.trim().charAt(0) || "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-body text-on-surface truncate">{customer.name}</p>
              {/* dir=ltr: an email is a Latin string and its dots and @ reorder
                  into nonsense under the page's RTL direction. */}
              <p className="text-label text-outline truncate" dir="ltr">
                {customer.email}
              </p>
            </div>
          </div>
        </section>

        {/* ── Devices ───────────────────────────────────────────────────────── */}
        <section className="bg-surface-container-lowest rounded-2xl shadow-bloom p-5 mb-5">
          <h2 className="font-bold text-body text-on-surface mb-1">
            {t(locale, "account_devices_title")}
          </h2>
          <p className="text-label text-outline mb-4">{t(locale, "account_devices_sub")}</p>

          {sessions === null ? (
            <div className="h-14 rounded-xl bg-surface-container animate-pulse" />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon="devices"
              title={t(locale, "account_devices_none_title")}
              msg={t(locale, "account_devices_none_sub")}
              className="py-6"
            />
          ) : (
            <>
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3"
                  >
                    <Icon
                      name={s.platform === "ios" || s.platform === "android" ? "smartphone" : "computer"}
                      className="text-title text-outline"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-label font-bold text-on-surface truncate">
                        {s.deviceName || t(locale, "account_device_unknown")}
                      </p>
                      <p className="text-caption text-outline">
                        {t(locale, "account_device_last_used")}{" "}
                        {new Date(s.lastUsedAt).toLocaleDateString(
                          locale === "ar" ? "ar-EG" : "en-US",
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => onRevoke(s.id)}
                      disabled={busy}
                      className="text-label font-bold text-error hover:underline disabled:opacity-60"
                    >
                      {t(locale, "account_device_revoke")}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onRevoke()}
                disabled={busy}
                className="mt-4 text-label font-bold text-error hover:underline disabled:opacity-60"
              >
                {t(locale, "account_devices_revoke_all")}
              </button>
            </>
          )}
        </section>

        {/* ── Delete ────────────────────────────────────────────────────────── */}
        <section className="bg-surface-container-lowest rounded-2xl shadow-bloom p-5 border border-error/20">
          <h2 className="font-bold text-body text-error mb-1">
            {t(locale, "account_delete_title")}
          </h2>
          {/* Said before the button, not after: what stays behind is the part
              people are surprised by, and a promise we can't keep would be
              worse than the honest version. */}
          <p className="text-label text-outline mb-4 leading-relaxed">
            {t(locale, "account_delete_explain")}
          </p>
          <button
            onClick={() => {
              setTypedEmail("");
              setError("");
              setConfirmDelete(true);
            }}
            className="bg-error text-on-error px-5 py-2.5 rounded-xl font-bold text-label hover:opacity-90 transition-opacity btn-press"
          >
            {t(locale, "account_delete_button")}
          </button>
        </section>
      </div>

      {confirmDelete && (
      <Modal
        onClose={() => setConfirmDelete(false)}
        title={t(locale, "account_delete_title")}
      >
        <div className="space-y-4">
          <p className="text-label text-on-surface-variant leading-relaxed">
            {t(locale, "account_delete_explain")}
          </p>
          <label className="block">
            <span className="text-caption font-bold text-on-surface-variant mb-1.5 block">
              {t(locale, "account_delete_confirm_label")}
            </span>
            <input
              type="email"
              dir="ltr"
              autoComplete="off"
              className="field-input"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              placeholder={customer.email}
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={onDelete}
              // Gated on an exact match client-side too, so the destructive
              // button is not even pressable until the intent is unambiguous.
              disabled={busy || !emailMatches}
              className="flex-1 bg-error text-on-error py-3 rounded-xl font-bold text-label disabled:opacity-50 disabled:cursor-not-allowed btn-press"
            >
              {t(locale, busy ? "account_deleting" : "account_delete_confirm")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="flex-1 bg-surface-container text-on-surface py-3 rounded-xl font-bold text-label"
            >
              {t(locale, "account_cancel")}
            </button>
          </div>
        </div>
      </Modal>
      )}
    </div>
  );
}
