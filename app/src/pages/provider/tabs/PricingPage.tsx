import OfferingsEditor from "../../../components/OfferingsEditor";
import EmptyState from "../../../components/EmptyState";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { useProvider } from "../context";

export default function PricingPage() {
  const { locale } = useLocale();
  const { pricingAllowed } = useProvider();

  // Reached only via a link to a company whose category isn't FIXED_CATALOG —
  // the sidebar never offers this tab in that case, and ProviderLayout only
  // auto-redirects when access is REVOKED while the tab is open. Someone who
  // followed a real link here gets an explanation, not a blank pane or a
  // silent bounce.
  if (!pricingAllowed) return <EmptyState msg={t(locale, "prov_pricing_unavailable")} icon="sell" />;
  return <OfferingsEditor />;
}
