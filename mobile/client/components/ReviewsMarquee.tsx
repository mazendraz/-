/**
 * Homepage testimonials strip — a continuously self-scrolling banner of every
 * approved site review, the mobile counterpart of the website's
 * `.review-marquee` (app/src/index.css + Home.tsx's REVIEWS section).
 *
 * ── The seamless loop ────────────────────────────────────────────────────
 * Same shape as the CSS version: the review list is repeated until one
 * "loop" comfortably outruns the screen, that loop is laid out TWICE, and
 * the track is translated by exactly one loop's width. Card `loop.length + j`
 * then sits exactly where card `j` started, so the reset to 0 is invisible.
 *
 * ── Why cards use `left`, not a flex row ─────────────────────────────────
 * This app forces RTL on the native layout engine (lib/rtl.ts). Yoga SWAPS
 * `row`/`row-reverse` under RTL; `transform`/`left` never do. A flex track
 * would start at the right edge on a phone and the left edge under
 * react-native-web (whose I18nManager is a no-op stub, always LTR) — one
 * `translateX` direction can't be seamless on both. `left: i * CARD_STEP` is
 * physical in both engines, so the geometry here behaves identically
 * everywhere. The cards' own contents still read right-to-left via
 * `rowStart`/`textStart`.
 *
 * Fixed-size cards fall out of that (absolutely positioned children can't
 * stretch each other to a shared height) — which the banner wants anyway:
 * an even row, not a ragged one that reshuffles with whatever review is
 * passing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import type { ApiSiteReview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import { rowStart, textStart } from "@alassema/mobile-shared";

const CARD_WIDTH = 280;
const CARD_GAP = 14;
const CARD_STEP = CARD_WIDTH + CARD_GAP;
/** Card padding + quote row + review text (4 lines) + footer, with a small
 *  safety margin so a longer name/district never spills past the clip. */
const CARD_HEIGHT = 240;
/** Breathing room inside the clip so the card shadow isn't sliced by
 *  `overflow: hidden`. */
const CLIP_PAD = 8;
/** How long a card stays fully readable before it has scrolled past —
 *  matches the ~6s/card pace of the website's CSS marquee. Expressed as a
 *  duration-per-card, not a fixed px/s, so it stays true if CARD_WIDTH ever
 *  changes. */
const SECONDS_PER_CARD = 6;
const SPEED_PX_PER_SEC = CARD_STEP / SECONDS_PER_CARD;
/** Width of the soft edge fade — the RN stand-in for the CSS mask-image. */
const FADE_WIDTH = 40;
/** Cap on how many reviews feed the strip. The track mounts every card
 *  twice, so an uncapped list would put 2×N card views on the home screen
 *  for a banner nobody watches past a handful — twelve is already 72s of
 *  reading. The website has no such cap because a browser only paints the
 *  cards currently on screen. */
const MAX_MARQUEE_REVIEWS = 12;

/** The band this strip sits on (home.tsx's `reviewsBand`) — the edge fades
 *  must resolve to exactly this colour to disappear into it. */
const BAND = colors.surfaceContainerLow;
/** Same colour at zero alpha, spelled out rather than "transparent" (which
 *  is black-at-alpha-0 and would grey the cards on their way out). */
const BAND_TRANSPARENT = "rgba(241, 244, 248, 0)";

export default function ReviewsMarquee({ reviews: allReviews }: { reviews: ApiSiteReview[] }) {
  const reviews = allReviews.slice(0, MAX_MARQUEE_REVIEWS);
  const { width: screenWidth } = useWindowDimensions();
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  // null until the OS answers — nothing animates on that first frame, which
  // is also what keeps a reduce-motion user from ever seeing one moving one.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!cancelled) setReduceMotion(reduced);
      })
      .catch(() => {
        if (!cancelled) setReduceMotion(false);
      });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // A tab screen stays mounted after its first visit (see useRefreshOnFocus's
  // comment) — without this the banner would keep animating, and keep the
  // native driver ticking, while the customer is reading another tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // One loop has to outrun the screen, otherwise the second copy hasn't
  // reached the trailing edge by the time the first one leaves it.
  const reps = reviews.length
    ? Math.max(1, Math.ceil((screenWidth + CARD_STEP) / (reviews.length * CARD_STEP)))
    : 1;
  const loop = Array.from({ length: reps }, () => reviews).flat();
  const loopWidth = loop.length * CARD_STEP;

  // Matches the website exactly: it animates as soon as there is at least
  // one approved review, repeating it to fill the loop if that's all there
  // is — a moving strip with one review beats a still one. Previously this
  // required 3+ reviews before it would animate at all, so with the small
  // handful of real reviews the site has early on, the mobile strip sat
  // still while the website kept scrolling — exactly the mismatch reported.
  const animate = reduceMotion === false;
  const running = animate && !paused && focused;

  const x = useRef(new Animated.Value(0)).current;
  // The running loop, so it can be stopped on pause/blur. Animated.loop's
  // handle is not the same object as the timing it wraps — stopping the inner
  // timing leaves the loop free to start the next iteration.
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  // How far into the loop the track was when it last stopped, so pausing
  // and resuming picks up mid-card instead of snapping back to the start.
  //
  // Derived from the clock, not read back from the Animated.Value: under the
  // native driver the JS-side value is stale, and its async `stopAnimation`
  // callback lands after this effect's cleanup has already returned. Linear
  // motion at a known speed makes the elapsed time an exact answer.
  const progress = useRef(0);

  // A rotation resizes the loop; progress measured against the old width
  // would put the seam mid-card.
  useEffect(() => {
    progress.current = 0;
    x.setValue(0);
  }, [loopWidth, x]);

  useEffect(() => {
    if (!running || loopWidth <= 0) return;
    let cancelled = false;
    const startedAt = Date.now();
    const startedFrom = progress.current;

    const oneLoop = () =>
      Animated.timing(x, {
        toValue: -loopWidth,
        duration: (loopWidth / SPEED_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });

    // Two phases. The first finishes whatever is LEFT of the loop the strip
    // was on when it last stopped (resuming a pause must not spend a full
    // loop's time covering half of one). Only then does the endless part
    // start, and it is a real `Animated.loop` rather than a timing that
    // restarts itself from its own completion callback: the old hand-rolled
    // recursion is what left the strip empty after one pass — one dropped
    // callback (a re-render, a stop that lands between the last frame and
    // the callback) and nothing ever scheduled the next lap, so the cards
    // slid off and the band just sat there blank. Animated.loop owns that
    // restart natively and cannot miss it; `resetBeforeIteration` (its
    // default) snaps back to 0 each lap, which is exactly the seam — copy
    // two is by then sitting where copy one began.
    const startEndlessLoop = () => {
      if (cancelled) return;
      x.setValue(0);
      anim.current = Animated.loop(oneLoop());
      anim.current.start();
    };

    if (startedFrom > 0) {
      x.setValue(-startedFrom);
      anim.current = Animated.timing(x, {
        toValue: -loopWidth,
        duration: ((loopWidth - startedFrom) / SPEED_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      anim.current.start(({ finished }) => {
        if (finished) startEndlessLoop();
      });
    } else {
      startEndlessLoop();
    }

    return () => {
      cancelled = true;
      anim.current?.stop();
      anim.current = null;
      const travelled = ((Date.now() - startedAt) / 1000) * SPEED_PX_PER_SEC;
      progress.current = (startedFrom + travelled) % loopWidth;
    };
  }, [running, loopWidth, x]);

  if (reviews.length === 0) return null;

  // Static fallback: only when the customer asked the OS for less motion.
  // Same cards, swipeable by hand instead of auto-scrolling.
  if (!animate) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.staticRow}>
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </View>
      </ScrollView>
    );
  }

  const track = [...loop, ...loop]; // the second copy makes the wrap seamless

  return (
    <View>
      <View style={styles.controlRow}>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          hitSlop={10}
          accessibilityRole="button"
          // No visible label on the button itself (icon-only), so the
          // action still has a name for a screen reader — this is what
          // WCAG 2.2.2 actually requires, the icon shape alone isn't enough.
          accessibilityLabel={paused ? "تشغيل عرض الآراء" : "إيقاف عرض الآراء"}
          style={({ pressed }) => [styles.control, paused && styles.controlActive, pressed && styles.controlPressed]}
        >
          <Icon name={paused ? "play_arrow" : "pause"} size={15} color={paused ? colors.primary : colors.outline} />
        </Pressable>
      </View>

      {/* The strip itself is NOT a pause target. It used to be — a
          "convenience" on top of the explicit button above, which is what
          WCAG 2.2.2 actually requires (see index.css's HOME-07 note). But it
          sits in the middle of a scrolling home screen, so a tap meant for
          the card under a thumb froze the banner instead, with no visible
          cause; a banner that stops when you touch it is indistinguishable
          from one that broke. The button is the one way to stop it. */}
      <View style={styles.marqueeWrap}>
        <View style={styles.clip}>
          <Animated.View
            style={[styles.track, { width: loopWidth * 2 }, { transform: [{ translateX: x }] }]}
          >
            {track.map((r, i) => (
              <ReviewCard
                key={`${r.id}-${i}`}
                review={r}
                left={i * CARD_STEP}
                // Only the first pass through the real list is announced.
                // Everything after — the extra repeats used to fill a short
                // loop, and the whole second loop that makes the wrap
                // seamless — is the same content again, so a screen reader
                // hears each review once instead of on every repetition.
                decorative={i >= reviews.length}
              />
            ))}
          </Animated.View>
        </View>

        {/* Edge fades. RN has no mask-image, and the band behind this strip
            is a flat colour, so a gradient of that same colour over each
            edge reproduces it with no extra dependency.
            These are SIBLINGS of the clip, not children of it: Android
            orders siblings by `elevation` before document order, and the
            cards carry elevation for their own shadow — inside the clip
            these gradients would paint underneath the very cards they're
            meant to fade. A child's elevation can't lift it past its
            parent's siblings, so out here plain document order puts the
            fades on top. */}
        <LinearGradient
          pointerEvents="none"
          colors={[BAND, BAND_TRANSPARENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, styles.fadeLeft]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[BAND_TRANSPARENT, BAND]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, styles.fadeRight]}
        />
      </View>
    </View>
  );
}

function ReviewCard({
  review,
  left,
  decorative,
}: {
  review: ApiSiteReview;
  /** Physical offset inside the marquee track. Omitted by the static
   *  fallback, which flows its cards in a normal row instead. */
  left?: number;
  decorative?: boolean;
}) {
  return (
    <View
      style={[styles.card, left === undefined ? styles.cardFlowed : { left }]}
      // The second copy exists only to make the loop seamless; a screen
      // reader announcing every testimonial twice is the audible version of
      // the visual glitch this component exists to avoid.
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardAccent}
      />

      <View style={styles.cardTop}>
        <Stars rating={review.rating} />
        <View style={styles.quoteMark}>
          <Icon name="format_quote" size={15} color={colors.primary} />
        </View>
      </View>

      <Text style={styles.cardText} numberOfLines={4}>
        "{review.text}"
      </Text>

      <View style={styles.cardFooter}>
        <LinearGradient
          colors={[colors.primaryContainer, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{review.name.trim().charAt(0)}</Text>
        </LinearGradient>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {review.name}
          </Text>
          <Text style={styles.district} numberOfLines={1}>
            {review.district}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Five glyphs, filled up to the score — never fewer than five, so a 3-star
 *  review reads as "3 filled, 2 empty" instead of a shorter row with no
 *  indication of what the maximum was. */
function Stars({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <View style={styles.stars} accessibilityLabel={`${filled} من 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon
          key={i}
          name={i < filled ? "star" : "star_border"}
          size={15}
          color={i < filled ? colors.warning : colors.outlineVariant}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    flexDirection: rowStart,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  // Icon-only, circular — the label moved to accessibilityLabel so screen
  // readers still get a name for the action without a visible caption.
  control: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: "rgba(191, 199, 207, 0.55)",
  },
  // Paused is a real state change, not just a pressed instant — a light
  // primary tint on the button itself is the cue that it now offers the
  // opposite action.
  controlActive: {
    backgroundColor: "rgba(0, 85, 120, 0.08)",
    borderColor: "rgba(0, 85, 120, 0.25)",
  },
  controlPressed: { opacity: 0.6 },

  marqueeWrap: { position: "relative" },
  // Explicit height: the track's cards are absolutely positioned, so they
  // contribute nothing to their parent's own size.
  clip: { overflow: "hidden", height: CARD_HEIGHT + CLIP_PAD * 2 },
  // Absolutely pinned to the clip's own top-left with an EXPLICIT width (set
  // inline, since it depends on the review count) wide enough to hold both
  // copies. A `flex: 1` track was only ever as wide as the screen, leaving
  // every card past the first one positioned outside its own parent's box —
  // a state RN is free to skip drawing. Pinning it with `left: 0` also keeps
  // it off flex alignment, which under an RTL engine would have parked an
  // explicitly-sized track against the RIGHT edge instead.
  //
  // No padding of its own — the cards are absolute, positioned at CLIP_PAD.
  track: { position: "absolute", top: 0, bottom: 0, left: 0 },
  fade: { position: "absolute", top: 0, bottom: 0, width: FADE_WIDTH },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },

  staticRow: { flexDirection: rowStart, paddingHorizontal: 20, paddingVertical: CLIP_PAD, gap: CARD_GAP },

  card: {
    position: "absolute",
    top: CLIP_PAD,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderRadius: 22,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: "rgba(0, 85, 120, 0.10)",
    overflow: "hidden",
    // A restrained lift — enough to sit above the tinted band, not enough
    // to read as a floating toast.
    shadowColor: "#0b2b3d",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    // Pins the footer to the bottom of the fixed height, so a two-line
    // review and a four-line one still line their names up across the strip.
    justifyContent: "space-between",
  },
  /** The static fallback flows its cards in a real row instead. */
  cardFlowed: { position: "relative", top: 0 },
  // A thin brand-gradient hairline along the card's top edge — the one
  // signature touch that ties every card back to the primary colour without
  // tinting the whole surface.
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  cardTop: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between" },
  stars: { flexDirection: rowStart, gap: 2 },
  quoteMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0, 85, 120, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    flexGrow: 1,
    marginTop: 14,
    marginBottom: 12,
    fontFamily: "Cairo_400Regular",
    fontSize: 14.5,
    lineHeight: 24,
    letterSpacing: 0.1,
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  cardFooter: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 11,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(191, 199, 207, 0.4)",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surfaceContainerLowest,
    shadowColor: "#0b2b3d",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onPrimary, textAlign: "center" },
  identity: { flexShrink: 1 },
  name: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: textStart },
  district: { fontFamily: "Cairo_400Regular", fontSize: 11, color: colors.outline, textAlign: textStart, marginTop: 1 },
});
