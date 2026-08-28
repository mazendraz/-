import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import GalleryVideo from "./GalleryVideo";
import MediaLightbox from "./MediaLightbox";
import { assetUri, isVideoUrl } from "../lib/assetUrl";

const PREVIEW_COUNT = 7;

/**
 * The company profile's photo/video grid — the mobile counterpart of the
 * website's CompanyGallery.tsx. One large feature tile then a clean 2-column
 * grid, rather than porting the website's CSS `grid-flow-dense` masonry
 * (which has no direct Yoga/Flexbox equivalent) — this keeps the same
 * hierarchy the website has (one dominant image, a grid of smaller ones)
 * using a shape mobile layout can actually express.
 *
 * Gallery items are a mixed list of photos and videos (providers can upload
 * MP4/WebM/MOV), and expo-image renders a video URI as a blank box — hence
 * the isVideoUrl branch on every tile.
 */
export default function CompanyGallery({ images, alt }: { images: string[]; alt: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const preview = images.slice(0, PREVIEW_COUNT);
  const rest = preview.slice(1);
  const hasMore = images.length > PREVIEW_COUNT;
  const hasVideo = images.some(isVideoUrl);

  function tileMedia(src: string, label: string, imageStyle: object, videoStyle: object) {
    const uri = assetUri(src);
    if (!uri) return null;
    return isVideoUrl(src) ? (
      <>
        <GalleryVideo uri={uri} variant="preview" style={videoStyle} accessibilityLabel={label} />
        <View style={styles.playBadge} pointerEvents="none">
          <Icon name="play_circle" size={22} color="#fff" />
        </View>
      </>
    ) : (
      <Image source={{ uri }} style={imageStyle} accessibilityLabel={label} />
    );
  }

  return (
    <View>
      <Text style={styles.title}>{hasVideo ? "معرض الصور والفيديو" : "معرض الصور"}</Text>

      <Pressable onPress={() => setLightboxIndex(0)} style={styles.feature}>
        {tileMedia(preview[0], `${alt} 1`, styles.featureImage, styles.featureImage)}
      </Pressable>

      {rest.length > 0 && (
        <View style={styles.grid}>
          {rest.map((src, i) => (
            <Pressable key={`${src}-${i}`} onPress={() => setLightboxIndex(i + 1)} style={styles.tile}>
              {tileMedia(src, `${alt} ${i + 2}`, styles.tileImage, styles.tileFill)}
            </Pressable>
          ))}
        </View>
      )}

      {hasMore && (
        <Pressable style={styles.moreBtn} onPress={() => setLightboxIndex(0)}>
          <Icon name="grid_view" size={18} color={colors.onSurface} />
          <Text style={styles.moreBtnText}>عرض الكل ({images.length})</Text>
        </Pressable>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox
          items={images.map((src) => ({ src }))}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          label={alt}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right", marginBottom: 12 },
  feature: { borderRadius: 16, overflow: "hidden", backgroundColor: colors.surfaceContainer, marginBottom: 8 },
  featureImage: { width: "100%", height: 200 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tile: { width: "31.5%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceContainer },
  tileImage: { width: "100%", height: "100%" },
  // A <VideoView> has no intrinsic size, and its wrapper fills the tile via
  // absolute insets rather than "100%" — a percentage height inside an
  // aspectRatio box resolves against a height Yoga has not computed yet.
  tileFill: { ...StyleSheet.absoluteFillObject },
  playBadge: {
    position: "absolute",
    bottom: 6,
    insetInlineEnd: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    padding: 2,
  },
  moreBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  moreBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
});
