import { useEffect, useState } from "react";

const KEY = "al-assema-saved";
const EVENT = "al-assema-saved-changed";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(slugs: string[]) {
  localStorage.setItem(KEY, JSON.stringify(slugs));
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Saved / shortlisted companies — persisted to localStorage, reactive
 * across the app. No account needed (per the no-login product rule).
 */
export function useSaved() {
  const [slugs, setSlugs] = useState<string[]>(() => read());

  useEffect(() => {
    const refresh = () => setSlugs(read());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const has = (slug: string) => slugs.includes(slug);

  function toggle(slug: string) {
    const current = read();
    write(current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current]);
  }

  function remove(slug: string) {
    write(read().filter((s) => s !== slug));
  }

  return { slugs, has, toggle, remove, count: slugs.length };
}
