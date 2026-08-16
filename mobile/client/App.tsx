import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
// The whole point of the workspace: this is the SAME module the website and the
// API use. If Metro can resolve it, the shared-core plan works; if not, the plan
// needed to change before any screens were built on top of it.
import { selectPlural, type ApiLead, type Locale } from "@alassema/core";

const locale: Locale = "ar";

export default function App() {
  // Arabic has six plural categories. "2 طلبات" is wrong (needs the dual
  // "طلبين"); this is the rule the website already uses, now shared.
  // The noun table itself still lives in the website's i18n module and moves
  // with the rest of it; the RULE — six Arabic categories, not two — is what
  // core owns, and it is the part that is easy to get wrong.
  const NOUN = { one: "طلب", two: "طلبين", few: "طلبات", other: "طلب" };
  const samples = [1, 2, 5, 11].map((n) => `${n} ${selectPlural(locale, n, NOUN)}`);

  // Type-only proof that the contract resolves too — erased at build time.
  const _contract: ApiLead["refNumber"] | undefined = undefined;
  void _contract;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>العاصمة</Text>
      {samples.map((s) => (
        <Text key={s} style={styles.line}>{s}</Text>
      ))}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f9fd", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", color: "#005578", marginBottom: 16 },
  line: { fontSize: 18, color: "#181c1f", marginVertical: 2 },
});
