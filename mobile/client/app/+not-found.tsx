import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../components/Icon";
import Button from "../components/Button";

/**
 * expo-router's own 404 convention — any unmatched route renders this file
 * automatically (https://docs.expo.dev/router/error-handling — the `+`
 * prefix is what marks it as the not-found screen, no wiring needed). The
 * mobile counterpart of the website's pages/NotFound.tsx: same two exits
 * (home, companies), no live "popular categories" list — this screen has to
 * render even if the reason the route was unmatched is a broken deep link
 * with no network context to fetch categories from.
 */
export default function NotFound() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name="explore_off" size={44} color={colors.primary} />
      </View>
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>الصفحة مش موجودة</Text>
      <Text style={styles.body}>الرابط ده مش شغّال أو الصفحة اتشالت.</Text>

      <View style={styles.actions}>
        <Button
          label="الرجوع للرئيسية"
          onPress={() => router.replace("/")}
          style={styles.btn}
        />
        <Button
          label="تصفح الشركات"
          variant="secondary"
          onPress={() => router.replace("/companies")}
          style={styles.btn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 24 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  code: {
    fontFamily: "Alexandria_800ExtraBold",
    fontSize: 56,
    color: colors.primary,
    lineHeight: 60,
    marginBottom: 4,
  },
  title: {
    fontFamily: "Alexandria_800ExtraBold",
    fontSize: type.title.fontSize,
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  actions: { width: "100%", maxWidth: 320, gap: 10 },
  btn: { width: "100%" },
});
