import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

/** Never let a partial report read as everything (phase-12's own
 *  instruction). */
export default function TruncatedNotice({ rowCount, totalAvailable }: { rowCount: number; totalAvailable: number }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        العرض محدود لأول {rowCount} من إجمالي {totalAvailable} سجل — التقرير مش شامل كل البيانات.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.errorContainer, borderRadius: 10, padding: 10 },
  text: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onErrorContainer, textAlign: "center" },
});
