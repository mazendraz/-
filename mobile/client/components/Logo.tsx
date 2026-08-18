import { Image, StyleSheet, Text } from "react-native";
import { colors } from "@alassema/core";
import { useSettings } from "../lib/settings";

/**
 * Brand logo — the mobile counterpart of the website's Logo.tsx. Reads the
 * admin-uploaded logo_url from platform settings at runtime, so a branding
 * change made from the dashboard shows up without a new build. Falls back to
 * the app's built-in wordmark while settings are loading or if no logo was
 * ever uploaded — the same "العاصمة" text sign-in.tsx used to hardcode.
 *
 * `size` is the square box the mark renders into (large on sign-in, small in
 * a tab header). `logo_scale` — admin-tunable, 50–200% — is applied as a
 * transform on top of that, same as the website's Logo.
 */
export default function Logo({ size = 40 }: { size?: number }) {
  const { logo_url, logo_scale } = useSettings();

  const scale = Number(logo_scale);
  const clamped = Number.isFinite(scale) && scale > 0 ? Math.min(Math.max(scale, 50), 200) : 100;
  const transform = clamped !== 100 ? [{ scale: clamped / 100 }] : undefined;

  if (logo_url) {
    return (
      <Image
        source={{ uri: logo_url }}
        style={[
          { width: size, height: size, borderRadius: size * 0.28, alignSelf: "center" },
          transform ? { transform } : null,
        ]}
        resizeMode="contain"
      />
    );
  }

  return (
    <Text style={[styles.wordmark, { fontSize: size * 0.42 }, transform ? { transform } : null]}>
      العاصمة
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.primary,
    textAlign: "center",
    alignSelf: "center",
  },
});
