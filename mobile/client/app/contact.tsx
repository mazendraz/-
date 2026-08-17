import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiPlatformSettings } from "@alassema/core";
import { colors, type, formatPhoneDisplay } from "@alassema/core";
import Icon, { type IconName } from "../components/Icon";
import Button from "../components/Button";
import { fetchPlatformSettings } from "../lib/pages";

/** Contact details — the mobile counterpart of the website's Contact.tsx. */
export default function Contact() {
  const [settings, setSettings] = useState<ApiPlatformSettings | null>(null);

  useEffect(() => {
    fetchPlatformSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const hasDetails = !!(settings?.support_email || settings?.public_phone || settings?.address);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={styles.headerTitle}>تواصل معنا</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {hasDetails ? (
          <View style={styles.card}>
            {settings?.support_email ? (
              <ContactLine icon="mark_email_unread" text={settings.support_email} onPress={() => Linking.openURL(`mailto:${settings.support_email}`)} />
            ) : null}
            {settings?.public_phone ? (
              <ContactLine icon="call" text={formatPhoneDisplay(settings.public_phone)} onPress={() => Linking.openURL(`tel:${settings.public_phone.replace(/\s/g, "")}`)} />
            ) : null}
            {settings?.address ? <ContactLine icon="info" text={settings.address} /> : null}
          </View>
        ) : settings ? (
          <Text style={styles.empty}>البيانات دي لسه متوفرتش.</Text>
        ) : null}

        <Button label="ابعت طلب خدمة" onPress={() => router.push("/companies")} style={styles.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactLine({ icon, text, onPress }: { icon: IconName; text: string; onPress?: () => void }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.line} onPress={onPress}>
      <Icon name={icon} size={18} color={colors.primary} />
      <Text style={styles.lineText}>{text}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  scroll: { padding: 20, paddingTop: 4, gap: 16 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.outlineVariant },
  line: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  lineText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "right", flex: 1 },
  empty: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "center" },
  cta: { marginTop: 4 },
});
