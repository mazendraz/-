import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "@alassema/core";
import { assetUri } from "@alassema/mobile-shared";

/** Full-size project photo. expo-image only — uploads are WebP and
 *  react-native's own Image has no iOS WebP decoder (see docs/architecture/
 *  business-app's own note on this, first hit in the client app). Resolved
 *  through assetUri: a seeded project's photo can still be a root-relative
 *  path RN has no origin to resolve on its own. */
export default function PhotoPreview({ uri }: { uri: string }) {
  return <Image source={{ uri: assetUri(uri) }} style={styles.image} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.surfaceContainer },
});
