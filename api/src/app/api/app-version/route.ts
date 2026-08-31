import type { NextRequest } from "next/server";
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
 *
 * ── Two apps, two independent kill switches (phase 4's B5) ──────────────────
 * `?app=business` reads the `_BUSINESS`-suffixed env vars instead — a
 * completely separate set, not a fallback chain onto the client's own values.
 * The two apps ship unrelated version numbers (mobile/client is at 1.0.0;
 * the Business App restarts its own numbering from scratch), so blocking the
 * business app on the CLIENT's threshold — or vice versa — would compare two
 * numbers that were never meant to be compared and could lock one app out
 * over the other's release. Absent (the client's own call, and every build
 * of it already deployed) means exactly today's behavior, unchanged.
 */
export const GET = withErrors(async (request: NextRequest) => {
  const app = request.nextUrl.searchParams.get("app");
  const suffix = app === "business" ? "_BUSINESS" : "";

  return ok(
    {
      // Semver strings, compared by the client. Defaults let every build
      // through: an unset env must never lock anyone out by accident.
      minimum: process.env[`APP_MIN_VERSION${suffix}`] ?? "0.0.0",
      latest: process.env[`APP_LATEST_VERSION${suffix}`] ?? "0.0.0",
      // Shown on the blocking screen. Store URLs live here rather than in the
      // app so a changed listing doesn't need a release to fix.
      iosUrl: process.env[`APP_IOS_URL${suffix}`] ?? null,
      androidUrl: process.env[`APP_ANDROID_URL${suffix}`] ?? null,
      // Optional operator note ("update required — sign-in has changed").
      message: process.env[`APP_UPDATE_MESSAGE${suffix}`] ?? null,
    },
    200,
    // Short, not none: the apps call this on launch, and a CDN holding it for
    // an hour would blunt exactly the emergency it exists for.
    { "Cache-Control": "public, max-age=60" },
  );
});
