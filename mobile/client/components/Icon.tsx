import { MaterialIcons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
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
  arrow_back: "arrow-back",
  close: "close",
} as const;

export type IconName = keyof typeof MATERIAL_ICON_NAME;

export default function Icon({
  name,
  size = 22,
  color = colors.onSurface,
}: {
  name: IconName;
  size?: number;
  // ColorValue, not string: react-navigation's Tabs.Screen `tabBarIcon` callback
  // hands back a ColorValue (it supports PlatformColor()), and a plain
  // `string` prop rejected that at the _layout.tsx call site.
  color?: ColorValue;
}) {
  return <MaterialIcons name={MATERIAL_ICON_NAME[name]} size={size} color={color} />;
}
