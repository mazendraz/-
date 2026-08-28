import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { ForbiddenError } from "@/lib/utils/errors";
import { isValidCronSecret } from "@/lib/utils/cronAuth";
import {
  sweepReviewRequests,
  sweepStaleLeads,
  sweepFirstServiceNudges,
  sweepInactiveBrowsing,
  sweepInactiveCustomers,
  sweepSeasonalCampaigns,
  sweepProviderMonthlySummaries,
} from "@/lib/services/notifications.reengagement.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/notifications-sweep — every time-delayed customer/provider
 * nudge in the product runs from here (see notifications.reengagement
 * .service.ts for what each one does and how it's deduplicated). Nothing in
 * this codebase runs a background process of its own (the API is a single
 * PM2 fork — see ecosystem.config.cjs), so this is meant to be hit by an
 * EXTERNAL clock: a system crontab entry on the VPS running
 *
 *   curl -fsS -X POST https://alassema.com/api/cron/notifications-sweep \
 *     -H "X-Cron-Secret: $CRON_SECRET"
 *
 * every 15–30 minutes.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Every sweep is safe to run twice, overlap with itself, or run after a long
 * gap: review-requests/stale-leads/first-service each have their own *SentAt
 * marker column; inactive-browsing/inactive-customers rely on the shared
 * 14-day marketing cap (see notifications.marketing.service.ts) to throttle
 * repeats since they're ongoing states, not one-time events; seasonal
 * campaigns dedupe against the Notification table itself (has this customer
 * already gotten THIS campaign's url); monthly summaries check
 * Company.lastMonthlySummaryPeriod. Nobody gets double-nudged from a missed
 * tick, a retried request, or two overlapping cron runs.
 *
 * ── Why sequential, not Promise.all ────────────────────────────────────────
 * Same single-PM2-fork constraint as the rate limiter (ecosystem.config.cjs):
 * running every sweep's queries at once would spike DB connection/CPU
 * contention right as the fork is also serving live requests. One tick
 * taking a few extra seconds is free; a request queue backing up isn't.
 *
 * Wrapped in withMaintenance like any other write route: skipping a tick
 * during a deploy window is harmless (the next tick catches up), and it's
 * one less thing writing to the DB mid-migration.
 *
 * Auth is a single shared secret, not withCustomerAuth/adminOnly: the caller
 * is a crontab line, not a signed-in person. Same shape as the Telegram
 * webhook's secret check next door, but timing-safe (safeEqual) since this
 * one guards a route that can SEND things, not just receive them.
 */
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    if (!process.env.CRON_SECRET) {
      console.error("[cron] CRON_SECRET not set — refusing sweep request");
    }
    if (!isValidCronSecret(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
      throw new ForbiddenError("Forbidden");
    }

    const reviewRequests = await sweepReviewRequests();
    const staleLeads = await sweepStaleLeads();
    const firstServiceNudges = await sweepFirstServiceNudges();
    const inactiveBrowsing = await sweepInactiveBrowsing();
    const inactiveCustomers = await sweepInactiveCustomers();
    const seasonalCampaigns = await sweepSeasonalCampaigns();
    const providerMonthlySummaries = await sweepProviderMonthlySummaries();

    return ok({
      reviewRequests,
      staleLeads,
      firstServiceNudges,
      inactiveBrowsing,
      inactiveCustomers,
      seasonalCampaigns,
      providerMonthlySummaries,
    });
  }),
);
