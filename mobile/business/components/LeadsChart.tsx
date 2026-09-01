import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { colors, type } from "@alassema/core";

const HEIGHT = 64;
const BAR_GAP = 3;

/** Daily lead volume, last N days of `perDay` — a plain bar chart, not a
 *  library: react-native-svg is already a dependency and this is the only
 *  chart in the app, so pulling in a charting package for one tile would
 *  cost more than it saves. */
export default function LeadsChart({ perDay }: { perDay: { date: string; count: number }[] }) {
  const days = perDay.slice(-14);
  const max = Math.max(1, ...days.map((d) => d.count));
  const barWidth = days.length > 0 ? 100 / days.length : 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>الطلبات آخر أسبوعين</Text>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none">
        {days.map((d, i) => {
          const barHeight = (d.count / max) * (HEIGHT - 4);
          return (
            <Rect
              key={d.date}
              x={i * barWidth + BAR_GAP / 2}
              y={HEIGHT - barHeight}
              width={Math.max(0, barWidth - BAR_GAP)}
              height={barHeight}
              rx={1}
              fill={d.count > 0 ? colors.primary : colors.outlineVariant}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
});
