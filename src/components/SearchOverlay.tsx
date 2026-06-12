import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  search,
  getPopularSearches,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  type SearchResult,
} from "../lib/search";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ open, onClose }: Props) {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => search(query), [query]);
  const popular = getPopularSearches();

  // Focus input + lock scroll when opened
  useEffect(() => {
    if (open) {
      setRecent(getRecentSearches());
      setQuery("");
      setActiveIndex(0);
      document.body.style.overflow = "hidden";
      // Delay focus until after the open animation paints
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
  }, [open]);

  // Reset active index when results change
  useEffect(() => setActiveIndex(0), [query]);

  function go(to: string, term?: string) {
    if (term) addRecentSearch(term);
    onClose();
    navigate(to);
  }

  function pickResult(r: SearchResult) {
    go(r.to, r.label);
  }

  function runTextSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    addRecentSearch(trimmed);
    const first = search(trimmed)[0];
    onClose();
    // Go to first match if any; otherwise to companies page (browse all)
    navigate(first ? first.to : "/companies");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (results.length === 0) {
      if (e.key === "Enter") runTextSearch(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickResult(results[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" role="dialog" aria-modal aria-label={t(locale, "search_placeholder")}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-on-background/50 backdrop-blur-md animate-[pageEnter_0.2s_ease]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl mx-auto mt-0 sm:mt-20 px-3 sm:px-0">
        <div className="bg-surface-container-lowest rounded-none sm:rounded-3xl shadow-2xl overflow-hidden
                        h-screen sm:h-auto sm:max-h-[75vh] flex flex-col page-enter">

          {/* Search input row */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-outline-variant/20 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
            <span className="material-symbols-outlined text-primary text-[24px]">search</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t(locale, "search_overlay_placeholder")}
              className="flex-1 bg-transparent border-none outline-none text-[17px] text-on-surface placeholder:text-outline/70"
              style={{ fontSize: "16px" }}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query && (
              <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="p-1 rounded-full hover:bg-surface-container transition-colors" aria-label={t(locale, "common_clear")}>
                <span className="material-symbols-outlined text-outline text-[20px]">close</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="ms-1 text-[14px] font-bold text-outline hover:text-primary transition-colors px-2 py-1 rounded-lg"
            >
              {t(locale, "search_cancel")}
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* RESULTS */}
            {query && results.length > 0 && (
              <ul className="py-2">
                {results.map((r, i) => (
                  <li key={`${r.type}-${r.to}-${r.label}`}>
                    <button
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => pickResult(r)}
                      className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-start transition-colors
                        ${i === activeIndex ? "bg-primary/6" : "hover:bg-surface-container/60"}`}
                    >
                      {/* Icon / image */}
                      {r.type === "service" ? (
                        <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{r.icon}</span>
                        </span>
                      ) : (
                        <img src={r.image} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-outline-variant/20" loading="lazy" />
                      )}
                      {/* Text */}
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-[14px] text-on-surface truncate">{r.label}</span>
                        <span className="block text-[12px] text-outline truncate">{r.sub}</span>
                      </span>
                      {/* Type chip */}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-outline/70 bg-surface-container px-2 py-1 rounded-full flex-shrink-0">
                        {r.type === "service" ? t(locale, "chip_category") : r.type === "company" ? t(locale, "chip_company") : t(locale, "chip_service")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* NO RESULTS */}
            {query && results.length === 0 && (
              <div className="px-5 py-14 text-center">
                <span className="material-symbols-outlined text-outline/50 text-[44px] mb-3 block">search_off</span>
                <p className="text-[15px] font-bold text-on-surface mb-1">{t(locale, "search_no_matches")} "{query}"</p>
                <p className="text-[13px] text-outline mb-5">{t(locale, "search_try")}</p>
                <button
                  onClick={() => runTextSearch(query)}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] touch-press"
                >
                  {t(locale, "search_browse_all")}
                  <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
                </button>
              </div>
            )}

            {/* EMPTY STATE — recent + popular */}
            {!query && (
              <div className="px-4 sm:px-5 py-4 space-y-6">
                {recent.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-outline">{t(locale, "search_recent")}</p>
                      <button
                        onClick={() => { clearRecentSearches(); setRecent([]); }}
                        className="text-[12px] font-bold text-outline hover:text-primary transition-colors"
                      >
                        {t(locale, "common_clear")}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((term) => (
                        <button
                          key={term}
                          onClick={() => setQuery(term)}
                          className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-2 rounded-full text-[13px] font-bold text-on-surface-variant"
                        >
                          <span className="material-symbols-outlined text-[15px] text-outline">history</span>
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-outline mb-2">{t(locale, "search_popular")}</p>
                  <div className="flex flex-wrap gap-2">
                    {popular.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="flex items-center gap-1.5 bg-primary/8 hover:bg-primary/14 transition-colors px-3 py-2 rounded-full text-[13px] font-bold text-primary"
                      >
                        <span className="material-symbols-outlined text-[15px]">trending_up</span>
                        {term}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-outline mb-2">{t(locale, "search_quick_links")}</p>
                  {/* Guided flow — full width, highlighted */}
                  <button onClick={() => go("/start")} className="w-full flex items-center gap-3 bg-primary/8 hover:bg-primary/14 transition-colors px-4 py-3 rounded-xl text-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-bold text-on-surface">{t(locale, "search_not_sure")}</span>
                      <span className="block text-[12px] text-outline">{t(locale, "search_not_sure_sub")}</span>
                    </span>
                    <span className="material-symbols-outlined text-primary text-[18px] rtl-flip">arrow_forward</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => go("/services")} className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-3 rounded-xl text-start">
                      <span className="material-symbols-outlined text-primary text-[20px]">grid_view</span>
                      <span className="text-[13px] font-bold text-on-surface">{t(locale, "search_all_services")}</span>
                    </button>
                    <button onClick={() => go("/companies")} className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-3 rounded-xl text-start">
                      <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
                      <span className="text-[13px] font-bold text-on-surface">{t(locale, "search_all_companies")}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
