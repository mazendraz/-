import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Lifts its children clear of the on-screen keyboard by the amount they are
 * ACTUALLY covered — measured, not assumed.
 *
 * ── Why `KeyboardAvoidingView` was not enough ──────────────────────────────
 * The chat composer sat under the keyboard through three different
 * configurations, and each failed for its own reason:
 *
 *   • `behavior={undefined}` on Android (what shipped): relies on the Activity
 *     resizing its window for the IME. Under edge-to-edge the window draws
 *     behind the system bars and that resize is partial at best, so nothing
 *     moved.
 *   • `behavior="padding"`: measured on the emulator, this lifted the composer
 *     208dp against a ~418dp keyboard — roughly half. It computes the overlap
 *     from the keyboard's screen coordinates against its own frame, and when
 *     the window has ALREADY partly resized underneath it, that arithmetic is
 *     counting some of the same space twice.
 *   • A hardcoded `keyboardVerticalOffset`: a guess at one screen's header
 *     height, wrong on every other screen and every other device.
 *
 * The failure mode they share is that each one INFERS the overlap from
 * something else. This measures it: on `keyboardDidShow` it asks the view
 * where it actually is (`measureInWindow`), compares its bottom edge with the
 * keyboard's top edge, and pads by exactly the difference. Whether the window
 * resized fully, partly, or not at all, the remaining overlap is what gets
 * corrected — there is nothing left to double-count.
 *
 * ── Why the lift accumulates rather than being set outright ────────────────
 * After the first lift the view is no longer where it was, so a second
 * `keyboardDidShow` (the emoji panel opening, an autocomplete bar appearing,
 * a language switch changing the keyboard's height) measures the ALREADY
 * LIFTED position. Overlap is then 0 for a keyboard that is still there, and
 * setting the lift to that would drop the composer straight back under it.
 * Adding the newly-measured overlap to the current lift is stable in both
 * directions: zero when it is already correct, positive when the keyboard grew,
 * negative when it shrank. The clamp keeps it from going below the resting
 * position.
 */
export default function KeyboardLift({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  const [lift, setLift] = useState(0);
  // Read inside the measure callback, which runs a frame later — state read
  // there would be the value captured when the listener was registered.
  const liftRef = useRef(0);
  liftRef.current = lift;
  // Where the bottom edge rests with no keyboard — the baseline every lift is
  // measured against.
  const restingBottom = useRef<number | null>(null);

  useEffect(() => {
    // `didShow`, not `willShow`: the measurement has to happen after the
    // window has done whatever resizing it is going to do, or it corrects for
    // an overlap the system is about to remove by itself.
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      const node = ref.current;
      if (!node) return;
      node.measureInWindow((_x, y, _w, height) => {
        const bottom = y + height;
        const resting = restingBottom.current ?? bottom;
        // LENGTHS ONLY — never a coordinate. `measureInWindow` and the
        // keyboard event's `screenY` turn out to sit in DIFFERENT coordinate
        // spaces on this build (measured: a constant ~59dp apart), so
        // subtracting one from the other silently under-lifted by exactly that
        // offset and left the composer clipped. A height and a distance are
        // both lengths in the same dp scale, so this arithmetic is immune to
        // wherever either space starts.
        //
        //   gained  = how far the window ALREADY moved us up by resizing
        //   needed  = the keyboard's height minus whatever we already gained
        const gained = Math.max(0, resting - (bottom - liftRef.current));
        const needed = Math.max(0, e.endCoordinates.height - gained);
        if (Math.abs(needed - liftRef.current) < 1) return;
        setLift(needed);
      });
    });

    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setLift(0);
      // Re-baseline once the layout has settled back down, so a rotation or a
      // changed header does not leave a stale resting position behind.
      setTimeout(() => {
        ref.current?.measureInWindow((_x, y, _w, height) => {
          restingBottom.current = y + height;
        });
      }, 150);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View
      onLayout={() => {
        // First baseline, before any keyboard has ever appeared.
        if (restingBottom.current != null || liftRef.current !== 0) return;
        ref.current?.measureInWindow((_x, y, _w, height) => {
          restingBottom.current = y + height;
        });
      }}
      ref={ref} style={[style, lift > 0 && { paddingBottom: lift }]} collapsable={false}>
      {children}
    </View>
  );
}
