// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindcss from "eslint-plugin-tailwindcss";
import react from "eslint-plugin-react";

// Phase 0 of the UI/UX audit safety net (see ../FIX-PROMPT.md and
// ../UI-UX-AUDIT.md §5-§7). Two things on purpose, nothing more:
//   1. tailwindcss/no-contradicting-classname — catches a token + a manual
//      override fighting on the same element (TYPO-02, e.g. a size utility
//      alongside a literal text-[Npx] that silently wins).
//   2. no-restricted-syntax for the RTL-unsafe physical-direction utilities
//      (text-left/right, ml-*/mr-*/pl-*/pr-*, left-0/right-0, border-l/r).
// Only no-contradicting-classname is enabled from the plugin — NOT its full
// "recommended" set (classnames-order, no-custom-classname, ...), since those
// would flag hundreds of unrelated, intentional design-token classes and bury
// the ~50 real RTL violations this phase exists to surface. Same reasoning for
// skipping eslint's/typescript-eslint's own "recommended" rule sets (no-
// unused-vars, prefer-const, ...) — this file is a purpose-built RTL/Tailwind
// gate, not a general-purpose lint setup; react-hooks is registered (but with
// no extra rules enabled beyond what the codebase's own inline
// eslint-disable-next-line comments already assume) purely so those existing
// directives resolve instead of erroring as "rule not found".
//
// The no-restricted-syntax selectors match Literal AND TemplateElement nodes
// ANYWHERE in the file (not scoped to JSXAttribute[name.name='className']) —
// several of these physical-direction classes live in plain JS classname-map
// objects (e.g. RequestForm.tsx's `Notice` variant styles), not JSX attributes
// directly, and would be missed by a className-scoped selector.
const rtlMessage =
  "استخدم logical properties: text-start, ms-*, me-*, ps-*, pe-*, start-0, end-0, border-s, border-e";

function rtlRule(pattern) {
  return [
    { selector: `Literal[value=${pattern}]`, message: rtlMessage },
    { selector: `TemplateElement[value.raw=${pattern}]`, message: rtlMessage },
  ];
}

const typeScaleMessage =
  "استخدم توكن الحجم (text-caption/label/body/subhead/title/headline/display) بدل text-[Npx] — راجع الـ 7 درجات في tailwind.config.js";

function typeScaleRule(pattern) {
  return [
    { selector: `Literal[value=${pattern}]`, message: typeScaleMessage },
    { selector: `TemplateElement[value.raw=${pattern}]`, message: typeScaleMessage },
  ];
}

// TYPO-01/DS-03: bans text-[Npx] for N < 34 — exactly the range the type-scale
// codemod already snapped onto the 7 tokens (see tailwind.config.js's
// fontSize comment). Values >= 34px are a handful of deliberate hero/display
// numbers (animated KPI counters etc.) intentionally left as arbitrary
// values rather than compressed onto the scale — banning those too would
// just force a flood of eslint-disable comments on legitimate one-offs.
const typeScalePatterns = [
  "/\\btext-\\[(?:[1-9]|[12]\\d|3[0-3])px\\]/",
];

const rtlPatterns = [
  "/\\btext-left\\b/",
  "/\\btext-right\\b/",
  "/\\bml-[\\w./-]+/",
  "/\\bmr-[\\w./-]+/",
  "/\\bpl-[\\w./-]+/",
  "/\\bpr-[\\w./-]+/",
  // Excludes the endorsed compensating pattern for a physically-positioned
  // element (RTL-01, TopNav.tsx:257): keep the base left-0/right-0 and add
  // the OPPOSITE side's rtl: override in the same string
  // (`left-0 rtl:left-auto rtl:right-0`) — that combination is the fix, not
  // a violation of it. The lookbehind skips the "rtl:" variant token itself
  // (e.g. the "right-0" inside "rtl:right-0"); the lookahead skips the base
  // token when it's already compensated later in the same string. A bare,
  // uncompensated left-0/right-0 still matches either way.
  "/(?<!rtl:)\\bleft-0\\b(?![\\s\\S]*rtl:left-auto)/",
  "/(?<!rtl:)\\bright-0\\b(?![\\s\\S]*rtl:right-auto)/",
  "/\\bborder-l\\b/",
  "/\\bborder-r\\b/",
];

export default tseslint.config(
  { ignores: ["dist/**", "e2e/**", "tests/__baseline__/**", "test-results/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { tailwindcss, "react-hooks": reactHooks, react },
    settings: { tailwindcss: { config: "./tailwind.config.js" } },
    rules: {
      "tailwindcss/no-contradicting-classname": "error",
      "no-restricted-syntax": [
        "error",
        ...rtlPatterns.flatMap(rtlRule),
        ...typeScalePatterns.flatMap(typeScaleRule),
      ],
      // CMP-15: a hardcoded JSX text literal is invisible to `lib/i18n` —
      // it renders in whatever language it was typed in regardless of the
      // active locale. Only flags JSX children text (not attributes), and
      // allowlists punctuation/symbols that carry no language (digits,
      // separators, arrows) so this doesn't drown in unrelated noise.
      "react/jsx-no-literals": [
        "error",
        {
          allowedStrings: [
            "·", "•", "-", "–", "—", "/", ":", ",", ".", "%", "٪", "*",
            "(", ")", "[", "]", "\"", "'", "«", "»", "\".", ").",
            "★", "☆", "→", "←", "×", "+", "@", "#", "©", "−",
            "“", "”", "”.", "‘", "’", "⚠️",
            // Technical identifiers — same in every locale, not translatable
            // content (CMP-15 targets messages, not status codes, env-var
            // names, or route paths shown in <code>). The brand name itself
            // ("Al Assema" / "العاصمة") IS translated — see i18n `brand_name`.
            "404", "VITE_API_URL", "/terms", "/privacy",
          ],
          ignoreProps: true,
        },
      ],
    },
  }
);
