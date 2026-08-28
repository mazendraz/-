/**
 * Seasonal marketing campaigns — a plain config list, not a database table.
 *
 * There is no admin UI to manage campaigns (not asked for, and this file is
 * the minimum infrastructure that actually satisfies "add support for
 * seasonal campaigns": add an entry, redeploy. Every rule that applies to
 * any other marketing send — opt-in, the 14-day cap, the Cairo send window,
 * open-lead suppression, unsubscribe — applies here too, enforced the same
 * way, by notifications.reengagement.service.ts's sweepSeasonalCampaigns
 * routing every send through notifyCustomerMarketing. Nothing here is
 * mandatory: an empty or fully-disabled list makes the sweep step a no-op.
 *
 * `key` must stay stable once a campaign has gone out — it's embedded in the
 * campaign's CTA url as a query param, which is how the per-customer,
 * per-campaign send is deduplicated (see the sweep's own comment): the same
 * key next year is a NEW campaign as far as dedup is concerned only if the
 * url differs (e.g. bump a `?y=2027`), which is why `key` and `ctaUrl` are
 * versioned together below.
 */
export interface SeasonalCampaign {
  key: string;
  enabled: boolean;
  title: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  /** Inclusive UTC date range the campaign is eligible to send within. */
  startsAt: Date;
  endsAt: Date;
}

export const SEASONAL_CAMPAIGNS: SeasonalCampaign[] = [
  {
    // CTA points at the general services list, not a guessed category slug —
    // the exact category an admin has set up for AC/HVAC maintenance (if any)
    // varies per deployment and is admin-editable, so hardcoding one here
    // would risk a 404 the moment it's renamed. `/services` always exists.
    key: "summer-ac-2026",
    enabled: true,
    title: "صيانة التكييف قبل الزحمة",
    body: "شركات الصيانة بتتزحم في أشهر الصيف. اطلب صيانة أو تركيب تكييف دلوقتي واستقبل عروض من شركات موثّقة بسعر أهدى.",
    ctaUrl: "/services?campaign=summer-ac-2026",
    ctaLabel: "اطلب صيانة تكييف",
    startsAt: new Date("2026-06-01T00:00:00Z"),
    endsAt: new Date("2026-09-15T23:59:59Z"),
  },
];

/** Campaigns currently inside their active window. */
export function activeSeasonalCampaigns(now: Date = new Date()): SeasonalCampaign[] {
  return SEASONAL_CAMPAIGNS.filter((c) => c.enabled && c.startsAt <= now && now <= c.endsAt);
}
