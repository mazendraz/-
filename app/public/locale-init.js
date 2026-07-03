// Apply the saved locale's direction/language to <html> before React hydrates, so
// an Arabic (RTL) visitor never sees a flash of LTR layout (FOUC). Kept as an
// external file (not inline) so the Content-Security-Policy can use
// `script-src 'self'` with NO 'unsafe-inline' — which is what actually makes the
// CSP block injected inline scripts. Runs synchronously in <head> before paint.
try {
  var l = localStorage.getItem("al-assema-locale");
  if (l === "ar") {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
  }
} catch (e) {}
