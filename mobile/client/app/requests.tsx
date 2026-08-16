import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import { useCustomerAuth } from "../lib/customerAuth";
import Button from "../components/Button";
import { customerLogout } from "../lib/customerAuth";

/**
 * Placeholder landing screen for a signed-in customer.
 *
 * Exists so /index.tsx has a real destination to redirect to and the sign-in
 * flow has somewhere to land — not the request list itself, which is later
 * work. Proves the same thing SignIn.tsx on the website proves: once signed
 * in, the app knows who you are (useCustomerAuth reflects it here with zero
 * screen-specific plumbing) and can act on it, e.g. signing out below.
 */
export default function Requests() {
  const { customer } = useCustomerAuth();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>أهلاً، {customer?.name}</Text>
      <Text style={styles.subtitle}>{customer?.email}</Text>
      <Button label="تسجيل الخروج" variant="secondary" onPress={() => customerLogout()} style={styles.signOut} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: 24, gap: 8 },
  title: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "right" },
  subtitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", writingDirection: "ltr" },
  signOut: { marginTop: 32 },
});
