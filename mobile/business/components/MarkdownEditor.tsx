import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/**
 * Simple by design — phase-11's own framing: long-form editing belongs on a
 * keyboard, this is a fallback so nothing forces a laptop, not a match for
 * the web dashboard's editor. Bold/heading/link toolbar buttons append a
 * snippet (not cursor-position insertion — RN's cross-platform selection
 * API is unreliable enough that "always appends, always predictable" beats
 * "usually inserts where you'd expect"), plus a preview toggle with a tiny
 * hand-rolled renderer (no markdown package — this is the only place in the
 * app that would ever need one).
 */
export default function MarkdownEditor({ value, onChange, minHeight = 200 }: { value: string; onChange: (next: string) => void; minHeight?: number }) {
  const [preview, setPreview] = useState(false);

  function append(snippet: string) {
    onChange(value.length > 0 ? `${value}\n${snippet}` : snippet);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={() => append("**نص عريض**")}>
          <Text style={styles.toolBtnText}>عريض</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => append("## عنوان")}>
          <Text style={styles.toolBtnText}>عنوان</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => append("[نص الرابط](https://example.com)")}>
          <Text style={styles.toolBtnText}>رابط</Text>
        </Pressable>
        <Pressable style={[styles.toolBtn, preview && styles.toolBtnActive]} onPress={() => setPreview((p) => !p)}>
          <Text style={[styles.toolBtnText, preview && styles.toolBtnTextActive]}>{preview ? "تعديل" : "معاينة"}</Text>
        </Pressable>
      </View>

      {preview ? (
        <View style={[styles.previewBox, { minHeight }]}>
          <MarkdownPreview text={value} />
        </View>
      ) : (
        <TextInput
          style={[styles.input, { minHeight }]}
          value={value}
          onChangeText={onChange}
          multiline
          textAlignVertical="top"
          placeholderTextColor={colors.onSurfaceVariant}
        />
      )}
    </View>
  );
}

/** Bold, `## `/`# ` headings, and `[text](url)` links — the three things
 *  the toolbar above writes. Anything else renders as plain text. */
function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <Text key={i} style={styles.h2}>{line.slice(3)}</Text>;
        if (line.startsWith("# ")) return <Text key={i} style={styles.h1}>{line.slice(2)}</Text>;
        return <Text key={i} style={styles.paragraph}>{renderInline(line)}</Text>;
      })}
    </>
  );
}

function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return parts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) return <Text key={i} style={styles.bold}>{boldMatch[1]}</Text>;
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) return <Text key={i} style={styles.link}>{linkMatch[1]}</Text>;
    return part;
  });
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  toolbar: { flexDirection: "row-reverse", gap: 8 },
  toolBtn: { backgroundColor: colors.surfaceContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  toolBtnActive: { backgroundColor: colors.primary },
  toolBtnText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  toolBtnTextActive: { color: colors.onPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlign: textStart,
  },
  previewBox: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 10, padding: 12, backgroundColor: colors.surface, gap: 6 },
  h1: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  h2: { fontSize: type.headline.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  paragraph: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurface, textAlign: textStart, lineHeight: 22 },
  bold: { fontFamily: "Cairo_700Bold" },
  link: { color: colors.primary, textDecorationLine: "underline" },
});
