import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { customerLogout, useCustomerAuth } from "../lib/customerAuth";

/**
 * The customer's account control in the top bar — the way into /signin, and the
 * only way back out of a session.
 *
 * Signed out it is a plain "Sign in" link; signed in it is the avatar with a menu.
 * Both states matter: a sign-in page nothing links to is a page nobody finds, and
 * a session with no visible way to end it reads as the site having trapped you.
 */
export default function AccountButton({ onDark }: { onDark: boolean }) {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { customer, loading } = useCustomerAuth();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that only closes by picking
  // something from it is a trap on touch, where there is no "click elsewhere"
  // instinct.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Any navigation closes it.
  useEffect(() => setOpen(false), [pathname]);

  // Reserve the slot while the session is still being checked, so the bar's
  // controls don't jump sideways the moment it resolves.
  if (loading) return <div className="w-10 h-10" aria-hidden="true" />;

  if (!customer) {
    // Come back to where they were, not to the home page — signing in is almost
    // always something you do on the way to something else.
    const next = encodeURIComponent(`${pathname}${search}`);
    return (
      <Link
        to={`/signin?next=${next}`}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-label font-semibold transition-colors duration-base
          ${onDark
            ? "text-white/80 hover:text-white hover:bg-white/12"
            : "text-on-surface-variant hover:text-primary hover:bg-primary/8"}`}
      >
        <Icon name="account_circle" className="text-subhead" />
        {t(locale, "account_sign_in")}
      </Link>
    );
  }

  const initial = customer.name.trim().charAt(0) || "?";

  async function onSignOut() {
    setOpen(false);
    await customerLogout();
    navigate("/", { replace: true });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(locale, "account_menu_aria")}
        className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-base overflow-hidden
          ${onDark ? "ring-1 ring-white/30 hover:ring-white/60" : "ring-1 ring-outline-variant/50 hover:ring-primary/50"}`}
      >
        {customer.avatarUrl ? (
          // referrerPolicy: Google serves avatars only when the referrer isn't
          // leaked; without it lh3.googleusercontent.com answers 403 and every
          // avatar on the site is a broken image.
          <img
            src={customer.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            width={40}
            height={40}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-primary text-on-primary font-bold text-label">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full end-0 mt-2 w-60 bg-surface-container-lowest rounded-2xl shadow-bloom border border-outline-variant/20 py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-outline-variant/15 mb-1">
            <p className="text-label font-bold text-on-surface truncate">{customer.name}</p>
            {/* dir=ltr: an email is a Latin string, and left to the page's RTL
                direction its dots and @ reorder into nonsense. */}
            <p className="text-caption text-outline truncate" dir="ltr">
              {customer.email}
            </p>
          </div>

          <Link
            to="/requests"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-label text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <Icon name="receipt_long" className="text-subhead text-outline" />
            {t(locale, "nav_requests")}
          </Link>
          <Link
            to="/saved"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-label text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <Icon name="favorite" className="text-subhead text-outline" />
            {t(locale, "nav_saved")}
          </Link>

          <button
            onClick={onSignOut}
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-label text-error hover:bg-error/8 transition-colors border-t border-outline-variant/15 mt-1"
          >
            <Icon name="logout" className="text-subhead" />
            {t(locale, "account_sign_out")}
          </button>
        </div>
      )}
    </div>
  );
}
