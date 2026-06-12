import { useState } from "react";
import { Link } from "react-router-dom";
import { useCompanies, useCategoriesWithCounts } from "../lib/catalog";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

type Priority = "rating" | "projects" | "reviews";

const PRIORITIES: { key: Priority; icon: string; titleKey: StringKey; descKey: StringKey }[] = [
  { key: "rating", icon: "workspace_premium", titleKey: "guided_p1_title", descKey: "guided_p1_desc" },
  { key: "projects", icon: "construction", titleKey: "guided_p2_title", descKey: "guided_p2_desc" },
  { key: "reviews", icon: "reviews", titleKey: "guided_p3_title", descKey: "guided_p3_desc" },
];

export default function GuidedStart() {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  usePageMeta("Find Your Match | Al Assema", "Answer two quick questions and get matched with the right company for your project in the New Administrative Capital.");
  const { locale } = useLocale();
  const COMPANIES = useCompanies();
  const SERVICE_CATEGORIES = useCategoriesWithCounts();

  // Curated shortlist
  const matches = (() => {
    if (!category || !priority) return [];
    const inCat = COMPANIES.filter((c) => c.category === category);
    const pool = inCat.length > 0 ? inCat : COMPANIES;
    const sorters: Record<Priority, (a: typeof pool[number], b: typeof pool[number]) => number> = {
      rating: (a, b) => b.rating - a.rating,
      projects: (a, b) => b.completedProjects - a.completedProjects,
      reviews: (a, b) => b.reviewCount - a.reviewCount,
    };
    return [...pool].sort(sorters[priority]).slice(0, 3);
  })();

  const catLabel = SERVICE_CATEGORIES.find((c) => c.slug === category)?.label;

  function reset() {
    setStep(0);
    setCategory(null);
    setPriority(null);
  }

  return (
    <div className="bg-surface min-h-screen pt-20 md:pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-5">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${s <= step ? "bg-primary" : "bg-surface-container-high"}`} />
          ))}
        </div>

        {/* Back */}
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 text-[13px] font-bold text-outline hover:text-primary transition-colors mb-4">
            <span className="material-symbols-outlined text-[18px] rtl-flip">arrow_back</span> {t(locale, "common_back")}
          </button>
        )}

        {/* ── Step 0: Category ── */}
        {step === 0 && (
          <div className="page-enter">
            <p className="text-[12px] font-black uppercase tracking-wider text-primary mb-2">{t(locale, "guided_step1")}</p>
            <h1 className="font-black text-[28px] md:text-[34px] text-on-surface tracking-tight leading-tight mb-2">
              {t(locale, "guided_q1_title")}
            </h1>
            <p className="text-[15px] text-outline mb-7 leading-relaxed">
              {t(locale, "guided_q1_sub")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_CATEGORIES.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => { setCategory(cat.slug); setStep(1); }}
                  className="group bg-surface-container-lowest rounded-2xl p-5 shadow-bloom card-lift text-left touch-press"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                    <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                  </div>
                  <p className="font-bold text-[15px] text-on-surface leading-snug mb-0.5">{cat.label}</p>
                  <p className="text-[12px] text-outline">{cat.count} {t(locale, "common_companies")}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Priority ── */}
        {step === 1 && (
          <div className="page-enter">
            <p className="text-[12px] font-black uppercase tracking-wider text-primary mb-2">{t(locale, "guided_step2")}</p>
            <h1 className="font-black text-[28px] md:text-[34px] text-on-surface tracking-tight leading-tight mb-2">
              {t(locale, "guided_q2_title")}
            </h1>
            <p className="text-[15px] text-outline mb-7 leading-relaxed">
              {t(locale, "guided_q2_sub_a")} <span className="font-bold text-on-surface">{catLabel}</span> {t(locale, "guided_q2_sub_b")}
            </p>
            <div className="space-y-3">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPriority(p.key); setStep(2); }}
                  className="group w-full flex items-center gap-4 bg-surface-container-lowest rounded-2xl p-5 shadow-bloom card-lift text-left touch-press"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                    <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>{p.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[16px] text-on-surface mb-0.5">{t(locale, p.titleKey)}</p>
                    <p className="text-[13px] text-outline">{t(locale, p.descKey)}</p>
                  </div>
                  <span className="material-symbols-outlined text-outline group-hover:text-primary group-hover:translate-x-1 transition-all rtl-flip">arrow_forward</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Results ── */}
        {step === 2 && (
          <div className="page-enter">
            <p className="text-[12px] font-black uppercase tracking-wider text-primary mb-2">{t(locale, "guided_matches")}</p>
            <h1 className="font-black text-[26px] md:text-[32px] text-on-surface tracking-tight leading-tight mb-2">
              {matches.length > 0 ? t(locale, "guided_shortlist") : t(locale, "guided_no_match")}
            </h1>
            <p className="text-[15px] text-outline mb-7 leading-relaxed">
              {catLabel} {t(locale, "guided_ranked_a")} {t(locale, PRIORITIES.find((p) => p.key === priority)!.titleKey)}.
            </p>

            <div className="space-y-3 mb-6">
              {matches.map((c, i) => (
                <Link
                  key={c.id}
                  to={`/companies/${c.slug}`}
                  className="group block bg-surface-container-lowest rounded-2xl shadow-bloom card-lift overflow-hidden touch-press"
                >
                  {/* Best match ribbon */}
                  {i === 0 && (
                    <div className="bg-primary text-on-primary text-[11px] font-black uppercase tracking-wider px-4 py-1.5 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      {t(locale, "guided_best_match")}
                    </div>
                  )}
                  <div className="flex items-center gap-4 p-4">
                    <img src={c.logo} alt="" className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[16px] text-on-surface group-hover:text-primary transition-colors truncate">{c.name}</p>
                      <p className="text-[12px] text-outline mb-1 truncate">{c.categoryLabel}</p>
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="flex items-center gap-0.5 text-secondary font-bold">
                          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          {c.rating}
                        </span>
                        <span className="text-outline">· {c.reviewCount} {t(locale, "common_reviews")}</span>
                        <span className="text-outline">· {c.completedProjects} {t(locale, "common_projects")}</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-outline group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 rtl-flip">arrow_forward</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={category ? `/services/${category}` : "/companies"}
                className="flex-1 text-center bg-surface-container text-on-surface py-3.5 rounded-xl font-bold text-[15px] hover:bg-surface-container-high transition-colors touch-press"
              >
                {t(locale, "guided_see_all")} {catLabel}
              </Link>
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-on-primary py-3.5 rounded-xl font-bold text-[15px] hover:bg-primary-container transition-colors touch-press btn-press"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                {t(locale, "guided_start_over")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
