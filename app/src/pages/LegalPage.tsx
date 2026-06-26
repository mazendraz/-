import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { fetchLegalPages } from "../lib/settings";
import { isApiConfigured } from "../lib/api";

// Terms / Privacy. Content is admin-managed (Settings) and fetched on demand.
// Rendered as plain text (React escapes it) — no HTML injection from the stored value.
export default function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { locale } = useLocale();
  const title = t(locale, kind === "terms" ? "footer_terms" : "footer_privacy");
  usePageMeta(`${title} | Al Assema`);

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(isApiConfigured());

  useEffect(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    let active = true;
    fetchLegalPages()
      .then((p) => { if (active) setContent(kind === "terms" ? p.terms : p.privacy); })
      .catch(() => { if (active) setContent(""); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);

  return (
    <div className="bg-surface min-h-screen pt-24 pb-16 px-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-outline mb-6 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
          <span className="material-symbols-outlined text-[14px] rtl-flip">chevron_right</span>
          <span className="text-on-surface">{title}</span>
        </div>
        <h1 className="font-black text-[28px] md:text-headline-lg text-on-surface mb-6 tracking-tight">{title}</h1>

        {loading ? (
          <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        ) : content && content.trim() ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-on-surface-variant">{content}</div>
        ) : (
          <p className="text-[15px] text-outline">{t(locale, "legal_unpublished")}</p>
        )}
      </div>
    </div>
  );
}
