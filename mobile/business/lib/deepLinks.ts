/**
 * Push-payload URL → this app's actual route.
 *
 * api's push payloads still name WEB DASHBOARD paths — `/provider`,
 * `/provider?tab=messages`, `/admin`, `/admin?tab=chat` (see
 * leads.service.ts and chat.service.ts's notifyCompanyProviders/pushAdmins
 * calls) — because the same payloads also reach browsers via Web Push, and
 * changing them would mean touching a payload two very different clients
 * both read. None of those paths exist as native routes in this app, so a
 * tap on a notification calling `router.push(rawUrl)` directly would land on
 * expo-router's not-found screen. This is the one place that translation
 * happens — see @alassema/mobile-shared's push.ts, which calls
 * `config.mapNotificationUrl` (wired in index.ts) before ever navigating.
 *
 * Never call router.push with an unmapped path — everything not explicitly
 * listed here falls through to "/", which is app/index.tsx's own
 * <Redirect> to whichever tab group the signed-in role actually has. That
 * redirect needs no role information passed in (this function has none to
 * give it), which is exactly why "/" is the correct universal fallback
 * rather than guessing a role-specific route here.
 */
const ROUTES: Record<string, string> = {
  "/provider": "/(provider)/overview",
  "/provider?tab=messages": "/(provider)/messages",
  "/admin": "/(admin)/overview",
  "/admin?tab=chat": "/(admin)/messages",
};

export function mapNotificationUrl(url: string): string {
  return ROUTES[url] ?? "/";
}
