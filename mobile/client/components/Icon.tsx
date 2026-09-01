// The subpath import, not the `@expo/vector-icons` barrel: the barrel
// re-exports every bundled icon family (19 vendor fonts, ~4MB measured via a
// real `expo export`), and only MaterialIcons is ever used anywhere in this
// app. This one import shaves that whole 4MB off every build.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ColorValue, StyleProp, TextStyle } from "react-native";
import { colors } from "@alassema/core";

/**
 * Icon name translation: Material Symbols (underscore_case, what the website's
 * `<Icon name="...">` and every design note in this codebase uses) to Material
 * Icons (kebab-case, the different icon set @expo/vector-icons actually
 * bundles). They are two distinct Google icon families with mostly — not
 * completely — overlapping names, and the gap is silent: passing a Symbols
 * name straight through renders a blank box with no error.
 *
 * Found by checking the installed glyph map directly
 * (@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json)
 * rather than assuming names carry over — `receipt_long`, `link_off`,
 * `manage_accounts`, `mark_email_unread` and `check_circle` all don't exist
 * under those exact names in this set; each below is the closest verified
 * equivalent that DOES.
 *
 * Extend this map as new icons are needed — never guess a name into a call
 * site. `name` is typed against its keys specifically so an unmapped Symbols
 * name is a compile error here, not a blank icon on a phone.
 */
const MATERIAL_ICON_NAME = {
  explore_off: "explore-off",
  // Verified present in the installed MaterialIcons glyph map (as "cloud-off").
  // Used by the Requests tab's load-failure state, and matching the icon the
  // website's own CatalogError uses for the same condition.
  cloud_off: "cloud-off",
  support_agent: "support-agent",
  system_update: "system-update",
  receipt_long: "receipt-long",
  person: "person",
  smartphone: "smartphone",
  computer: "computer",
  error: "error",
  link_off: "link-off",
  manage_accounts: "manage-accounts",
  history: "history",
  devices: "devices",
  logout: "logout",
  favorite: "favorite",
  mark_email_unread: "mark-email-unread",
  check_circle: "check-circle",
  search: "search",
  // Both directions are real glyphs in the bundled set. They used to be faked
  // by rendering the opposite one under `transform: [{ scaleX: -1 }]`, which
  // is how the app ended up with back arrows pointing BOTH ways: every screen
  // that remembered the transform mirrored correctly for Arabic and every
  // screen that forgot it pointed the wrong way. A directional icon is picked
  // by NAME here now, so there is nothing left to forget.
  //
  // Which is which, in an Arabic (right-to-left) UI: "back"/"up a level"
  // points RIGHT (arrow_forward, chevron_right); "onward"/"into this" points
  // LEFT (arrow_back, chevron_left). That is the reading direction, not the
  // engine's, so it does not vary by platform.
  arrow_back: "arrow-back",
  arrow_forward: "arrow-forward",
  chevron_left: "chevron-left",
  close: "close",
  send: "send",
  forum: "forum",
  home: "home",
  category: "category",
  // Service-category glyphs. Unlike everything else here these are not chosen
  // by a call site — they come from ApiCategory.icon, which an admin picks in
  // the website's CategoryEditor. These six are what the seeded catalogue
  // ships with; anything an admin picks later that isn't in this map degrades
  // to the generic `category` glyph (see toIconName below) instead of
  // rendering blank, so a new category is never worse off than before.
  architecture: "architecture",
  smart_toy: "smart-toy",
  park: "park",
  chair: "chair",
  local_shipping: "local-shipping",
  apps: "apps",
  grid_view: "grid-view",
  local_offer: "local-offer",
  chat: "chat",
  feedback: "feedback",
  info: "info",
  call: "call",
  description: "description",
  gavel: "gavel",
  policy: "policy",
  list_alt: "list-alt",
  chevron_right: "chevron-right",
  star: "star",
  hourglass_top: "hourglass-top",
  tune: "tune",
  check: "check",
  expand_more: "expand-more",
  location_on: "location-on",
  public: "public",
  construction: "construction",
  refresh: "refresh",
  mail: "mail",
  menu: "menu",
  visibility: "visibility",
  visibility_off: "visibility-off",
  verified: "verified",
  verified_user: "verified-user",
  bolt: "bolt",
  workspace_premium: "workspace-premium",
  business_center: "business-center",
  zoom_in: "zoom-in",
  play_circle: "play-circle",
  report_problem: "report-problem",
  handshake: "handshake",
  event_busy: "event-busy",
  schedule: "schedule",
  add: "add",
  navigate_before: "navigate-before",
  navigate_next: "navigate-next",
  lock: "lock",
  notifications: "notifications",
  notifications_none: "notifications-none",
  notifications_active: "notifications-active",
  notifications_off: "notifications-off",
  campaign: "campaign",
  done_all: "done-all",
  fiber_manual_record: "fiber-manual-record",
  build: "build",
  chat_bubble: "chat-bubble",
  celebration: "celebration",
  mark_email_read: "mark-email-read",
  pause: "pause",
  play_arrow: "play-arrow",
  format_quote: "format-quote",
  star_border: "star-border",
  rate_review: "rate-review",
} as const;

/** What a CALL SITE may write. Deliberately just the hand-written map's keys,
 *  so an unmapped name typed into JSX stays a compile error rather than a
 *  blank icon on a phone. */
export type IconName = keyof typeof MATERIAL_ICON_NAME;

declare const RESOLVED: unique symbol;
/**
 * What `toIconName` returns: either one of the names above, or a MaterialIcons
 * glyph name it verified against the bundled set at runtime. The branded arm
 * is unforgeable by a string literal, so widening `Icon`'s prop to accept this
 * does NOT reopen the "any string compiles" hole `IconName` exists to close —
 * a raw string still has to come through toIconName to get here.
 */
export type ResolvedIconName = IconName | (string & { readonly [RESOLVED]?: true });

/**
 * Narrow a Material Symbols name that came from DATA rather than from a call
 * site — today `ApiCategory.icon`, which an admin sets in the website's
 * CategoryEditor and can therefore be any Symbols name at all, including one
 * with no glyph in the set bundled here.
 *
 * `name` above is typed against the map's keys precisely so an unmapped icon
 * is caught at compile time; a value only known at runtime can't get that, so
 * this is where it's checked instead. Unknown (or missing) names fall back to
 * the generic `category` glyph — the same default the website's own
 * CategoryEditor writes for a category with no icon chosen.
 */
export function toIconName(
  name: string | null | undefined,
  fallback: IconName = "category",
): ResolvedIconName {
  if (name == null) return fallback;
  const symbols = name.trim().toLowerCase();
  if (symbols in MATERIAL_ICON_NAME) return symbols as IconName;

  // The map above only ever listed the handful of category glyphs the seeded
  // catalogue shipped with, so EVERY icon an admin has picked since — the
  // `plumbing` on the plumbing category, the `sensor_door` on armoured doors —
  // fell through to the generic `category` glyph, and the whole services grid
  // rendered as the same square. That is the "the category icons are not the
  // ones I set" report.
  //
  // The two families' names differ by exactly one rule for the overwhelming
  // majority of glyphs — Material Symbols writes `local_shipping`, Material
  // Icons writes `local-shipping` — so applying that rule and then checking
  // the bundled glyph map covers all ~2,200 icons in the set instead of the
  // ~90 written out by hand. The check is what keeps the old guarantee: a
  // name with no glyph still degrades to `category` rather than rendering a
  // blank box.
  const kebab = symbols.replace(/_/g, "-");
  if (kebab in MaterialIcons.glyphMap) return kebab as ResolvedIconName;

  return fallback;
}

export default function Icon({
  name,
  size = 22,
  color = colors.onSurface,
  style,
}: {
  name: ResolvedIconName;
  size?: number;
  // ColorValue, not string: react-navigation's Tabs.Screen `tabBarIcon` callback
  // hands back a ColorValue (it supports PlatformColor()), and a plain
  // `string` prop rejected that at the _layout.tsx call site.
  color?: ColorValue;
  /** For the rare case a glyph's own artwork needs adjusting — e.g. mirroring
   *  a directional icon for RTL, which RN's layout flip does not do for you. */
  style?: StyleProp<TextStyle>;
}) {
  // `?? name`: toIconName above can resolve a data-supplied glyph that is real
  // in the bundled set but absent from the hand-written map, in which case the
  // name it returns is ALREADY the MaterialIcons spelling.
  const glyph = (MATERIAL_ICON_NAME as Record<string, string>)[name] ?? name;
  return <MaterialIcons name={glyph as keyof typeof MaterialIcons.glyphMap} size={size} color={color} style={style} />;
}
