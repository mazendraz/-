/**
 * Shared motion primitives for the charts.
 *
 * ── Why hand-rolled numbers instead of animated SVG props ──────────────────
 * `react-native-svg` accepts an `Animated.Value` on a handful of props, but
 * not on the ones these charts actually need to move: a `d` path being drawn
 * out stroke by stroke, a `strokeDasharray` pair sweeping open, a
 * `strokeWidth` that eases when a slice is picked. Driving one
 * `Animated.Value` and reading it back through a listener into React state
 * gives every one of those a plain number to interpolate with, at the cost of
 * a re-render per frame — cheap here, where the heaviest chart is six arcs
 * and a five-row legend, and paid only for the half-second an entrance lasts.
 *
 * That is also why nothing here uses the native driver: none of these values
 * lands on a View's transform or opacity, where the native driver applies.
 * They land inside an SVG path string, which only JS can build.
 *
 * ── Reduced motion ─────────────────────────────────────────────────────────
 * Both hooks jump straight to their end state when the OS reports "reduce
 * motion". A chart that animates is a nicer chart; a chart that animates at
 * someone who asked the system to stop moving things is a worse one. The
 * probe runs once per process and is read synchronously afterwards — an async
 * read inside every hook would let the first frame animate before the answer
 * arrived, which is the exact frame that matters.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

let reduceMotion = false;
let probed = false;

function probeReduceMotion() {
  if (probed) return;
  probed = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => {
      reduceMotion = on;
    })
    .catch(() => {
      // A device that cannot answer is a device that never asked for less
      // motion. Leaving the default alone is the right failure.
    });
  AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
    reduceMotion = on;
  });
}

/**
 * A 0 → 1 ramp that restarts whenever `key` changes.
 *
 * `key` is what makes an entrance replay on new data rather than only on
 * mount: the analytics screen keeps one chart component alive across all four
 * period chips, so "did the numbers change" cannot be answered by a mount.
 * Pass something derived from the data itself (its length and its end dates),
 * never an index.
 */
export function useReveal(key: string | number, duration = 620, delay = 0): number {
  probeReduceMotion();
  const value = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      value.setValue(1);
      setProgress(1);
      return;
    }
    value.setValue(0);
    setProgress(0);
    const id = value.addListener(({ value: v }) => setProgress(v));
    const anim = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
      value.removeListener(id);
    };
  }, [key, duration, delay, value]);

  return progress;
}

/**
 * Eases the returned number toward `target` whenever `target` changes,
 * starting from wherever it currently is rather than from zero.
 *
 * Used for two things that look unrelated and are the same problem: a
 * headline figure that should roll from the old value to the new one instead
 * of snapping, and a 0/1 flag (a slice being selected) whose visual weight
 * should arrive over a few frames. Callers round it themselves — the raw
 * float is what a stroke width wants and what a counter does not.
 */
export function useEased(target: number, duration = 420): number {
  probeReduceMotion();
  const value = useRef(new Animated.Value(target)).current;
  const [shown, setShown] = useState(target);

  useEffect(() => {
    if (reduceMotion) {
      value.setValue(target);
      setShown(target);
      return;
    }
    const id = value.addListener(({ value: v }) => setShown(v));
    const anim = Animated.timing(value, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
      value.removeListener(id);
    };
  }, [target, duration, value]);

  return shown;
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * The prefix of `coords` that `t` (0…1) of the total path length covers, with
 * the cut point interpolated onto the segment it falls inside — the line
 * drawing itself in, one real segment at a time.
 *
 * Measured along the path rather than along x on purpose: an x-swept reveal
 * runs at a different speed on every chart depending on how its points are
 * spaced, and on this RTL build it would also have to know which edge to
 * start from. Arc length has neither problem.
 *
 * Returns coordinates rather than a `d` string so the caller can build BOTH
 * the stroke and the area fill beneath it from the same prefix — an area
 * drawn to the full extent under a half-drawn line is the tell that an
 * entrance was faked with an opacity fade.
 */
export function coordsUpTo(coords: Pt[], t: number): Pt[] {
  if (coords.length === 0) return [];
  if (coords.length === 1 || t >= 1) return coords;

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const len = Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
    lengths.push(len);
    total += len;
  }

  let remaining = total * Math.max(0, t);
  const out: Pt[] = [coords[0]];
  for (let i = 1; i < coords.length; i += 1) {
    const len = lengths[i - 1];
    if (remaining >= len) {
      out.push(coords[i]);
      remaining -= len;
      continue;
    }
    const ratio = len > 0 ? remaining / len : 0;
    out.push({
      x: coords[i - 1].x + (coords[i].x - coords[i - 1].x) * ratio,
      y: coords[i - 1].y + (coords[i].y - coords[i - 1].y) * ratio,
    });
    break;
  }
  return out;
}

/** Coordinates → an SVG polyline `d`. */
export function toPath(coords: Pt[]): string {
  return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
}

/** 0…1, clamped. The one line every easing helper below needs. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A one-shot pulse: 0 → 1 → 0 over `t`, peaking in the middle. What makes a
 * marker acknowledge a tap and then settle, rather than growing and staying
 * grown.
 */
export function pulse(t: number): number {
  return Math.sin(clamp01(t) * Math.PI);
}
