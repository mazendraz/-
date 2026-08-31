import { Redirect } from "expo-router";
import { useStaffAuth } from "../lib/staffAuth";
import { isAdmin } from "../lib/permissions";

/**
 * The app's true entry route. Every cold start (and every deep link with no
 * more specific path) lands here first, and this is the ONE place that
 * decides sign-in vs. a role's tab group — everything downstream (sign-in.tsx
 * bouncing an already-signed-in user away, each tab group's own _layout.tsx
 * bouncing the wrong role away) is a consistency guard, not a second source
 * of truth.
 *
 * A plain `<Redirect>`, not a manually-rendered screen component: this keeps
 * routing entirely inside expo-router's own navigation state, so back
 * button / deep-linking behave normally instead of the app tree being
 * swapped out from under the router (see app/_layout.tsx's comment on the
 * same point).
 */
export default function Index() {
  const { user } = useStaffAuth();

  if (!user) return <Redirect href="/sign-in" />;

  // Strict role branch, not a fallback chain — see lib/permissions.ts's
  // header comment: an ADMIN 403s on every /provider/* route and vice versa,
  // so there is no "default" tab group a role can fall back into.
  return <Redirect href={isAdmin(user) ? "/(admin)/overview" : "/(provider)/overview"} />;
}
