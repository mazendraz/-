import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  search,
  searchRemote,
  getPopularSearches,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  type SearchResult,
} from "../lib/search";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useScrollLock } from "../hooks/useScrollLock";
import Icon from "./Icon";

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

  // Instant local results for the first paint, then replaced by the backend
  // results (which cover the COMPLETE dataset) after a short debounce.
  const [results, setResults] = useState<SearchResult[]>([]);
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    setResults(search(query)); // optimistic local matches
    let alive = true;
    const id = setTimeout(() => {
      void searchRemote(query).then((r) => { if (alive) setResults(r); });
    }, 200);
    return () => { alive = false; clearTimeout(id); };
  }, [query]);
  const popular = getPopularSearches();

  // Shared with every other dialog — it saves and restores the previous value,
  // where the hand-rolled lock this replaced reset overflow to "" outright and
  // so would have unlocked the page out from under anything open beneath it.
  useScrollLock(open);

  // Reset + focus the input when opened
  useEffect(() => {
    if (!open) return;
    setRecent(getRecentSearches());
    setQuery("");
    setActiveIndex(0);
    // Delay focus until after the open animation paints
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
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
    onClose();
    // Go to the top current match if any; otherwise the companies page (browse all).
    navigate(results[0] ? results[0].to : "/companies");
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
            <Icon name="search" className="text-primary text-title" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t(locale, "search_overlay_placeholder")}
              className="flex-1 bg-transparent border-none outline-none text-subhead text-on-surface placeholder:text-outline/70"
              style={{ fontSize: "16px" }}
              type="text"
              inputMode="search"
              autoComplete="off"
              enterKeyHint="search"
            />
            {/* Clear-text "X" — only shown while there's text, clears the query. */}
            {query && (
              <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="p-1 rounded-full text-outline hover:bg-surface-container hover:text-on-surface transition-colors flex-shrink-0" aria-label={t(locale, "common_clear")}>
                <Icon name="close" className="text-title" />
              </button>
            )}
            {/* Persistent close button — always dismisses the overlay (needed on
                mobile, where the backdrop isn't visible and there's no Esc key). */}
            <button onClick={onClose} className="flex-shrink-0 text-label font-bold text-outline hover:text-primary transition-colors px-1" aria-label={t(locale, "search_cancel")}>
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
                      {r.type === "category" ? (
                        <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{r.icon}</span>
                        </span>
                      ) : (
                        <img src={r.image} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-outline-variant/20" loading="lazy" width={40} height={40} />
                      )}
                      {/* Text */}
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-label text-on-surface truncate">{r.label}</span>
                        <span className="block text-caption text-outline truncate">{r.sub}</span>
                      </span>
                      {/* Type chip */}
                      <span className="text-caption font-bold ltr:uppercase ltr:tracking-wider text-outline/70 bg-surface-container px-2 py-1 rounded-full flex-shrink-0">
                        {r.type === "category" ? t(locale, "chip_category")
                          : r.type === "company" ? t(locale, "chip_company")
                          : r.type === "product" ? t(locale, "chip_product")
                          : t(locale, "chip_service")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* NO RESULTS */}
            {query && results.length === 0 && (
              <div className="px-5 py-14 text-center">
                <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
                  <Icon name="search_off" className="text-outline/60 text-headline" />
                </span>
                <p className="text-body font-bold text-on-surface mb-1">{t(locale, "search_no_matches")} ‘{query}’</p>
                <p className="text-label text-outline mb-5">{t(locale, "search_try")}</p>
                <button
                  onClick={() => runTextSearch(query)}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label touch-press"
                >
                  {t(locale, "search_browse_all")}
                  <Icon name="arrow_forward" className="text-body rtl-flip" />
                </button>
              </div>
            )}

            {/* EMPTY STATE — recent + popular */}
            {!query && (
              <div className="px-4 sm:px-5 py-4 space-y-6">
                {recent.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline">{t(locale, "search_recent")}</p>
                      <button
                        onClick={() => { clearRecentSearches(); setRecent([]); }}
                        className="text-caption font-bold text-outline hover:text-primary transition-colors"
                      >
                        {t(locale, "common_clear")}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((term) => (
                        <button
                          key={term}
                          onClick={() => setQuery(term)}
                          className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-2 rounded-full text-label font-bold text-on-surface-variant"
                        >
                          <Icon name="history" className="text-body text-outline" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-2">{t(locale, "search_popular")}</p>
                  <div className="flex flex-wrap gap-2">
                    {popular.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="flex items-center gap-1.5 bg-primary/8 hover:bg-primary/14 transition-colors px-3 py-2 rounded-full text-label font-bold text-primary"
                      >
                        <Icon name="trending_up" className="text-body" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-2">{t(locale, "search_quick_links")}</p>
                  {/* Guided flow — full width, highlighted */}
                  <button onClick={() => go("/start")} className="w-full flex items-center gap-3 bg-primary/8 hover:bg-primary/14 transition-colors px-4 py-3 rounded-xl text-start mb-2">
                    <Icon name="auto_awesome" className="text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} />
                    <span className="flex-1">
                      <span className="block text-label font-bold text-on-surface">{t(locale, "search_not_sure")}</span>
                      <span className="block text-caption text-outline">{t(locale, "search_not_sure_sub")}</span>
                    </span>
                    <Icon name="arrow_forward" className="text-primary text-subhead rtl-flip" />
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => go("/services")} className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-3 rounded-xl text-start">
                      <Icon name="grid_view" className="text-primary text-title" />
                      <span className="text-label font-bold text-on-surface">{t(locale, "search_all_services")}</span>
                    </button>
                    <button onClick={() => go("/companies")} className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high transition-colors px-3 py-3 rounded-xl text-start">
                      <Icon name="verified" className="text-primary text-title" />
                      <span className="text-label font-bold text-on-surface">{t(locale, "search_all_companies")}</span>
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
