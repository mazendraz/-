import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

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
