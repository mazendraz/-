import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { formatDate } from "../../../lib/format";

/** Service/client/order-id/date grid — mirrors the mockup's order-context header. */
export default function OrderSummary({
  service, clientName, refNumber, createdAt,
}: {
  service: string;
  clientName: string;
  refNumber: string;
  createdAt: number;
}) {
  const { locale } = useLocale();
  const fields: [string, string, boolean?][] = [
    [t(locale, "admin_lead_service"), service],
    [t(locale, "admin_lead_name"), clientName],
    [t(locale, "admin_lead_ref"), refNumber, true],
    [t(locale, "admin_lead_date"), formatDate(createdAt, locale)],
  ];
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {fields.map(([label, value, mono]) => (
        <div key={label}>
          <div className="text-caption font-bold tracking-wide text-outline mb-1.5 uppercase">{label}</div>
          <div className={`text-label font-medium text-on-surface ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
