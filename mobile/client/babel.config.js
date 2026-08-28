module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // ── Static class blocks ────────────────────────────────────────────────
    // Without this the app does not bundle AT ALL — not a runtime warning, a
    // hard TransformError on the very first import of the entry point:
    //
    //   @formatjs/intl-pluralrules/polyfill.js: Static class blocks are not
    //   enabled. Please add `@babel/plugin-transform-class-static-block`.
    //
    // index.ts imports that polyfill deliberately as the first thing Metro
    // evaluates (see the comment there — Hermes ships without
    // Intl.PluralRules, and packages/core builds one at module load time), so
    // this failure takes down every screen, not one feature.
    //
    // babel-preset-expo does not apply this transform to node_modules, and
    // @formatjs ships the modern syntax. Hermes cannot parse a static class
    // block either way, so the transform has to happen at build time.
    plugins: ["@babel/plugin-transform-class-static-block"],
  };
};
