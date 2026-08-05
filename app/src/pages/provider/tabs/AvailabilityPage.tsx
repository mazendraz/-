import AvailabilityControl from "../../../components/AvailabilityControl";
import BusyWindowsEditor from "../../../components/BusyWindowsEditor";
import WaitlistManager from "../../../components/WaitlistManager";
import { setMyAvailability, isBusy } from "../../../lib/availability";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { useProvider } from "../context";

export default function AvailabilityPage() {
  const { locale } = useLocale();
  const { company } = useProvider();
  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
        <h3 className=" text-title text-on-surface mb-1">{t(locale, "prov_avail_tab_title")}</h3>
        <p className="text-outline mb-5 text-sm">{t(locale, "prov_avail_tab_desc")}</p>
        <AvailabilityControl
          key={`${company.id}-${company.busy}-${company.busyUntil ?? ""}`}
          initialBusy={isBusy(company)}
          initialBusyUntil={company.busyUntil}
          initialNote={company.busyNote}
          onSave={setMyAvailability}
        />
        {/* Scheduling, under the manual switch. These take effect and expire on
            their own — the server derives availability on read. */}
        <BusyWindowsEditor />
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
        <WaitlistManager scope={{ kind: "provider" }} />
      </div>
    </div>
  );
}
