import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/app-version → what the apps must do before they can be trusted.
 *
 * ── Why this endpoint exists at all ─────────────────────────────────────────
 * The website can be fixed by deploying. A published app cannot: whatever build
 * someone installed keeps running until THEY choose to update, and a fraction
 * of users never do. So every mobile product needs one lever it can pull
 * server-side — "this build can no longer talk to us" — and it has to exist
 * from the first release, because it cannot be added to builds already out
 * there. That is the whole reason this is in phase 0 and not later.
 *
 * Two thresholds, deliberately:
 *   minimum   — below this the app BLOCKS and shows an update screen. Reserved
 *               for a broken contract or a security fix, not for tidiness.
 *   latest    — below this the app may suggest updating, dismissibly.
 *
 * Read from env so pulling the lever is a config change and a restart, not a
 * deploy: the moment you need this, you need it now.
 *
 * Kept OUT of the /api/v1 contract freeze in spirit — this response shape must
 * never change incompatibly, since the build that most needs to read it is the
 * oldest one running.
 */
export const GET = withErrors(async () =>
  ok(
    {
      // Semver strings, compared by the client. Defaults let every build
      // through: an unset env must never lock anyone out by accident.
      minimum: process.env.APP_MIN_VERSION ?? "0.0.0",
      latest: process.env.APP_LATEST_VERSION ?? "0.0.0",
      // Shown on the blocking screen. Store URLs live here rather than in the
      // app so a changed listing doesn't need a release to fix.
      iosUrl: process.env.APP_IOS_URL ?? null,
      androidUrl: process.env.APP_ANDROID_URL ?? null,
      // Optional operator note ("update required — sign-in has changed").
      message: process.env.APP_UPDATE_MESSAGE ?? null,
    },
    200,
    // Short, not none: the apps call this on launch, and a CDN holding it for
    // an hour would blunt exactly the emergency it exists for.
    { "Cache-Control": "public, max-age=60" },
  ),
);
