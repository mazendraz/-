// Design tokens ported 1:1 from the approved Stitch mockups
// (stitch_al_asima_command_center/al_asima/DESIGN.md — "Executive Minimalist").
// Do not hand-tune these; if a screen needs a color/size the mockups don't have,
// that's a design decision, not a coding one — flag it instead of inventing one.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f7f9fb",
        "on-background": "#191c1e",
        surface: "#f7f9fb",
        "surface-dim": "#d8dadc",
        "surface-bright": "#f7f9fb",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f4f6",
        "surface-container": "#eceef0",
        "surface-container-high": "#e6e8ea",
        "surface-container-highest": "#e0e3e5",
        "surface-variant": "#e0e3e5",
        "surface-tint": "#515f78",
        "on-surface": "#191c1e",
        "on-surface-variant": "#44474d",
        "inverse-surface": "#2d3133",
        "inverse-on-surface": "#eff1f3",
        outline: "#75777e",
        "outline-variant": "#c5c6cd",
        primary: "#000000",
        "on-primary": "#ffffff",
        "primary-container": "#0d1c32",
        "on-primary-container": "#76849f",
        "inverse-primary": "#b9c7e4",
        "primary-fixed": "#d6e3ff",
        "primary-fixed-dim": "#b9c7e4",
        "on-primary-fixed": "#0d1c32",
        "on-primary-fixed-variant": "#39475f",
        secondary: "#775a19",
        "on-secondary": "#ffffff",
        "secondary-container": "#fed488",
        "on-secondary-container": "#785a1a",
        "secondary-fixed": "#ffdea5",
        "secondary-fixed-dim": "#e9c176",
        "on-secondary-fixed": "#261900",
        "on-secondary-fixed-variant": "#5d4201",
        tertiary: "#000000",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#111c2d",
        "on-tertiary-container": "#79849a",
        "tertiary-fixed": "#d8e3fb",
        "tertiary-fixed-dim": "#bcc7de",
        "on-tertiary-fixed": "#111c2d",
        "on-tertiary-fixed-variant": "#3c475a",
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        // Was missing entirely — font-label-lg/text-label-lg were already
        // used in several places (Header.tsx's "Notifications" panel title,
        // ReportsPage.tsx, PricingIntelligencePage.tsx's "By Category"/"By
        // Provider" headers) but generated no CSS, silently falling back to
        // browser-default text styling. Sized one step up from label-md,
        // matching body-sm's 14px/20px so it reads as a section title
        // rather than an all-caps eyebrow — these usages are title-case
        // panel headers, not the uppercase/tracked label-md treatment.
        "label-lg": ["14px", { lineHeight: "20px", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "mono-data": ["14px", { lineHeight: "20px", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      spacing: {
        base: "8px",
        gutter: "24px",
        "component-padding-x": "16px",
        "component-padding-y": "12px",
        "section-gap": "48px",
        "container-margin": "32px",
      },
      maxWidth: {
        canvas: "1440px",
      },
      boxShadow: {
        // The DESIGN.md "Interactive State" hover lift — the only shadow this
        // system allows. Everything else uses 1px borders (Tonal Layering).
        lift: "0 4px 12px rgba(10, 25, 47, 0.04)",
      },
    },
  },
  plugins: [],
};
