import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchTelegramStatus, createTelegramLink, unlinkTelegram, type AdminTelegramStatus } from "../../lib/adminTelegram";
import Button from "../../components/Button";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function TelegramSettings() {
  const [status, setStatus] = useState<AdminTelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setStatus(await fetchTelegramStatus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الحالة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  async function handleLink() {
    setBusy(true);
    try {
      const { url } = await createTelegramLink();
      if (!url) {
        Alert.alert("غير متاح", "الربط مع تليجرام مش مفعّل على السيرفر دلوقتي.");
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر إنشاء رابط الربط.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    setBusy(true);
    try {
      const updated = await unlinkTelegram();
      setStatus(updated);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر فصل الحساب.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "تليجرام" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={1} />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load()} />
        ) : status ? (
          <View style={styles.content}>
            {!status.configured ? (
              <View style={styles.card}>
                <Text style={styles.hint}>الربط مع تليجرام مش مفعّل على السيرفر دلوقتي.</Text>
              </View>
            ) : status.linked ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.label}>حسابك متصل بتليجرام</Text>
                  <Text style={styles.hint}>هتوصلك تنبيهات المنصة على تليجرام كمان.</Text>
                </View>
                <Button label="فصل الحساب" variant="danger" onPress={handleUnlink} busy={busy} />
              </>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.label}>حسابك مش متصل بتليجرام</Text>
                  <Text style={styles.hint}>اضغط الزرار وافتح الرابط في تليجرام عشان توصل حسابك.</Text>
                </View>
                <Button label="ربط الحساب" onPress={handleLink} busy={busy} />
              </>
            )}
          </View>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 4 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  hint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 18 },
});
