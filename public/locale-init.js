// Apply the saved locale's direction/language to <html> before React hydrates, so
// a visitor never sees a flash of the wrong layout (FOUC). Arabic (RTL) is the
// default — set on <html> in index.html — so here we only need to flip to English
// (LTR) when the visitor has explicitly saved that preference. Kept as an external
// file (not inline) so the Content-Security-Policy can use `script-src 'self'` with
// NO 'unsafe-inline' — which is what actually makes the CSP block injected inline
// scripts. Runs synchronously in <head> before paint.
try {
  var l = localStorage.getItem("al-assema-locale");
  if (l === "en") {
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
  }
} catch (e) {}
