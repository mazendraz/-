import { retryHydration } from "../lib/catalog";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import EmptyState from "./EmptyState";

/**
 * Shown when a catalogue read fails and there is nothing cached to fall back to.
 *
 * ── `onRetry` is not optional decoration ─────────────────────────────────────
 * The retry used to be hard-wired to `retryHydration()`, which re-runs the
 * localStorage catalogue hydration. That is the right action for exactly one
 * caller. On Companies and ServiceCategory in API mode the list is driven by
 * useServerSearch, and the error being displayed is `companySearch.error` — a
 * completely different request. So the button re-fetched something the page does
 * not read, useServerSearch never re-ran, and nothing on screen changed. A retry
 * that visibly does nothing is worse than no retry at all: it tells the user the
 * page is broken beyond recovery when a reload would have fixed it.
 *
 * Callers now pass the retry that matches the request that actually failed.
 * `retryHydration` stays the default for the catalogue-backed callers.
 */
export default function CatalogError({
  message,
  onRetry,
}: {
  message?: string;
  /** Re-run whatever failed. Defaults to re-running catalogue hydration. */
  onRetry?: () => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom max-w-lg mx-auto">
      <EmptyState
        icon="cloud_off"
        tone="error"
        title={t(locale, "catalog_error_title")}
        msg={message ?? t(locale, "catalog_error_body")}
        action={{
          label: t(locale, "catalog_error_retry"),
          onClick: () => (onRetry ?? retryHydration)(),
        }}
      />
    </div>
  );
}
