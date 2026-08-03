import { retryHydration } from "../lib/catalog";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import EmptyState from "./EmptyState";

/**
 * Shown when the catalog can't be loaded from the backend and there is nothing
 * cached to fall back to (API mode only). Offers a retry that re-runs hydration.
 */
export default function CatalogError({ message }: { message?: string }) {
  const { locale } = useLocale();
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom max-w-lg mx-auto">
      <EmptyState
        icon="cloud_off"
        tone="error"
        title={t(locale, "catalog_error_title")}
        msg={message ?? t(locale, "catalog_error_body")}
        action={{ label: t(locale, "catalog_error_retry"), onClick: () => retryHydration() }}
      />
    </div>
  );
}
