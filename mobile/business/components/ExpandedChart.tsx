import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import Icon from "./Icon";

/**
 * A chart, opened full-screen.
 *
 * ── Why a modal and not a route ────────────────────────────────────────────
 * The expanded chart is the SAME chart component with more room — it reads the
 * data the analytics screen has already fetched and holds the selection state
 * the caller passes in. A pushed route would have to re-fetch, or serialise a
 * whole `ApiLeadStats` through route params, to show something the screen
 * underneath is already displaying. A modal keeps one source of data and one
 * definition of every number.
 *
 * `onRequestClose` is wired for Android's hardware/gesture back, which
 * otherwise pops the whole analytics screen out from under the modal instead
 * of dismissing it.
 *
 * The body scrolls. A donut plus a five-row legend plus a drill-down action is
 * taller than a short phone in landscape, and a chart you cannot reach the
 * bottom of is worse than the small one it replaced.
 */
export default function ExpandedChart({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            hitSlop={8}
          >
            <Icon name="close" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  subtitle: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: textStart,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainer,
  },
  closePressed: { backgroundColor: colors.surfaceContainerHigh },
  body: { padding: 20, paddingBottom: 40, gap: 16 },
});
