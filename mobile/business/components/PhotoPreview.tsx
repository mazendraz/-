import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "@alassema/core";

/** Full-size project photo. expo-image only — uploads are WebP and
 *  react-native's own Image has no iOS WebP decoder (see docs/architecture/
 *  business-app's own note on this, first hit in the client app). */
export default function PhotoPreview({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.image} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.surfaceContainer },
});
