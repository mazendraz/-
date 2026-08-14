// Small, generic debounce for text-filter inputs — first consumer is the
// Operations screen's search box (fires a request per keystroke otherwise,
// which the brief's performance-discipline rule rules out); Global Search
// (a later stage) reuses this same hook rather than inventing its own.
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
