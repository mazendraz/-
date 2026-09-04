import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useVideoPlayer, VideoView } from "expo-video";

/**
 * The animated logo reveal that plays over the app while it boots.
 *
 * ── Where it sits, and why that matters ─────────────────────────────────────
 * This is an OVERLAY, not a screen. app/_layout.tsx renders it as a sibling of
 * the whole app — outside the <SafeAreaProvider> that only mounts once boot is
 * done — so the app's own startup work (fonts, the stored session, the
 * maintenance/version checks, the price-verification gate) runs UNDERNEATH the
 * animation instead of after it. On a warm boot the two finish together and the
 * intro costs nothing; on a slow one it covers a wait the customer would have
 * spent staring at a static splash anyway.
 *
 * Its position in the tree is also why the parent renders it from ONE place
 * rather than from each of the branches it used to `return null` from: moving
 * between those branches would unmount and remount this component, and a
 * remounted <VideoView> restarts its player from frame zero — the animation
 * would visibly stutter back to the beginning the moment the session resolved.
 *
 * ── The handoff, in order ───────────────────────────────────────────────────
 *   1. The native splash (expo-splash-screen) is already up and held by
 *      app/_layout.tsx's preventAutoHideAsync().
 *   2. This mounts, the player loads, and `onFirstFrameRender` fires — only
 *      THEN is the splash hidden. Hiding it on mount instead would uncover a
 *      blank frame for however long the video takes to become playable.
 *   3. The video plays. `playToEnd`, a tap, or the timeout below finishes it.
 *   4. It fades out over FADE_MS and calls onDone(), which unmounts it.
 * Every step lands on white, and the asset itself is a black mark on white, so
 * there is no colour change anywhere in the sequence to give the seams away.
 */

/** The reveal is 3.5s. */
const HARD_STOP_MS = 6000;
const FADE_MS = 260;

export default function IntroVideo({ onDone }: { onDone: () => void }) {
  const [finishing, setFinishing] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  // Guards onDone against being called twice — `playToEnd` and the timeout can
  // both fire for the same playthrough.
  const done = useRef(false);

  const player = useVideoPlayer(require("../assets/intro.mp4"), (p) => {
    // Muted unconditionally: a brand animation must never duck someone's music
    // or fire a sound on a phone that was deliberately opened in a quiet room.
    p.muted = true;
    p.loop = false;
    p.play();
  });

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setFinishing(true);
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [onDone, opacity]);

  // The end of the video, the normal case.
  useEffect(() => {
    const sub = player.addListener("playToEnd", finish);
    return () => sub.remove();
  }, [player, finish]);

  // A source the device cannot decode at all. Without this the overlay would
  // sit on a white screen for the whole HARD_STOP_MS below waiting for a
  // playthrough that is never going to happen; here it steps aside at once and
  // the app opens as if there were no intro.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") {
        SplashScreen.hideAsync().catch(() => {});
        finish();
      }
    });
    return () => sub.remove();
  }, [player, finish]);

  // The backstop, and the reason this component can never strand anyone: a
  // corrupt asset, a codec the device refuses, a player that never reaches
  // `playToEnd` — none of them may leave a customer looking at a white screen.
  // Generous enough (6s against a 3.5s asset) that it never cuts a healthy
  // playthrough short.
  useEffect(() => {
    const id = setTimeout(finish, HARD_STOP_MS);
    return () => clearTimeout(id);
  }, [finish]);

  // Same reason the splash is held in the first place — see the module
  // comment's step 2. Also called from a failure path: if the first frame
  // never renders, the timeout above still finishes and unmounts this, and
  // app/_layout.tsx's own hideAsync effect is what uncovers the app then.
  const onFirstFrame = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}>
      {/* Skippable, because a 3.5s animation on every cold start stops being a
          brand moment the second someone is in a hurry. `finishing` disables
          it so a second tap during the fade can't re-enter finish(). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={finish}
        disabled={finishing}
        accessibilityRole="button"
        accessibilityLabel="تخطي"
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          // The handoff from the native splash — see the module comment's
          // step 2 for why it happens HERE and not on mount.
          onFirstFrameRender={onFirstFrame}
          // "contain", not "cover": the source is 1920×1080 and a phone is
          // portrait, so cover would scale it to the screen's HEIGHT and crop
          // roughly three quarters of the width away — taking the logo with
          // it. Contain letterboxes instead, and the letterbox is invisible
          // because the bars and the video's own background are both white.
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          // Android only: ExoPlayer's default shutter is a BLACK rectangle
          // held over the surface until the first frame decodes, which on this
          // white asset flashes as a black screen between the splash and the
          // animation. Off makes Android behave like iOS, and the overlay's
          // own white background is the cover instead.
          useExoShutter={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The asset's own background. Matching it exactly is what makes the
  // letterbox bars, the fade, and the splash underneath read as one surface.
  overlay: { backgroundColor: "#ffffff", zIndex: 100, elevation: 100 },
});
