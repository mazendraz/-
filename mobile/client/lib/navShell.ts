/**
 * The app shell's route map — one place that answers the two questions the
 * persistent navigation UI has to ask on every screen:
 *
 *   1. Which of the five tabs does this route belong to? (so the right tab
 *      stays lit while the customer is three screens deep inside it)
 *   2. Is this route a deliberate full-screen experience? (the only reason
 *      the global chrome is ever allowed to disappear)
 *
 * ── Why this file exists at all ────────────────────────────────────────────
 * Before it, the bottom bar was drawn BY the tab navigator — so it existed
 * only while a tab screen was the top of the stack. Every internal screen
 * (a category, a company profile, a service list, a chat) is a sibling of
 * the `(tabs)` group in the ROOT stack, so pushing one covered the tab
 * navigator entirely and the bar went with it. The bar is now drawn by the
 * root shell instead (components/AppShell.tsx), which has no navigator state
 * to read a "current tab" from — hence an explicit map, rather than an
 * implicit one that only worked while the bar lived inside the navigator.
 *
 * Adding a screen: put its path prefix under whichever tab it belongs to.
 * A route listed nowhere still shows the chrome (with no tab lit), which is
 * the safe default — the bar disappearing is the bug this fixes, so an
 * unlisted route must never be a reason to hide it.
 */
import type { IconName } from "../components/Icon";

export interface TabDef {
  /** Stable key — also the tab's own route. */
  href: "/home" | "/companies" | "/messages" | "/requests" | "/account";
  label: string;
  icon: IconName;
  /**
   * What a signed-out visitor gets instead of navigation. `"sign-in"` goes
   * straight there (needing an account to see "your account" needs no
   * explaining); an object shows the contextual prompt first. Omitted for the
   * two public tabs. Moved here from (tabs)/_layout.tsx's `tabPress`
   * listeners, which can no longer fire now that the bar lives outside the
   * tab navigator — the copy is carried over verbatim.
   */
  guard?: "sign-in" | { title: string; subtitle: string };
  /**
   * Path prefixes that count as INSIDE this tab. This is what keeps the tab
   * lit through nested screens: /company/acme is three pushes deep and is
   * still "البحث".
   */
  owns: string[];
}

export const TABS: readonly TabDef[] = [
  {
    href: "/home",
    label: "الرئيسية",
    icon: "home",
    // "/" is the launch route (app/index.tsx redirects to /home) — listed so
    // the bar is not briefly tab-less on the very first frame.
    owns: ["/", "/home"],
  },
  {
    href: "/companies",
    label: "البحث",
    icon: "search",
    // The whole browse path hangs off this tab: the catalogue, a category,
    // a company profile, and the search overlay that opens from its header.
    owns: ["/companies", "/company", "/services", "/search"],
  },
  {
    href: "/messages",
    label: "الرسائل",
    icon: "forum",
    guard: {
      title: "سجل الدخول لعرض رسائلك",
      subtitle: "سجل الدخول عشان تقدر تتواصل مع الشركات وتشوف ردودهم.",
    },
    owns: ["/messages", "/chat"],
  },
  {
    href: "/requests",
    label: "طلباتي",
    icon: "receipt_long",
    guard: {
      title: "سجل الدخول لمتابعة طلباتك",
      subtitle: "سجل الدخول عشان تقدر تشوف كل طلباتك وتتابع حالتها أول بأول.",
    },
    // A request being COMPOSED belongs to the tab it will land in.
    owns: ["/requests", "/new-request"],
  },
  {
    href: "/account",
    label: "حسابي",
    icon: "person",
    guard: "sign-in",
    // المفضلة has no tab slot of its own (see (tabs)/_layout.tsx) and its
    // other door is the Account tab, so it lights that one. Notifications and
    // the legal pages are reached from there too.
    owns: ["/account", "/saved", "/notifications", "/legal"],
  },
] as const;

/**
 * Routes that are deliberately full-screen, and are therefore the ONLY places
 * the global bar and the menu button are allowed to be absent.
 *
 * Deliberately short, and deliberately not "is this route a tab": hiding the
 * chrome on nested routes is exactly the behaviour this shell exists to end.
 * Each entry here is a screen with no application context to navigate within
 * — you are either signing in or answering the wizard's questions, and there
 * is nothing underneath to go back to sideways.
 *
 * Full-screen MEDIA (the photo/video viewer) needs no entry: it is a native
 * <Modal>, which already presents in its own window above the shell.
 */
const FULL_SCREEN_PREFIXES = [
  "/sign-in",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/guided-start",
] as const;

function matches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/" || pathname === "";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The tab that should be lit for `pathname`, or null when none owns it. */
export function activeTab(pathname: string): TabDef | null {
  return TABS.find((tab) => tab.owns.some((prefix) => matches(pathname, prefix))) ?? null;
}

/** True only for the deliberate full-screen experiences listed above. */
export function isFullScreenRoute(pathname: string): boolean {
  return FULL_SCREEN_PREFIXES.some((prefix) => matches(pathname, prefix));
}
