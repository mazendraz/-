/**
 * Last-resort screen for when React itself has thrown.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ 🔴 DO NOT MOVE THESE STRINGS INTO i18n.ts. DO NOT MAKE THIS CALL t().    ║
 * ║                                                                          ║
 * ║ The phase-7 i18n sweep migrated every other component to `t()`. This one ║
 * ║ is EXEMPT ON PURPOSE and is listed as such in the i18n guard test. It is ║
 * ║ not an oversight, and "finishing the job" here would break the only      ║
 * ║ screen that still has to render after everything else has failed.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── This file has ZERO project dependencies. Keep it that way. ────────────────
 * It renders from an <ErrorBoundary> that sits ABOVE LocaleProvider and the
 * router in main.tsx. If the thing that crashed was the locale provider, the
 * settings fetch, or the router, then anything this screen touches could throw
 * for the same reason — and an error screen that crashes is a blank white page.
 *
 * So, deliberately:
 *   • strings are inline constants, not i18n / t()
 *   • language comes from navigator.language, not LocaleContext
 *   • no fetch, no settings, no dynamic links, no hooks
 *   • styles are inline, not Tailwind classes (the stylesheet may not have loaded)
 *
 * StatusScreen.tsx is the richer screen for `maintenance` and `offline`, where the
 * app is healthy and those dependencies are safe to use.
 */

const COPY = {
  en: {
    title: "Something went wrong",
    body: "The page hit an unexpected error. Reloading usually fixes it.",
    reload: "Reload page",
    home: "Back to home",
    details: "Technical details",
  },
  ar: {
    title: "حصل خطأ غير متوقع",
    body: "الصفحة واجهت مشكلة. غالبًا إعادة التحميل بتحل الموضوع.",
    reload: "أعد تحميل الصفحة",
    home: "الرجوع للرئيسية",
    details: "تفاصيل تقنية",
  },
};

/** Read the language directly — LocaleContext may be exactly what crashed. */
function pickLang(): "en" | "ar" {
  try {
    return navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
  } catch {
    return "en";
  }
}

export default function CrashScreen({ error, showDetails }: {
  error?: unknown;
  /** Stack traces are for admins / ?debug=1 only — never for the public. */
  showDetails?: boolean;
}) {
  const lang = pickLang();
  const c = COPY[lang];
  const rtl = lang === "ar";

  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}`
      : error != null
        ? String(error)
        : "";

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#faf8f5",
        color: "#1c1b1a",
        fontFamily: rtl
          ? "'Cairo', 'Segoe UI', system-ui, sans-serif"
          : "'Inter', 'Segoe UI', system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
        <div
          aria-hidden
          style={{
            width: "72px",
            height: "72px",
            margin: "0 auto 20px",
            borderRadius: "50%",
            background: "#fdecea",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "34px",
            lineHeight: 1,
          }}
        >
          ⚠️
        </div>

        <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 10px" }}>{c.title}</h1>
        <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#4a4644", margin: "0 0 24px" }}>
          {c.body}
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "11px 22px",
              borderRadius: "12px",
              border: "none",
              background: "#8a6a4f",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {c.reload}
          </button>
          {/* A plain anchor, not <Link> — the router may be what crashed. */}
          <a
            href="/"
            style={{
              padding: "11px 22px",
              borderRadius: "12px",
              border: "1px solid #dcd5cd",
              background: "transparent",
              color: "#1c1b1a",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
              fontFamily: "inherit",
            }}
          >
            {c.home}
          </a>
        </div>

        {showDetails && detail && (
          <details style={{ marginTop: "28px", textAlign: rtl ? "right" : "left" }}>
            <summary style={{ cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "#4a4644" }}>
              {c.details}
            </summary>
            <pre
              dir="ltr"
              style={{
                marginTop: "10px",
                padding: "12px",
                borderRadius: "10px",
                background: "#f0ebe5",
                color: "#3a3634",
                fontSize: "12px",
                lineHeight: 1.6,
                overflowX: "auto",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
