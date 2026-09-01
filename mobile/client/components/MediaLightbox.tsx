import { useEffect, useRef, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type } from "@alassema/core";
import Icon from "./Icon";
import GalleryVideo from "./GalleryVideo";
import { assetUri, isVideoUrl, rowStart, engineIsRTL } from "@alassema/mobile-shared";

export interface LightboxItem {
  src: string;
  /** Alt text, and the plain caption shown when there is no `footer`. */
  caption?: string;
  /** Rich caption bar under the photo — a name, a price, an action. Taps on it
   *  do NOT close the viewer, so a customer can act on what they're looking at
   *  without going back to the grid first. */
  footer?: ReactNode;
}

/**
 * Full-screen photo viewer — the mobile counterpart of the website's
 * MediaLightbox.tsx: same swipe/arrow paging, same counter, same footer bar.
 *
 * Three things here are load-bearing, and getting any of them wrong produced
 * the "opens to a black screen you can't get out of" bug:
 *
 *  1. Every page and the image inside it gets EXPLICIT pixel width/height.
 *     A horizontal FlatList lays its content container out along the main
 *     axis only — the cross axis (height) is auto — so a page styled
 *     `flex: 1` collapsed to zero height and an image at `height: "100%"`
 *     resolved that percentage against nothing. The photo was being drawn at
 *     0x0 over a black backdrop.
 *  2. The overlays (close, arrows, footer) are rendered AFTER the pager. On
 *     Android `zIndex` reorders drawing but NOT touch hit-testing, so a close
 *     button declared before an overlapping sibling looks tappable and simply
 *     isn't.
 *  3. `scrollToIndex` on the arrow buttons: the pager owns the scroll offset,
 *     so moving `index` from outside without telling it leaves the two out of
 *     sync — the counter would advance while the photo stayed put.
 */
export default function MediaLightbox({
  items,
  index,
  onIndex,
  onClose,
  label,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Prefix for the photo's accessible name, e.g. the company name. */
  label: string;
}) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<LightboxItem>>(null);
  const { width, height } = useWindowDimensions();
  const total = items.length;
  const current = items[index];

  // Follow an index change that came from the arrows (or from the parent)
  // rather than from the user's own swipe. Guarded by a ref holding the last
  // index the pager itself reported, so a finished swipe isn't scrolled again.
  const settledAt = useRef(index);
  useEffect(() => {
    if (settledAt.current === index) return;
    settledAt.current = index;
    listRef.current?.scrollToIndex({ index, animated: true });
  }, [index]);

  // `contentOffset.x` is PHYSICAL — measured from the left edge — in both
  // engines, but under an RTL engine a horizontal list lays item 0 at the
  // RIGHT. So `contentOffset.x / width` is the MIRROR of the page on screen:
  // swiping to photo 2 of 5 reported photo 4, the counter jumped, and the
  // effect above then scrolled the pager to that wrong photo — the "the
  // arrows/paging go the opposite way to where I'm going" report. Converting
  // to a logical offset first is what RN's own VirtualizedList does
  // internally for the same reason (see its _offsetFromScrollEvent).
  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const offset = engineIsRTL
      ? contentSize.width - (contentOffset.x + layoutMeasurement.width)
      : contentOffset.x;
    const i = Math.min(Math.max(Math.round(offset / width), 0), total - 1);
    if (i === index) return;
    settledAt.current = i;
    onIndex(i);
  }

  // Which physical edge each arrow hangs off — see the arrows themselves.
  const prevSide = engineIsRTL ? styles.arrowRight : styles.arrowLeft;
  const nextSide = engineIsRTL ? styles.arrowLeft : styles.arrowRight;

  // Room for the footer bar, so a tall photo doesn't sit under it.
  const barSpace = current?.footer || current?.caption ? 132 : 40;
  const mediaHeight = Math.max(height - insets.top - insets.bottom - barSpace, 160);

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(item, i) => `${item.src}-${i}`}
          onMomentumScrollEnd={onScrollEnd}
          // Without this the pages are memoised against `data` alone, so the
          // `active={i === index}` a video page reads would never update and
          // a swiped-away video would keep playing (with sound) behind the
          // next page.
          extraData={index}
          renderItem={({ item, index: i }) => {
            const uri = assetUri(item.src);

            // Video pages are NOT tap-to-close: the whole surface belongs to
            // the player's own controls (play/pause, scrubber, fullscreen),
            // and a close-on-tap wrapper would swallow every one of them.
            if (uri && isVideoUrl(item.src)) {
              return (
                <View style={[styles.page, { width, height }]}>
                  <GalleryVideo
                    uri={uri}
                    variant="full"
                    active={i === index}
                    style={{ width, height: mediaHeight }}
                    accessibilityLabel={item.caption ?? `${label} — ${i + 1}`}
                  />
                </View>
              );
            }

            return (
              // Tapping the photo closes — the gesture people already expect
              // from every phone gallery, and a second way out if the close
              // button ends up under a notch.
              <Pressable
                style={[styles.page, { width, height }]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="إغلاق الصورة"
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ width, height: mediaHeight }}
                    contentFit="contain"
                    accessibilityLabel={item.caption ?? `${label} — ${i + 1}`}
                  />
                ) : (
                  <Text style={styles.missing}>تعذّر تحميل الصورة</Text>
                )}
              </Pressable>
            );
          }}
        />

        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable
            style={styles.roundBtn}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            onPress={onClose}
            hitSlop={16}
          >
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Arrows as well as swipe: the swipe is the native gesture, but a
            visible arrow is what tells someone there IS another photo.

            Each arrow must sit on the side the photo it leads to actually
            LIVES on, and point that way — under an RTL engine the pager lays
            photo 1 at the right and the last one at the left, so "previous"
            is to the RIGHT and "next" to the LEFT, the mirror of the LTR
            arrangement. Hardcoding prev-left/next-right (which is what the
            website can do, since its arrows drive no swipe surface) made
            every arrow here point away from the direction it moved you. */}
        {index > 0 && (
          <Pressable
            style={[styles.arrow, prevSide, { top: height / 2 - 22 }]}
            accessibilityRole="button"
            accessibilityLabel="الصورة السابقة"
            onPress={() => onIndex(index - 1)}
            hitSlop={12}
          >
            <Icon name={engineIsRTL ? "navigate_next" : "navigate_before"} size={26} color="#fff" />
          </Pressable>
        )}
        {index < total - 1 && (
          <Pressable
            style={[styles.arrow, nextSide, { top: height / 2 - 22 }]}
            accessibilityRole="button"
            accessibilityLabel="الصورة التالية"
            onPress={() => onIndex(index + 1)}
            hitSlop={12}
          >
            <Icon name={engineIsRTL ? "navigate_before" : "navigate_next"} size={26} color="#fff" />
          </Pressable>
        )}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          {current?.footer ? (
            <View style={styles.footerSlot}>{current.footer}</View>
          ) : current?.caption ? (
            <Text style={styles.caption}>{current.caption}</Text>
          ) : null}

          {/* Forced LTR: "N / total" must read left-to-right even in this
              RTL app, or the bidi algorithm renders it as "total / N". */}
          {total > 1 && (
            <Text style={styles.counter}>{`⁦${index + 1} / ${total}⁩`}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // The website pins close to the physical top-RIGHT (`top-4 right-4` in
    // MediaLightbox.tsx, both physical in Tailwind). `rowStart` starts at the
    // right under RTL, so flex-START is what keeps it there — flex-end was
    // only landing on the right because the hardcoded row-reverse it used to
    // pair with had silently flipped the row itself.
    flexDirection: rowStart,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  roundBtn: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, padding: 6 },
  arrow: { position: "absolute", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, padding: 8 },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  page: { justifyContent: "center", alignItems: "center" },
  missing: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: "rgba(255,255,255,0.7)" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 10, paddingHorizontal: 16 },
  footerSlot: { width: "100%", maxWidth: 560 },
  caption: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.label.fontSize,
    color: "#fff",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  counter: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: type.label.fontSize,
    color: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
});
