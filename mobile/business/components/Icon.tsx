// The subpath import, not the `@expo/vector-icons` barrel — the barrel
// re-exports every bundled icon family (19 vendor fonts, ~4MB measured on a
// real `expo export` in mobile/client), and only MaterialIcons is used here.
// Same decision, and the same reason, as mobile/client's own Icon.tsx.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ColorValue, StyleProp, TextStyle } from "react-native";

/**
 * Icon name translation: Material **Symbols** (underscore_case — what the
 * WEB dashboards' `nav.ts` files and every design note in this codebase use)
 * to Material **Icons** (kebab-case — the different family @expo/vector-icons
 * actually bundles).
 *
 * These are two distinct Google families whose names mostly, but not
 * completely, overlap, and the gap is SILENT: passing a Symbols name straight
 * through renders a blank box with no error and no warning. mobile/client
 * hit this and documented it; this app inherits both the hazard and the fix.
 *
 * Every entry below was verified against the installed glyph map directly
 * (`@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/
 * MaterialIcons.json`) rather than assumed. `IconName` is typed against these
 * keys specifically, so an unmapped name is a COMPILE error here instead of a
 * blank square on someone's phone.
 *
 * Where a destination also exists on the WEB dashboards, the glyph here is the
 * one their own nav.ts already uses (app/src/pages/{admin,provider}/nav.ts) —
 * so a provider moving between the website and the app sees one product, not
 * two. Names with no web counterpart are marked below.
 */
const MATERIAL_ICON_NAME = {
  // ── Tab bar (mirrors the web dashboards' own nav.ts choices) ─────────────
  dashboard: "dashboard",   // admin+provider "overview" on the web
  inbox: "inbox",           // admin+provider "leads" on the web
  forum: "forum",           // admin "chat" / provider "messages" on the web
  rate_review: "rate-review", // admin "changes" (the approvals queue) on the web
  business: "business",     // admin "companies" / provider "profile" on the web
  more_horiz: "more-horiz", // no web counterpart — mobile-only overflow tab

  // ── More menu ────────────────────────────────────────────────────────────
  person: "person",
  settings: "settings",
  notifications: "notifications",
  receipt_long: "receipt-long",
  sell: "sell",                 // provider "pricing" on the web
  // `discount`, not `local-offer`: next to `sell` in the More menu the two
  // tag glyphs were indistinguishable at 20px, so two different destinations
  // looked like the same one.
  discount: "discount",
  photo_library: "photo-library", // provider "projects" on the web
  star: "star",                 // provider "reviews" on the web
  bar_chart: "bar-chart",       // provider "analytics" on the web
  group: "group",               // admin "team" (web uses `badge`, absent here)
  category: "category",         // admin "services" on the web
  event_busy: "event-busy",     // provider "availability" on the web
  event_available: "event-available", // the "open for orders" state of the same screen

  // Header back affordance. In an Arabic (RTL) UI "back / up a level" points
  // RIGHT — so `arrow_forward` is the back button and `arrow_back` is
  // "onward / into this". Same convention, and the same reason, as
  // mobile/client's Icon.tsx.
  arrow_forward: "arrow-forward",
  arrow_back: "arrow-back",
  hourglass_top: "hourglass-top",
  devices: "devices",
  description: "description",
  mail: "mail",
  history: "history",
  search: "search",
  space_dashboard: "space-dashboard",
  fact_check: "fact-check",
  logout: "logout",
  chat: "chat",              // in-app conversation
  call: "call",              // native dialer

  // ── Forms, pickers and media ─────────────────────────────────────────────
  // Every one of these was checked against the installed glyph map before
  // being added, per this file's own rule — an unmapped Symbols name renders
  // as a blank box with no error.
  close: "close",                       // remove a chip / dismiss
  add: "add",                           // add an option from a picker list
  remove: "remove",                     // the logo-scale stepper's decrement
  cloud_upload: "cloud-upload",         // the empty upload dropzone
  upload: "upload",                     // the "choose a file" action
  sync: "sync",                         // replace an already-uploaded file
  delete: "delete",                     // remove an uploaded file
  videocam: "videocam",                 // a gallery item that is a video
  play_arrow: "play-arrow",             // the play affordance over a video
  photo_camera: "photo-camera",         // take a photo instead of picking one
  fullscreen: "fullscreen",             // expand a chart to its own screen
} as const;

export type IconName = keyof typeof MATERIAL_ICON_NAME;

export default function Icon({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <MaterialIcons
      name={MATERIAL_ICON_NAME[name]}
      size={size}
      color={color}
      style={style}
      // The glyph is decorative here: every tab already carries a visible text
      // label, and the navigator exposes that label to screen readers. Marking
      // the icon as an image too would make each tab announce twice.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
