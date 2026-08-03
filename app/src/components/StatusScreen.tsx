import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useSettings, type MaintenanceStatus } from "../lib/settings";
import Logo from "./Logo";
import Icon from "./Icon";

/**
 * Full-screen status for the two cases where the app itself is healthy:
 *   • `maintenance` — an admin took the public site down on purpose
 *   • `offline`     — the backend is unreachable (see useBackendHealth)
 *
 * The third case, a React crash, is deliberately NOT handled here — it lives in
 * CrashScreen.tsx with zero dependencies, because this component uses
 * LocaleContext and the settings store, either of which could be what crashed.
 */
export type StatusVariant = "maintenance" | "offline";

/** Split a duration into d/h/m/s, flooring at zero. */
function breakdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Live "back in 2h 14m" countdown. Renders nothing once the ETA has passed. */
function Countdown({ eta }: { eta: number }) {
  const { locale } = useLocale();
  const [remaining, setRemaining] = useState(() => eta - Date.now());

  useEffect(() => {
    // 1s tick only while a countdown is actually on screen — it unmounts with the
    // screen, so this never runs on the live site.
    const id = setInterval(() => setRemaining(eta - Date.now()), 1000);
    return () => clearInterval(id);
  }, [eta]);

  // Past the ETA the honest thing is "any moment now", not a negative timer or a
  // frozen 00:00 that makes the site look abandoned.
  if (remaining <= 0) {
    return (
      <p className="text-label font-bold text-primary">{t(locale, "status_back_soon")}</p>
    );
  }

  const { days, hours, minutes, seconds } = breakdown(remaining);
  const parts: [number, string][] = [];
  if (days > 0) parts.push([days, t(locale, "status_days")]);
  if (days > 0 || hours > 0) parts.push([hours, t(locale, "status_hours")]);
  parts.push([minutes, t(locale, "status_minutes")]);
  if (days === 0 && hours === 0) parts.push([seconds, t(locale, "status_seconds")]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="text-caption font-bold text-outline ltr:uppercase ltr:tracking-wide">
        {t(locale, "status_back_in")}
      </p>
      {/* Logical order: flex-row follows `dir`, so this reads correctly in RTL. */}
      <div className="flex items-center gap-2">
        {parts.map(([value, unit], i) => (
          <div key={i} className="flex items-baseline gap-0.5">
            <span className="font-display font-black text-headline text-on-surface tabular-nums">
              {String(value).padStart(2, "0")}
            </span>
            <span className="text-caption font-bold text-outline">{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Decorative illustration. `motion-safe:` keeps the pulse off for anyone who has
 * asked their OS to reduce motion — a full-screen looping animation is exactly
 * the kind of thing that triggers vestibular discomfort.
 */
function Illustration({ variant }: { variant: StatusVariant }) {
  return (
    <div className="relative w-28 h-28 mx-auto mb-7" aria-hidden>
      <div className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping" />
      <div className="absolute inset-2 rounded-full bg-primary/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="material-symbols-outlined text-primary text-[46px] motion-safe:animate-pulse"
          style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no"
        >
          {variant === "maintenance" ? "construction" : "cloud_off"}
        </span>
      </div>
    </div>
  );
}

export default function StatusScreen({ variant, status }: {
  variant: StatusVariant;
  /** Admin-authored copy; only meaningful for `maintenance`. */
  status?: MaintenanceStatus;
}) {
  const { locale } = useLocale();
  const settings = useSettings();

  const isMaintenance = variant === "maintenance";
  // Admin-authored copy wins; blank falls back to the localized default so the
  // screen is never empty just because nobody filled the form in.
  const authoredTitle = locale === "ar" ? status?.title_ar : status?.title_en;
  const authoredMsg = locale === "ar" ? status?.message_ar : status?.message_en;

  const title = (isMaintenance && authoredTitle?.trim())
    || t(locale, isMaintenance ? "status_maintenance_title" : "status_offline_title");
  const message = (isMaintenance && authoredMsg?.trim())
    || t(locale, isMaintenance ? "status_maintenance_msg" : "status_offline_msg");

  const contact = settings.support_email?.trim();

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <Logo className="h-16 w-16 object-contain rounded-xl mx-auto mb-8" width={64} height={64} />

        <Illustration variant={variant} />

        <h1 className="font-display font-black text-headline md:text-headline text-on-surface mb-3 leading-tight">
          {title}
        </h1>
        <p className="text-body text-on-surface-variant leading-relaxed mb-7">{message}</p>

        {isMaintenance && status?.eta != null && (
          <div className="mb-7">
            <Countdown eta={status.eta} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press"
          >
            <Icon name="refresh" className="text-subhead" />
            {t(locale, isMaintenance ? "status_reload" : "status_retry")}
          </button>
          {contact && (
            <a
              href={`mailto:${contact}`}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-label text-on-surface border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
            >
              <Icon name="mail" className="text-subhead" />
              {t(locale, "status_contact")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
