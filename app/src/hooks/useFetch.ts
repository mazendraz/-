import { useState, useEffect, useCallback } from "react";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic async data hook.
 *
 * @param fetcher  Async function that returns the data. Re-runs when `deps` change.
 * @param deps     Extra dependency array (like useEffect deps).
 *
 * @example
 *   const { data, loading, error } = useFetch(() => apiGet<ApiCompany[]>("/companies"));
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refetch = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => {
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "An error occurred");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);

  return { data, loading, error, refetch };
}
