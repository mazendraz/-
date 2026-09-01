/**
 * Sentry wiring — phase 13 (Hardening) of the Business App plan. Shared here
 * rather than duplicated per app because the scrubbing rule and the
 * init/tag/capture shape are identical between the two; only the DSN, the
 * `app` tag, and the `role` each app tags with differ, and those are passed
 * in by the caller.
 *
 * Deliberately DSN-gated, not env-gated: `initErrorReporting` is always
 * called at each app's startup, but does nothing until a real
 * EXPO_PUBLIC_SENTRY_DSN is supplied (see each app's .env.example) — no
 * events are captured or sent, and no network call is made, while unset.
 *
 * `Sentry.captureException` belongs behind `reportError` here, called from
 * each app's `ErrorBoundary` export in app/_layout.tsx — NOT inside
 * CrashScreen.tsx, which stays dependency-free by design (see its own header
 * comment). This keeps the crash screen renderable even if Sentry itself is
 * what's broken.
 */
import * as Sentry from "@sentry/react-native";

// Keys whose VALUE must never leave the device, regardless of which object
// they show up on: auth material, and the categories of business data phase
// 13's plan calls out by name — phone numbers and financial figures. Checked
// against the key, not the value, so this catches nested/renamed copies of
// the same field without needing to enumerate every DTO shape that carries
// one.
const SENSITIVE_KEY_PATTERN =
  /token|password|secret|authorization|cookie|phone|whatsapp|amount|price|cost|revenue|commission|balance|salary|income|budget/i;

function scrub(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[scrubbed]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  return { ...breadcrumb, data: scrub(breadcrumb.data) as Sentry.Breadcrumb["data"] };
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.data) {
    event.request = { ...event.request, data: scrub(event.request.data) };
  }
  if (event.extra) event.extra = scrub(event.extra) as Sentry.ErrorEvent["extra"];
  if (event.contexts) event.contexts = scrub(event.contexts) as Sentry.ErrorEvent["contexts"];
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return event;
}

let enabled = false;

export interface ErrorReportingOptions {
  /** EXPO_PUBLIC_SENTRY_DSN. Unset (undefined or "") leaves reporting fully off. */
  dsn: string | undefined;
  /** Which app this is — becomes the `app` tag on every event. */
  app: "client" | "business";
  /** This build's own version (currentAppVersion()) — becomes the `appVersion` tag. */
  appVersion: string;
}

/** Call once at app startup, alongside ensureRTL(). No-ops when dsn is unset. */
export function initErrorReporting({ dsn, app, appVersion }: ErrorReportingOptions): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Errors only — no performance tracing. This is a crash/error net, not
    // an APM rollout, and tracing would mean deciding a whole separate
    // sampling/PII posture that phase 13 never asked for.
    tracesSampleRate: 0,
    // Never let the SDK's own defaults (device IP, etc.) attach anything
    // beyond what scrubEvent explicitly lets through.
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  Sentry.setTag("app", app);
  Sentry.setTag("appVersion", appVersion);
  enabled = true;
}

/** Tag subsequent events with who's signed in. Call whenever it changes
 *  (sign-in, sign-out, role change) — mirrors setAuthSubject's call sites in
 *  session.ts. A no-op until initErrorReporting has actually turned reporting on. */
export function setReportingRole(role: string | null): void {
  if (!enabled) return;
  Sentry.setTag("role", role ?? "signed-out");
}

/** Report an error already being shown via CrashScreen. A no-op until
 *  initErrorReporting has turned reporting on — safe to call unconditionally
 *  from every ErrorBoundary regardless of whether a DSN is configured. */
export function reportError(error: unknown): void {
  if (!enabled) return;
  Sentry.captureException(error);
}
