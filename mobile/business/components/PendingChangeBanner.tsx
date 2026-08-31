import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import type { ApiChangeRequest } from "../lib/profile";

/**
 * "Your edit is under review" — shown whenever there's a PENDING change
 * request. The platform's model is that NOTHING a provider edits goes live
 * immediately (except availability, which bypasses this entirely — see
 * lib/availability.ts). Understating this reads as "my edit vanished", not
 * "it's being reviewed" — so this has to be impossible to miss, not a small
 * note at the bottom of the form.
 */
export default function PendingChangeBanner({ request }: { request: ApiChangeRequest }) {
  const fields = Object.keys(request.changes);
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>في تعديل قيد المراجعة</Text>
      <Text style={styles.body}>
        بعتّلنا طلب تعديل على {fieldsLabel(fields)} وهنراجعه قريب. التعديل مش هيظهر للعملاء لحد ما يتوافق عليه.
      </Text>
    </View>
  );
}

function fieldsLabel(fields: string[]): string {
  const LABELS: Record<string, string> = {
    tagline: "الشعار",
    about: "نبذة عن الشركة",
    phone: "رقم الهاتف",
    whatsapp: "واتساب",
    email: "البريد الإلكتروني",
    location: "الموقع",
    responseTime: "مدة الرد",
  };
  return fields.map((f) => LABELS[f] ?? f).join("، ");
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSecondaryContainer, textAlign: textStart },
  body: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSecondaryContainer, textAlign: textStart, lineHeight: 18 },
});
