---
name: Capital Prestige
colors:
  surface: '#f7f9fd'
  surface-dim: '#d8dade'
  surface-bright: '#f7f9fd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f8'
  surface-container: '#eceef2'
  surface-container-high: '#e6e8ec'
  surface-container-highest: '#e0e3e6'
  on-surface: '#181c1f'
  on-surface-variant: '#40484e'
  inverse-surface: '#2d3134'
  inverse-on-surface: '#eff1f5'
  outline: '#70787f'
  outline-variant: '#bfc7cf'
  surface-tint: '#00658e'
  primary: '#005578'
  on-primary: '#ffffff'
  primary-container: '#0b6e99'
  on-primary-container: '#cfeaff'
  inverse-primary: '#84cfff'
  secondary: '#785a02'
  on-secondary: '#ffffff'
  secondary-container: '#ffd578'
  on-secondary-container: '#795a03'
  tertiary: '#714500'
  on-tertiary: '#ffffff'
  tertiary-container: '#915b06'
  on-tertiary-container: '#ffe1c3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c7e7ff'
  primary-fixed-dim: '#84cfff'
  on-primary-fixed: '#001e2e'
  on-primary-fixed-variant: '#004c6c'
  secondary-fixed: '#ffdf9d'
  secondary-fixed-dim: '#eac167'
  on-secondary-fixed: '#251a00'
  on-secondary-fixed-variant: '#5b4300'
  tertiary-fixed: '#ffddb9'
  tertiary-fixed-dim: '#ffb962'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#663e00'
  background: '#f7f9fd'
  on-background: '#181c1f'
  surface-variant: '#e0e3e6'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 60px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  display-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  stack-xl: 64px
---

## Brand & Style

This design system establishes a premium, authoritative digital presence for the New Administrative Capital. The aesthetic is a sophisticated fusion of **High-End Minimalist** and **Corporate Modern**, drawing inspiration from the clarity of Apple and the warmth of Airbnb. 

The target audience includes high-net-worth investors, multinational corporations, and residents seeking a futuristic lifestyle. The UI must evoke a sense of permanence, security, and visionary progress. Key visual pillars include:
- **Spaciousness:** Generous white space to signal luxury and reduce cognitive load.
- **Precision:** Perfect alignment and systematic grids inspired by Linear.
- **Warmth:** Subtle gold accents and soft shadows to balance the technical blue, ensuring the platform feels inviting rather than clinical.
- **Modernity:** A focus on high-quality imagery and crisp, functional interface elements that reflect a technology-driven city.

## Colors

The palette is anchored by **Capital Blue (#0B6E99)**, representing trust and institutional strength, and **Royal Gold (#C8A24B)**, used sparingly for premium accents, highlights, and calls to action. 

The neutral foundation utilizes a "Cool Slate" scale to maintain a crisp, modern feel. 
- **Backgrounds:** Use pure white for primary content areas and the light slate for section differentiation or "wells."
- **Typography:** Primary text uses a deep charcoal rather than pure black to soften the reading experience while maintaining high contrast.
- **Borders:** Use subtle, low-opacity strokes to define structure without adding visual noise.

## Typography

The typography system prioritizes bilingual legibility and a clear hierarchy. 
- **Plus Jakarta Sans** is used for headlines and labels to provide a friendly, modern, and high-end geometric look. 
- **Inter** is used for body copy for its exceptional readability in dense information environments.
- **Large Headings:** Display and Headline levels should use tighter letter-spacing and bold weights to command attention.
- **Arabic Support:** Both fonts are selected for their excellent compatibility with contemporary Arabic typefaces. When rendering Arabic, ensure line heights are increased by roughly 15% to accommodate character ascenders and descenders.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. The philosophy is "breathable luxury"—margins and gutters are generous to prevent the UI from feeling cramped.

- **Grid:** On desktop, the central container is capped at 1280px to maintain readability on ultra-wide monitors.
- **Vertical Rhythm:** Spacing follows a 4px baseline. Use `stack-lg` (32px) for spacing between related components and `stack-xl` (64px) for spacing between major page sections.
- **Reflow:** On tablet, gutters should reduce to 20px. On mobile, side margins collapse to 16px to maximize real estate for property cards and maps.

## Elevation & Depth

To achieve an Airbnb/Stripe aesthetic, depth is created through **Ambient Shadows** and **Tonal Layering** rather than heavy borders.

- **Surface Tiers:** Background is pure white (#FFFFFF). Cards and modals sit on top with a subtle elevation.
- **Shadow Profile:** Use a "Soft Bloom" shadow—very low opacity (4-8%) with a large blur radius (20px-40px) and a slight Y-axis offset. This makes elements appear to float naturally.
- **Interaction:** On hover, cards should subtly lift (increase Y-offset and blur) to provide tactile feedback without being jarring.
- **Glassmorphism:** Use for persistent headers and navigation bars. Apply a `backdrop-filter: blur(12px)` with a 90% white background to maintain context while scrolling.

## Shapes

The shape language is consistently **Rounded**, echoing the modern architectural curves of the New Capital. 
- **Standard Elements:** Buttons, input fields, and small tags use a 0.5rem (8px) radius.
- **Cards & Modals:** Large containers use `rounded-lg` (16px) or `rounded-xl` (24px) to create a soft, premium "lifestyle" feel.
- **Icons:** Use "Line" style icons with slightly rounded caps and joins to match the typography's softness.

## Components

### Buttons
- **Primary:** Capital Blue background, white text, 8px radius. High-weight Jakarta Sans text.
- **Secondary:** White background, Capital Blue border (1px), Blue text.
- **Tertiary:** Royal Gold background, white text. Reserved for "Luxury" tier listings or special conversion points.

### Cards
- **Property Cards:** Full-width imagery with a 16px corner radius. Metadata (price, location) uses clear `body-md` typography. Use a subtle shadow instead of a border.
- **Stats Cards:** Subtle slate background (#F8FAFC) with large `headline-md` numbers in Capital Blue.

### Input Fields
- Focus states should use a 2px Royal Gold outer ring with low opacity to signify "premium" selection.
- Labels are always `label-md` in text-secondary color, positioned above the field.

### Chips & Tags
- Used for property status (e.g., "Ready to Move," "Under Construction"). 
- Status tags use a light tint of the status color (e.g., Success Green at 10% opacity) with dark text.

### Navigation
- A clean, persistent top bar with a glassmorphism effect.
- The "Search" component should be a prominent, rounded-pill shape with a subtle shadow, mimicking the ease of search on global travel platforms.