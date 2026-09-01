import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

export default function RatingStars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={[styles.star, i < full && styles.starFilled]}>★</Text>
      ))}
      <Text style={styles.value}>{rating.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  star: { fontSize: 16, color: colors.outlineVariant },
  starFilled: { color: "#f5a623" },
  value: { marginStart: 6, fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
});
