import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

/** Skeleton rows matching a list's final layout, shown on first load only —
 *  never over content already on screen (a refetch uses an inline indicator
 *  instead, per the shared screen contract in docs/architecture/business-app/
 *  README.md). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonRow} />
      ))}
    </View>
  );
}

/** Names the absent thing plus the one action that changes it — never a bare
 *  "لا توجد نتائج". */
export function EmptyCard({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    </View>
  );
}

/** Inline retry card — keyed on the caller's own copy so a screen can surface
 *  the server's actual message (e.g. a 429's retry-after text) verbatim. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>حاول تاني</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonWrap: { padding: 16, gap: 10 },
  skeletonRow: { height: 72, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  card: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.error,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
