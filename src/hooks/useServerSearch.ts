/**
 * Debounced, paginated, abortable server-side search/list hook.
 *
 * Replaces the "hydrate one capped page then filter in React state" pattern: the
 * search term + filters are sent to the backend, so results include matching rows
 * that were never loaded into the browser, and the dataset can be any size.
 *
 * Backend contract: `path` must return an ApiPage<T> = { data: T[]; meta: { total,
 * page, pageSize } } and accept `search`, `page`, `pageSize` (plus any extra
 * `params`) as query-string params — exactly what the admin/provider/companies
 * list endpoints already do.
 *
 * The search term is debounced; changing the term or any filter resets to page 1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, ApiError, isApiConfigured } from "../lib/api";

export interface ApiPage<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface ServerSearchResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  /** Re-run the current query (e.g. after a mutation). */
  refresh: () => void;
}

export interface ServerSearchOptions {
  /** Debounce for the search term, ms. Default 300. */
  debounceMs?: number;
  pageSize?: number;
  /** When false, the hook stays idle (e.g. demo mode with no API). Default: API configured. */
  enabled?: boolean;
}

type ParamValue = string | number | boolean | undefined | null;

function buildQuery(
  path: string,
  search: string,
  page: number,
  pageSize: number,
  params: Record<string, ParamValue>,
): string {
  const sp = new URLSearchParams();
  const s = search.trim();
  if (s) sp.set("search", s);
  sp.set("page", String(page));
  sp.set("pageSize", String(pageSize));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return `${path}${path.includes("?") ? "&" : "?"}${sp.toString()}`;
}

export function useServerSearch<T>(
  path: string,
  search: string,
  params: Record<string, ParamValue> = {},
  options: ServerSearchOptions = {},
): ServerSearchResult<T> {
  const {
    debounceMs = 300,
    pageSize = 20,
    enabled = isApiConfigured(),
  } = options;

  // Serialize params so the effect only re-runs on actual value changes, not on a
  // new object identity each render.
  const paramsKey = JSON.stringify(params);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ data: T[]; total: number }>({ data: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Reset to page 1 whenever the search term or filters change.
  useEffect(() => {
    setPage(1);
  }, [search, paramsKey]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setResult({ data: [], total: 0 });
      setLoading(false);
      return;
    }
    // Debounce only typed search terms; the initial/empty-term load (opening a
    // tab) and page changes fetch immediately so there's no extra wait.
    const delay = search.trim() ? debounceMs : 0;
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setLoading(true);
      setError(null);
      try {
        const url = buildQuery(path, search, page, pageSize, JSON.parse(paramsKey));
        const res = await apiGet<ApiPage<T>>(url);
        if (!ctl.signal.aborted) {
          setResult({ data: res.data, total: res.meta.total });
        }
      } catch (err) {
        if (!ctl.signal.aborted) {
          setError(err instanceof ApiError ? err.message : "Search failed. Please try again.");
          setResult({ data: [], total: 0 });
        }
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, delay);

    return () => clearTimeout(handle);
    // paramsKey stands in for params; tick forces a manual refresh.
  }, [path, search, page, pageSize, paramsKey, enabled, debounceMs, tick]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(result.total / pageSize)),
    [result.total, pageSize],
  );

  return {
    data: result.data,
    total: result.total,
    page,
    pageSize,
    pageCount,
    loading,
    error,
    setPage,
    refresh,
  };
}
