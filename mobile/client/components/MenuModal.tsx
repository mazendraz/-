import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon, { type IconName } from "./Icon";
import { customerLogout, useCustomerAuth } from "../lib/customerAuth";

const PUBLIC_LINKS: { label: string; href: Href; icon: IconName }[] = [
  { label: "الرئيسية", href: "/", icon: "home" },
  { label: "الخدمات", href: "/services", icon: "category" },
  { label: "الشركات", href: "/companies", icon: "apps" },
];

/**
 * The hamburger menu — public navigation that a Guest can always open. This
 * is the fix for the actual bug report: the menu icon used to route straight
 * to /account, which useRequireAccount immediately bounced to /sign-in — so
 * "open the menu" silently became "force a login" for anyone not signed in.
 * A menu is navigation, not an account feature, so it can't be gated at all;
 * only the auth-state row at the bottom differs by whether `customer` exists.
 */
export default function MenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { customer } = useCustomerAuth();

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* accessible={false}: this Pressable exists only to catch a tap
          OUTSIDE the card and dismiss — it carries no meaningful action of
          its own for a screen reader to announce. Left accessible by
          default, TalkBack/VoiceOver would present it as one giant unlabeled
          "button" covering the entire screen, ahead of the actual menu items
          in focus order. This lets focus skip straight to the card's real
          content below. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {PUBLIC_LINKS.map((item) => (
            <Pressable key={item.href.toString()} style={styles.row} onPress={() => go(item.href)}>
              <Icon name={item.icon} size={20} color={colors.onSurfaceVariant} />
              <Text style={styles.rowText}>{item.label}</Text>
            </Pressable>
          ))}

          <View style={styles.divider} />

          {customer ? (
            <>
              <Pressable style={styles.row} onPress={() => go("/account")}>
                <Icon name="person" size={20} color={colors.onSurfaceVariant} />
                <Text style={styles.rowText}>حسابي</Text>
              </Pressable>
              <Pressable
                style={styles.row}
                onPress={() => {
                  onClose();
                  customerLogout();
                }}
              >
                <Icon name="logout" size={20} color={colors.error} />
                <Text style={[styles.rowText, styles.logoutText]}>تسجيل الخروج</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.signInRow} onPress={() => go({ pathname: "/sign-in", params: { next: "/" } })}>
              <Text style={styles.signInText}>تسجيل الدخول</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 12, gap: 2 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12 },
  rowText: { fontFamily: "Cairo_600SemiBold", fontSize: type.body.fontSize, color: colors.onSurface },
  logoutText: { color: colors.error },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 8, marginHorizontal: 4 },
  signInRow: { alignItems: "center", paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary },
  signInText: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onPrimary },
});
