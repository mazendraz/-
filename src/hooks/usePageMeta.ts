import { useEffect } from "react";

const DEFAULT_TITLE = "Al Assema — Every Trusted Service in the New Capital";
const DEFAULT_DESC =
  "Find verified interior design, landscaping, smart home, and finishing companies in Egypt's New Administrative Capital.";

function upsertMeta(nameOrProp: string, content: string, attr = "name") {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${nameOrProp}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    const t = title ?? DEFAULT_TITLE;
    const d = description ?? DEFAULT_DESC;

    document.title = t;
    upsertMeta("description", d);
    upsertMeta("og:title", t, "property");
    upsertMeta("og:description", d, "property");
    upsertMeta("og:site_name", "Al Assema", "property");
    upsertMeta("twitter:title", t);
    upsertMeta("twitter:description", d);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description]);
}
