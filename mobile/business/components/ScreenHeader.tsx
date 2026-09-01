import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import Logo from "./Logo";

/**
 * The small top bar every tab-root screen shows — mirrors mobile/client's
 * own per-screen `topBar` block (Logo + page title, optional action on the
 * far side), but pulled into one component here since the Business App's
 * tab roots share this exact shape identically (unlike the client app,
 * where each screen's top bar carries a slightly different action button).
 *
 * Rendered ONCE per screen, above every loading/empty/error/loaded branch —
 * never duplicated per branch — so the brand mark and page title stay on
 * screen through every state a screen can be in, not just the happy path.
 */
export default function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarStart}>
        <Logo size={28} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topBarStart: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
});
