import type { ReactNode, RefObject } from "react";
import {
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import KeyboardLift from "./KeyboardLift";

/**
 * The scrolling body of any screen that has fields in it.
 *
 * ── Why every form needed this ─────────────────────────────────────────────
 * An audit of the 23 screens in this app that render a `TextInput` found
 * exactly ZERO `KeyboardAvoidingView`s among them. Nothing moved when the
 * keyboard came up, so on every one of them the bottom of the form — the save
 * button, and any field below the fold — simply sat underneath the IME. The
 * report that surfaced it was the team-member editor: typing in "الشركة"
 * renders matching company names directly under the input, and those matches
 * were being drawn behind the keyboard, so the feature looked broken rather
 * than hidden.
 *
 * It is one component rather than 23 edits because the correct configuration
 * is three non-obvious props that are easy to get individually wrong, and were:
 *
 *  • The lift itself comes from `KeyboardLift`, not `KeyboardAvoidingView`.
 *    Measured on the emulator, KAV's `behavior="padding"` lifted the chat
 *    composer 208dp against a ~312dp keyboard — it infers the overlap by
 *    subtracting the keyboard's `screenY` from its own measured frame, and
 *    those two turn out to sit in different coordinate spaces on this build.
 *    `KeyboardLift` works in lengths instead, which cannot drift.
 *
 *  • `keyboardShouldPersistTaps="handled"`. Without it the first tap on
 *    anything while the keyboard is open is swallowed to dismiss it — which
 *    is precisely fatal for an autocomplete list, where the thing you tap is
 *    the suggestion you were typing to find.
 *
 * Search-and-filter screens (the leads list, the companies list) deliberately
 * do NOT use this: their input is a fixed header above a list, the keyboard
 * covering the list below it is expected, and shrinking the viewport there
 * would fight the list's own scrolling.
 */
export default function FormScroll({
  children,
  contentContainerStyle,
  scrollRef,
  ...rest
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** For screens that need to bring something into view themselves — an
   *  autocomplete list that renders below a field near the bottom of the form
   *  is inside the scroll content but outside the shrunken viewport, and only
   *  the screen knows when its results arrived. */
  scrollRef?: RefObject<ScrollView | null>;
} & Omit<ScrollViewProps, "children" | "contentContainerStyle">) {
  return (
    <KeyboardLift style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={contentContainerStyle}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardLift>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
