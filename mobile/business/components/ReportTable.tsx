import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/** Horizontally scrollable inside its own container — the page body must
 *  never scroll sideways (phase-12's own risk note). */
export default function ReportTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.outer}>
      <View>
        <View style={styles.headerRow}>
          {columns.map((c, i) => (
            <Text key={i} style={styles.headerCell}>{c}</Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri % 2 === 1 && styles.rowAlt]}>
            {row.map((cell, ci) => (
              <Text key={ci} style={styles.cell}>{cell}</Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const CELL_WIDTH = 130;

const styles = StyleSheet.create({
  outer: { borderRadius: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  headerRow: { flexDirection: "row-reverse", backgroundColor: colors.surfaceContainer },
  headerCell: { width: CELL_WIDTH, padding: 10, fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: textStart },
  row: { flexDirection: "row-reverse", backgroundColor: colors.surface },
  rowAlt: { backgroundColor: colors.surfaceContainer },
  cell: { width: CELL_WIDTH, padding: 10, fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart },
});
