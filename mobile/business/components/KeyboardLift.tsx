import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Keyboard, Platform, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Lifts its children clear of the on-screen keyboard by the amount they are
 * ACTUALLY covered — measured, not assumed — and travels WITH the keyboard
 * rather than after it.
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
 * something else. This measures it: on the keyboard event it asks the view
 * where it actually is (`measureInWindow`), compares its bottom edge with the
 * keyboard's height, and pads by exactly the difference. Whether the window
 * resized fully, partly, or not at all, the remaining overlap is what gets
 * corrected — there is nothing left to double-count.
 *
 * ── Why it ANIMATES on `will*` instead of jumping on `did*` ────────────────
 * The lift used to be a `setState` on `keyboardDidShow` / `keyboardDidHide`.
 * Those fire when the keyboard has ALREADY FINISHED moving, so what the user
 * saw on iOS was: keyboard slides all the way up over the composer → a beat of
 * the composer sitting hidden underneath it → composer teleports into place.
 * Closing was the same lag mirrored, and worse to look at: the keyboard slid
 * away and the composer hung in the middle of an empty screen until the event
 * landed. A screen recording of exactly that is what opened this bug.
 *
 * iOS also publishes `keyboardWillShow`/`keyboardWillHide` BEFORE the
 * animation starts, carrying the exact `duration` the system is about to use.
 * Running an `Animated.timing` of that same length from that event is what
 * makes the composer ride the keyboard instead of chasing it. Android has no
 * `will*` pair (`Keyboard`'s own docs: iOS only), so it stays on `did*`, where
 * the animation is a short catch-up rather than a match.
 *
 * The measurement arithmetic below is deliberately unchanged from the `did*`
 * version — this fixes WHEN the lift happens, not how far it goes.
 *
 * ── Why the lift accumulates rather than being set outright ────────────────
 * After the first lift the view is no longer where it was, so a second
 * show event (the emoji panel opening, an autocomplete bar appearing, a
 * language switch changing the keyboard's height) measures the ALREADY
 * LIFTED position. Overlap is then 0 for a keyboard that is still there, and
 * setting the lift to that would drop the composer straight back under it.
 * Adding the newly-measured overlap to the current lift is stable in both
 * directions: zero when it is already correct, positive when the keyboard grew,
 * negative when it shrank. The clamp keeps it from going below the resting
 * position.
 */

/** `will*` is an iOS-only pair — see the note above. */
const SHOW_EVENT = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const HIDE_EVENT = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

/** The keyboard's own curve is `UIViewAnimationCurve` 7 — private, with no
 *  public easing constant. This bezier is its standard approximation, close
 *  enough that the composer and the keyboard read as one movement. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

/** Only used when the event carries no duration of its own. Android's `did*`
 *  events report 0, and there the keyboard has already arrived — so this is
 *  how long the catch-up takes, not a guess at the system's own timing. */
const FALLBACK_DURATION = Platform.OS === "ios" ? 250 : 140;

export default function KeyboardLift({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  // Typed as the host View, not `ComponentRef<typeof Animated.View>`: that
  // resolves to `View | LegacyRef<View>` in these typings, which has no
  // `measureInWindow`. Animated.View forwards its ref to the underlying host
  // view, so this is what actually arrives.
  const ref = useRef<View>(null);
  // Animated, not state: the value is driven frame by frame across the
  // keyboard's own duration instead of switching in a single commit.
  const lift = useRef(new Animated.Value(0)).current;
  // Read inside the measure callback, which runs a frame later — and an
  // `Animated.Value` has no synchronous public getter anyway.
  const liftRef = useRef(0);
  // Where the bottom edge rests with no keyboard — the baseline every lift is
  // measured against.
  const restingBottom = useRef<number | null>(null);
  const rebaseline = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function animateTo(value: number, duration: number) {
      liftRef.current = value;
      Animated.timing(lift, {
        toValue: value,
        duration: duration > 0 ? duration : FALLBACK_DURATION,
        easing: KEYBOARD_EASING,
        // paddingBottom is a layout prop and the native driver only takes
        // transforms and opacity. Translating the whole container instead
        // would slide the top of the thread up under the header rather than
        // shrinking the list, so the padding stays.
        useNativeDriver: false,
      }).start();
    }

    const show = Keyboard.addListener(SHOW_EVENT, (e) => {
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
        animateTo(needed, e.duration ?? 0);
      });
    });

    const hide = Keyboard.addListener(HIDE_EVENT, (e) => {
      const duration = e?.duration ?? 0;
      animateTo(0, duration);
      // Re-baseline once the layout has settled back down, so a rotation or a
      // changed header does not leave a stale resting position behind. On iOS
      // this now runs from `willHide` — before the keyboard has actually gone
      // — so it waits out the animation first.
      if (rebaseline.current) clearTimeout(rebaseline.current);
      rebaseline.current = setTimeout(
        () => {
          ref.current?.measureInWindow((_x, y, _w, height) => {
            restingBottom.current = y + height;
          });
        },
        (duration > 0 ? duration : FALLBACK_DURATION) + 150,
      );
    });

    return () => {
      show.remove();
      hide.remove();
      if (rebaseline.current) clearTimeout(rebaseline.current);
    };
  }, [lift]);

  return (
    <Animated.View
      onLayout={() => {
        // First baseline, before any keyboard has ever appeared.
        if (restingBottom.current != null || liftRef.current !== 0) return;
        ref.current?.measureInWindow((_x, y, _w, height) => {
          restingBottom.current = y + height;
        });
      }}
      ref={ref}
      style={[style, { paddingBottom: lift }]}
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}
