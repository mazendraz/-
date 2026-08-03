import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

// I18N-06: the locale lives in localStorage, not the URL — so a shared link,
// a bookmark, or a crawler always lands on whatever language the visitor last
// picked on THAT device, and search engines can't index the ar/en variants as
// distinct pages. `?lang=` makes the current language part of the URL itself
// (echoed in canonical/hreflang below); LocaleProvider reads it back on load
// (see context/LocaleContext.tsx) so a shared link actually opens in that language.
const SITE_URL = "https://alassema.com";
const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;

function upsertMeta(nameOrProp: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${nameOrProp}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (hreflang) el.setAttribute("hreflang", hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * @param title Fully-resolved (already translated) page title, e.g. `t(locale, "meta_x_title")`
 *   or a dynamic string like `${company.name} | ${t(locale, "brand_name")}`. Omit for the site default.
 * @param description Same convention as `title`. Omit for the site default.
 * @param image Absolute image URL for og:image/twitter:image. Omit for the site logo.
 */
export function usePageMeta(title?: string, description?: string, image?: string) {
  const { locale } = useLocale();
  const { pathname } = useLocation();

  useEffect(() => {
    const finalTitle = title ?? t(locale, "meta_default_title");
    const finalDesc = description ?? t(locale, "meta_default_desc");
    const finalImage = image ?? DEFAULT_IMAGE;
    const canonicalUrl = `${SITE_URL}${pathname}?lang=${locale}`;

    document.title = finalTitle;
    upsertMeta("description", finalDesc);
    upsertMeta("og:type", "website", "property");
    upsertMeta("og:site_name", t(locale, "brand_name"), "property");
    upsertMeta("og:title", finalTitle, "property");
    upsertMeta("og:description", finalDesc, "property");
    upsertMeta("og:locale", locale === "ar" ? "ar_EG" : "en_US", "property");
    upsertMeta("og:url", canonicalUrl, "property");
    upsertMeta("og:image", finalImage, "property");
    upsertMeta("twitter:card", "summary_large_image");
    upsertMeta("twitter:title", finalTitle);
    upsertMeta("twitter:description", finalDesc);
    upsertMeta("twitter:image", finalImage);
    upsertLink("canonical", canonicalUrl);
    upsertLink("alternate", `${SITE_URL}${pathname}?lang=ar`, "ar");
    upsertLink("alternate", `${SITE_URL}${pathname}?lang=en`, "en");
    // Arabic is the platform's default language (see CLAUDE.md / LocaleContext) —
    // x-default should resolve to the same variant an un-flagged visitor gets.
    upsertLink("alternate", `${SITE_URL}${pathname}?lang=ar`, "x-default");

    // I18N-01: only `document.title` used to get reset here — description and
    // every og:/twitter: tag were left holding the PREVIOUS page's content
    // until the next page's effect happened to overwrite them.
    return () => {
      const dTitle = t(locale, "meta_default_title");
      const dDesc = t(locale, "meta_default_desc");
      document.title = dTitle;
      upsertMeta("description", dDesc);
      upsertMeta("og:title", dTitle, "property");
      upsertMeta("og:description", dDesc, "property");
      upsertMeta("og:image", DEFAULT_IMAGE, "property");
      upsertMeta("twitter:title", dTitle);
      upsertMeta("twitter:description", dDesc);
      upsertMeta("twitter:image", DEFAULT_IMAGE);
    };
  }, [title, description, image, locale, pathname]);
}
