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
 *
 * `compact` drops the signed-out label and leaves the icon alone. The mobile bar
 * centres its logo absolutely, so the icon row on the far side is free to grow
 * straight over it — and the labelled pill was wide enough to do exactly that,
 * beside search and saved on a 360px screen.
 */
export default function AccountButton({ onDark, compact = false }: { onDark: boolean; compact?: boolean }) {
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
  if (loading) return <div className={compact ? "w-10 h-10" : "w-11 h-11"} aria-hidden="true" />;

  if (!customer) {
    // Come back to where they were, not to the home page — signing in is almost
    // always something you do on the way to something else.
    const next = encodeURIComponent(`${pathname}${search}`);
    const label = t(locale, "account_sign_in");
    return (
      <Link
        to={`/signin?next=${next}`}
        // The compact form is icon-only, so it carries the label for assistive
        // tech instead of showing it.
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        className={`flex items-center justify-center transition-colors duration-base
          ${compact
            ? "w-10 h-10 rounded-full touch-press"
            : "gap-1.5 px-3 py-2 rounded-full text-label font-semibold"}
          ${onDark
            ? "text-white/80 hover:text-white hover:bg-white/12"
            : "text-on-surface-variant hover:text-primary hover:bg-primary/8"}`}
      >
        <Icon name="account_circle" className={compact ? "text-title" : "text-subhead"} />
        {!compact && label}
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
        className={`group flex items-center gap-0.5 pe-1.5 rounded-full touch-press transition-colors duration-base
          ${open ? (onDark ? "bg-white/10" : "bg-on-surface/5") : ""}`}
      >
        {/* Glass halo — a hair of backdrop-blurred tint plus a 1px translucent
            white ring is what separates the photo from the bar (esp. the blue
            hero state) instead of the old hard ring sitting flush on the crop. */}
        <span
          className={`relative flex items-center justify-center w-11 h-11 rounded-full p-[3px] backdrop-blur-md
            transition-all duration-[220ms] ease-out group-hover:scale-[1.05] group-hover:brightness-110
            ${onDark
              ? "bg-white/10 border border-white/40 shadow-[0_2px_14px_-2px_rgba(0,10,25,0.45)] group-hover:border-white/65 group-hover:shadow-[0_4px_18px_-2px_rgba(0,10,25,0.55)]"
              : "bg-white/60 border border-white/80 shadow-[0_2px_10px_-2px_rgba(0,60,90,0.18)] group-hover:border-white group-hover:shadow-[0_4px_14px_-2px_rgba(0,60,90,0.24)]"
            }`}
        >
          <span className="w-full h-full rounded-full overflow-hidden">
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
              <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold text-label">
                {initial}
              </span>
            )}
          </span>
        </span>

        <Icon
          name="expand_more"
          className={`text-label transition-transform duration-[220ms] ease-out ${open ? "rotate-180" : ""}
            ${onDark ? "text-white/70 group-hover:text-white" : "text-on-surface-variant/60 group-hover:text-primary"}`}
        />
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
          {/* The only route to the devices list and to account deletion — a
              page nothing links to is a page nobody finds, and Apple's reviewer
              is one of the people who has to find it. */}
          <Link
            to="/account"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-label text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <Icon name="manage_accounts" className="text-subhead text-outline" />
            {t(locale, "account_title")}
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
