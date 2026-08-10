/** @type {import('tailwindcss').Config} */
export default {
  // DS-02: was "class" with zero `dark:` variants anywhere and no dark
  // palette — dead config that signals a theme exists when it doesn't. See
  // index.html's `color-scheme`/`theme-color` for the other half of this fix.
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Tailwind's default opacity scale only has stops at 0,5,10,15…100 — a
      // bare modifier outside that scale (e.g. bg-primary/6) generates NO CSS
      // rule at all, silently. These are the non-scale values actually used
      // across the app (see UI-UX-AUDIT.md DS-01); extending the scale here
      // keeps every call site unchanged instead of switching them to the
      // bracket syntax (bg-primary/[0.06]).
      opacity: { 6: "0.06", 8: "0.08", 12: "0.12", 14: "0.14", 18: "0.18", 68: "0.68", 72: "0.72", 96: "0.96", 97: "0.97" },
      colors: {
        "on-primary-fixed": "#001e2e",
        "on-tertiary-fixed": "#2b1700",
        "inverse-on-surface": "#eff1f5",
        "on-primary-container": "#cfeaff",
        "surface-container-high": "#e6e8ec",
        "surface-bright": "#f7f9fd",
        "inverse-surface": "#2d3134",
        surface: "#f7f9fd",
        "surface-container": "#eceef2",
        "on-background": "#181c1f",
        "on-tertiary-fixed-variant": "#663e00",
        "on-secondary-container": "#795a03",
        "on-surface-variant": "#40484e",
        "inverse-primary": "#84cfff",
        "surface-container-lowest": "#ffffff",
        "on-error": "#ffffff",
        // Darkened from #70787f to clear WCAG AA (4.5:1) for normal text.
        //
        // `text-outline` is the product's secondary text colour — result counts,
        // captions, metadata, timestamps, empty-state copy — so it is on nearly
        // every screen. Measured: #70787f gave 4.26:1 on `surface` (#f7f9fd) and
        // 4.49:1 on `surface-container-lowest` (#ffffff). The second number is
        // why nobody caught it: failing by one hundredth of a point looks like
        // passing. #6b7278 measures 4.63:1 and 4.88:1 — comfortably over on both
        // grounds, and five units darker is not a visible change in hierarchy.
        outline: "#6b7278",
        "tertiary-fixed-dim": "#ffb962",
        "surface-container-low": "#f1f4f8",
        error: "#ba1a1a",
        "surface-dim": "#d8dade",
        "on-secondary-fixed-variant": "#5b4300",
        "primary-fixed-dim": "#84cfff",
        "tertiary-container": "#915b06",
        "on-tertiary-container": "#ffe1c3",
        "surface-container-highest": "#e0e3e6",
        "surface-variant": "#e0e3e6",
        "on-primary-fixed-variant": "#004c6c",
        "tertiary-fixed": "#ffddb9",
        "surface-tint": "#00658e",
        primary: "#005578",
        "secondary-fixed": "#ffdf9d",
        "primary-container": "#0b6e99",
        "on-primary": "#ffffff",
        tertiary: "#714500",
        "error-container": "#ffdad6",
        background: "#f7f9fd",
        "outline-variant": "#bfc7cf",
        "on-tertiary": "#ffffff",
        "on-secondary-fixed": "#251a00",
        "on-secondary": "#ffffff",
        "on-error-container": "#93000a",
        "secondary-fixed-dim": "#eac167",
        "secondary-container": "#ffd578",
        secondary: "#785a02",
        "on-surface": "#181c1f",
        "primary-fixed": "#c7e7ff",
        // Semantic status colours (DS-07) — named for what they MEAN
        // (a company being busy, a submission succeeding), not for the
        // stock Tailwind swatch they used to be reached through directly
        // (bg-amber-500, text-green-600, ...). `info` isn't a new colour:
        // the existing `primary` already served that role everywhere
        // (e.g. the RequestForm "no account needed" Notice), so there's
        // nothing to rename there — only warning/success needed real names.
        warning: "#f59e0b",
        "warning-container": "#fffbeb",
        "on-warning-container": "#92400e",
        success: "#16a34a",
        "success-container": "#f0fdf4",
        "on-success-container": "#166534",
      },
      // No borderRadius override here on purpose (DS-04): the previous
      // extension redefined DEFAULT/lg/xl/full to Tailwind's own stock
      // values (a no-op). The real scale in use is Tailwind's own
      // lg(8px)/xl(12px)/2xl(16px)/full — see index.css for the rare
      // arbitrary radii that used to bypass it.
      spacing: {
        "stack-xl": "64px",
        "container-max": "1280px",
        "stack-md": "16px",
        "stack-lg": "32px",
        "stack-sm": "8px",
        "margin-mobile": "16px",
        gutter: "24px",
        unit: "4px",
        "margin-desktop": "48px",
      },
      maxWidth: {
        "container-max": "1280px",
      },
      // No boxShadow extension here (DS-05): `card-hover` had zero call
      // sites, and `bloom` was always shadowed by the hand-written
      // `.shadow-bloom` rule in index.css (same class name, later in the
      // compiled stylesheet always wins) — the config entry never actually
      // took effect. The real elevation scale lives in index.css:
      // .shadow-bloom/-hover and .shadow-soft/-hover.
      // Brand typography (RTL-10): direction-aware stacks, not two separate
      // "Arabic" and "Latin" font sets. Latin glyphs resolve from the first
      // family in each stack; Arabic has no glyphs there, so it falls through
      // to the Arabic-capable family — Alexandria for display/headings
      // (deliberately, matching Cairo's weight/x-height reasonably well for a
      // heading face), Cairo for body text (matches index.css's
      // `[dir="rtl"] body` rule). Previously both stacks ended at
      // "sans-serif" with no Arabic-capable fallback at all, so every Arabic
      // heading silently rendered in the OS's generic UI font.
      // The seven aliases that used to live here (headline-lg-mobile,
      // label-sm, body-lg, label-md, headline-lg, display-xl-mobile,
      // display-xl, headline-md, body-md) were all identical to one of these
      // two families (TYPO-03) — deleted; the fontSize scale below carries
      // weight now, so nothing else needs them.
      fontFamily: {
        display: ["Plus Jakarta Sans", "Alexandria", "sans-serif"],
        sans: ["Inter", "Cairo", "sans-serif"],
      },
      // Type scale (TYPO-01/DS-03): 7 steps, frozen against the actual
      // distribution of the 1,113 raw text-[NNpx] values this replaces (see
      // UI-UX-AUDIT.md TYPO-01). Each step bundles its line-height so
      // "text-body" alone gives correct leading — no separate leading-[…]
      // needed. Deliberately does NOT bundle fontWeight: nearly every call
      // site already carries its own font-bold/font-semibold/etc., and
      // baking a weight into the token too would silently refight that
      // (exactly the TYPO-02 bug this phase exists to remove), depending on
      // which utility Tailwind happens to emit later in the stylesheet.
      // A handful of genuine hero/display numbers (34-64px, ~55 sites,
      // mostly animated KPI counters) are deliberately left as arbitrary
      // values rather than compressed onto this scale — snapping e.g. a
      // 64px counter down to a 40px token would be a visible regression for
      // a one-off display number, not a fix for a missing system.
      fontSize: {
        caption: ["12px", { lineHeight: "16px" }],
        label: ["13px", { lineHeight: "18px" }],
        body: ["15px", { lineHeight: "22px" }],
        subhead: ["18px", { lineHeight: "26px" }],
        title: ["22px", { lineHeight: "30px" }],
        headline: ["28px", { lineHeight: "36px", letterSpacing: "-0.01em" }],
        display: ["40px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      // Motion duration scale (ANIM-08): call sites had accreted 150/200/250/
      // 300/500/700ms with no logic to which got which — two visually
      // identical hover-zoom images could land on 300ms and 700ms depending
      // on which page copied which. Three tokens instead: fast (icon/color
      // micro-interactions), base (the vast majority — hover/press states),
      // slow (deliberate emphasis — image zoom, progress fills, reveals).
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "350ms",
      },
    },
  },
  plugins: [],
};
