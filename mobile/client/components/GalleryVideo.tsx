import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

/**
 * One gallery video, in either of the two shapes the app needs:
 *
 *  • a grid tile — muted, looping, plays by itself as a moving thumbnail
 *    (`variant="preview"`), which is also the only way a video tile shows
 *    anything at all: there is no server-side thumbnail for gallery videos
 *    (nothing in this repo transcodes them), so a paused player is just a
 *    black rectangle.
 *  • the full-screen viewer — native controls, sound on, and it starts on
 *    its own when it is the page you are looking at (`variant="full"`).
 *
 * `active` exists for the viewer's pager: every page keeps its own player, so
 * without it swiping away from a video would leave it playing (with sound)
 * behind the photo you swiped to.
 */
export default function GalleryVideo({
  uri,
  style,
  variant,
  active = true,
  accessibilityLabel,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  variant: "preview" | "full";
  /** Whether this video is the one on screen. Inactive ones pause. */
  active?: boolean;
  accessibilityLabel?: string;
}) {
  const preview = variant === "preview";

  const player = useVideoPlayer(uri, (p) => {
    p.muted = preview;
    p.loop = preview;
    // A muted preview may autoplay freely; a full-screen one is only ever
    // reached by a deliberate tap, so starting it is what the user asked for.
    p.play();
  });

  // ── Only while the screen is actually in front of the customer ────────────
  // A preview tile is a LOOPING autoplaying video, and a company profile can
  // hold several of them. The screen under a push is not unmounted — expo-
  // router keeps it mounted beneath /new-request, /chat, the media viewer and
  // every tab switch (see useRefreshOnFocus's comment) — so every one of those
  // loops kept a hardware decoder running, on repeat, for the rest of the
  // session, out of sight. Opening a few company profiles in a browsing
  // session accumulated them, which is exactly the "the app gets hotter and
  // slower the longer I use it" shape.
  //
  // Backgrounding is the other half: Android in particular keeps a playing
  // decoder alive behind the home screen. Neither of these is something a
  // decorative thumbnail should ever be doing.
  //
  // The full-screen variant already has `active` for its own pager and is
  // only ever mounted inside an open viewer, so it needs neither.
  // Two independent facts, deliberately not one flag: a blurred screen whose
  // app returns to the foreground is still blurred, and folding both into one
  // boolean had the AppState handler resume a thumbnail on a screen buried
  // three pushes down.
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // "background", not `!== "active"` — on iOS "inactive" is transient (a
      // Control Centre pull, an app-switcher peek, an incoming-call banner)
      // and the app returns straight to active, so treating it as backgrounded
      // would stutter every thumbnail for a gesture nobody connects to it.
      // Same distinction, for the same reason, as liveEvents.ts's own
      // AppState handler.
      setForeground(state !== "background");
    });
    return () => sub.remove();
  }, []);

  const shouldPlay = active && (!preview || (focused && foreground));

  useEffect(() => {
    // expo-video throws if the native player has already been released (a
    // race between this effect and unmount teardown); a thumbnail that failed
    // to pause is not worth taking a screen down for.
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {
      /* player already released */
    }
  }, [shouldPlay, player]);

  return (
    <View style={[styles.frame, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={preview ? "cover" : "contain"}
        nativeControls={!preview}
        allowsFullscreen={!preview}
        allowsPictureInPicture={false}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#000" },
});
