import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCompanies, useCategoriesWithCounts } from "../lib/catalog";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, tCount, type StringKey } from "../lib/i18n";
import { formatRating } from "../lib/format";
import Icon from "../components/Icon";

type Priority = "rating" | "projects" | "reviews";

const PRIORITIES: { key: Priority; icon: string; titleKey: StringKey; descKey: StringKey }[] = [
  { key: "rating", icon: "workspace_premium", titleKey: "guided_p1_title", descKey: "guided_p1_desc" },
  { key: "projects", icon: "construction", titleKey: "guided_p2_title", descKey: "guided_p2_desc" },
  { key: "reviews", icon: "reviews", titleKey: "guided_p3_title", descKey: "guided_p3_desc" },
];

// GS-05: a refresh used to restart the whole flow. sessionStorage (not
// localStorage) on purpose — these answers are for THIS visit's flow only,
// not something that should reappear weeks later on a different errand.
const STORAGE_KEY = "al-assema-guided-start";

function loadSaved(): { step: number; category: string | null; priority: Priority | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { step: 0, category: null, priority: null };
    const parsed = JSON.parse(raw);
    return {
      step: typeof parsed.step === "number" ? parsed.step : 0,
      category: typeof parsed.category === "string" ? parsed.category : null,
      priority: typeof parsed.priority === "string" ? parsed.priority : null,
    };
  } catch {
    return { step: 0, category: null, priority: null };
  }
}

export default function GuidedStart() {
  const [step, setStep] = useState(() => loadSaved().step);
  const [category, setCategory] = useState<string | null>(() => loadSaved().category);
  const [priority, setPriority] = useState<Priority | null>(() => loadSaved().priority);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, category, priority })); }
    catch { /* storage unavailable (private mode) — the flow still works, just doesn't persist */ }
  }, [step, category, priority]);
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "meta_guided_title")} | ${t(locale, "brand_name")}`, t(locale, "meta_guided_desc"));
  const COMPANIES = useCompanies();
  const SERVICE_CATEGORIES = useCategoriesWithCounts();

  // Curated shortlist
  const matches = (() => {
    if (!category || !priority) return [];
    const inCat = COMPANIES.filter((c) => c.categories.some((cc) => cc.slug === category));
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

  // GS-04: step changes were silent to a screen reader — moving focus to the
  // new step's own heading is what actually gets it announced (more reliable
  // than an aria-live region for content that wasn't previously in the DOM).
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  return (
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-5">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full flex-1 transition-colors duration-slow ${s <= step ? "bg-primary" : "bg-surface-container-high"}`} />
          ))}
        </div>

        {/* Back */}
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 text-label font-bold text-outline hover:text-primary transition-colors mb-4">
            <Icon name="arrow_back" className="text-subhead rtl-flip" /> {t(locale, "common_back")}
          </button>
        )}

        {/* ── Step 0: Category ── */}
        {step === 0 && (
          <div className="page-enter">
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-primary mb-2">{t(locale, "guided_step1")}</p>
            <h1 ref={stepHeadingRef} tabIndex={-1} className="font-black text-headline md:text-[34px] text-on-surface tracking-tight leading-tight mb-2 focus:outline-none">
              {t(locale, "guided_q1_title")}
            </h1>
            <p className="text-body text-outline mb-7 leading-relaxed">
              {t(locale, "guided_q1_sub")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_CATEGORIES.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => { setCategory(cat.slug); setStep(1); }}
                  className="group bg-surface-container-lowest rounded-2xl p-5 shadow-bloom card-lift text-start touch-press"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                    <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{cat.icon}</span>
                  </div>
                  <p className="font-bold text-body text-on-surface leading-snug mb-0.5">{cat.label}</p>
                  <p className="text-caption text-outline">{cat.count} {tCount(locale, "noun_company", cat.count)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Priority ── */}
        {step === 1 && (
          <div className="page-enter">
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-primary mb-2">{t(locale, "guided_step2")}</p>
            <h1 ref={stepHeadingRef} tabIndex={-1} className="font-black text-headline md:text-[34px] text-on-surface tracking-tight leading-tight mb-2 focus:outline-none">
              {t(locale, "guided_q2_title")}
            </h1>
            <p className="text-body text-outline mb-7 leading-relaxed">
              {t(locale, "guided_q2_sub_a")} <span className="font-bold text-on-surface">{catLabel}</span> {t(locale, "guided_q2_sub_b")}
            </p>
            <div className="space-y-3">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPriority(p.key); setStep(2); }}
                  className="group w-full flex items-center gap-4 bg-surface-container-lowest rounded-2xl p-5 shadow-bloom card-lift text-start touch-press"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                    <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{p.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-body text-on-surface mb-0.5">{t(locale, p.titleKey)}</p>
                    <p className="text-label text-outline">{t(locale, p.descKey)}</p>
                  </div>
                  <Icon name="arrow_forward" className="text-outline group-hover:text-primary group-hover:translate-x-1 transition rtl-flip" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Results ── */}
        {step === 2 && (
          <div className="page-enter">
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-primary mb-2">{t(locale, "guided_matches")}</p>
            <h1 ref={stepHeadingRef} tabIndex={-1} className="font-black text-headline md:text-headline text-on-surface tracking-tight leading-tight mb-2 focus:outline-none">
              {matches.length > 0 ? t(locale, "guided_shortlist") : t(locale, "guided_no_match")}
            </h1>
            <p className="text-body text-outline mb-7 leading-relaxed">
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
                    <div className="bg-primary text-on-primary text-caption font-black ltr:uppercase ltr:tracking-wider px-4 py-1.5 flex items-center gap-1.5">
                      <Icon name="star" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                      {t(locale, "guided_best_match")}
                    </div>
                  )}
                  <div className="flex items-center gap-4 p-4">
                    <img src={c.logo} alt="" className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" width={56} height={56} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-body text-on-surface group-hover:text-primary transition-colors truncate">{c.name}</p>
                      <p className="text-caption text-outline mb-1 truncate">{c.categoryLabel}</p>
                      <div className="flex items-center gap-2 text-caption">
                        <span className="flex items-center gap-0.5 text-secondary font-bold">
                          <Icon name="star" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                          {formatRating(locale, c.rating)}
                        </span>
                        <span className="text-outline">· {c.reviewCount} {t(locale, "common_reviews")}</span>
                        <span className="text-outline">· {c.completedProjects} {tCount(locale, "noun_project", c.completedProjects)}</span>
                      </div>
                    </div>
                    <Icon name="arrow_forward" className="text-outline group-hover:text-primary group-hover:translate-x-1 transition flex-shrink-0 rtl-flip" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={category ? `/services/${category}` : "/companies"}
                className="flex-1 text-center bg-surface-container text-on-surface py-3.5 rounded-xl font-bold text-body hover:bg-surface-container-high transition-colors touch-press"
              >
                {t(locale, "guided_see_all")} {catLabel}
              </Link>
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-on-primary py-3.5 rounded-xl font-bold text-body hover:bg-primary-container transition-colors touch-press btn-press"
              >
                <Icon name="restart_alt" className="text-subhead" />
                {t(locale, "guided_start_over")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
