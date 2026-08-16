/**
 * The Material 3 design tokens — colors and the type scale — extracted
 * programmatically from app/tailwind.config.js, not retyped by hand.
 *
 * ── Why generated, not hand-copied ───────────────────────────────────────────
 * 53 hex values is exactly the kind of list a manual copy silently drifts from:
 * someone tunes a contrast ratio on the website (see the `outline` color below,
 * darkened for WCAG AA — that fix is only real if every consumer reads the same
 * number) and the mobile apps just don't get it. Regenerate this file with:
 *
 *   node scripts/extract-theme.mjs   (from the repo root — see that file)
 *
 * ── Why colors, not the whole Tailwind config ────────────────────────────────
 * Radii, shadows, spacing and the rest are Tailwind-specific utility scales
 * with no meaning outside a className string. Colors and type sizes are the
 * two things a React Native StyleSheet needs as raw values, so those are what
 * got extracted. If NativeWind is adopted later, this file is what it reads
 * its theme from — the tokens don't change, only how a component reaches them.
 */

export const colors = {
  background: "#f7f9fd",
  error: "#ba1a1a",
  errorContainer: "#ffdad6",
  inverseOnSurface: "#eff1f5",
  inversePrimary: "#84cfff",
  inverseSurface: "#2d3134",
  onBackground: "#181c1f",
  onError: "#ffffff",
  onErrorContainer: "#93000a",
  onPrimary: "#ffffff",
  onPrimaryContainer: "#cfeaff",
  onPrimaryFixed: "#001e2e",
  onPrimaryFixedVariant: "#004c6c",
  onSecondary: "#ffffff",
  onSecondaryContainer: "#795a03",
  onSecondaryFixed: "#251a00",
  onSecondaryFixedVariant: "#5b4300",
  onSuccessContainer: "#166534",
  onSurface: "#181c1f",
  onSurfaceVariant: "#40484e",
  onTertiary: "#ffffff",
  onTertiaryContainer: "#ffe1c3",
  onTertiaryFixed: "#2b1700",
  onTertiaryFixedVariant: "#663e00",
  onWarningContainer: "#92400e",
  outline: "#6b7278",
  outlineVariant: "#bfc7cf",
  primary: "#005578",
  primaryContainer: "#0b6e99",
  primaryFixed: "#c7e7ff",
  primaryFixedDim: "#84cfff",
  secondary: "#785a02",
  secondaryContainer: "#ffd578",
  secondaryFixed: "#ffdf9d",
  secondaryFixedDim: "#eac167",
  success: "#16a34a",
  successContainer: "#f0fdf4",
  surface: "#f7f9fd",
  surfaceBright: "#f7f9fd",
  surfaceContainer: "#eceef2",
  surfaceContainerHigh: "#e6e8ec",
  surfaceContainerHighest: "#e0e3e6",
  surfaceContainerLow: "#f1f4f8",
  surfaceContainerLowest: "#ffffff",
  surfaceDim: "#d8dade",
  surfaceTint: "#00658e",
  surfaceVariant: "#e0e3e6",
  tertiary: "#714500",
  tertiaryContainer: "#915b06",
  tertiaryFixed: "#ffddb9",
  tertiaryFixedDim: "#ffb962",
  warning: "#f59e0b",
  warningContainer: "#fffbeb",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Type scale — mirrors tailwind.config.js's `fontSize` step-for-step (frozen
 * there against the actual distribution of 1,113 raw text-[NNpx] values the
 * website used to have; see that file's TYPO-01 comment for the history).
 *
 * React Native's `fontSize`/`lineHeight` are unitless numbers (density-
 * independent pixels), unlike the web's "40px" strings, so the px suffix is
 * stripped here rather than at every call site.
 */
export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  subhead: { fontSize: 18, lineHeight: 26 },
  title: { fontSize: 22, lineHeight: 30 },
  headline: { fontSize: 28, lineHeight: 36, letterSpacing: -0.28 },
  // letterSpacing is also unitless (px-equivalent) in RN, unlike the web's
  // "-0.02em" — approximated here against the 40px display size (40 * 0.02).
  display: { fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
} as const;

export type TypeToken = keyof typeof type;
