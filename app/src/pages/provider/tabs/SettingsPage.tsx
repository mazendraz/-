import NotificationToggle from "../../../components/NotificationToggle";
import TelegramConnect from "../../../components/TelegramConnect";
import { useLocale } from "../../../context/LocaleContext";
import { t, type StringKey } from "../../../lib/i18n";

export default function SettingsPage() {
  const { locale } = useLocale();
  return (
            <div className="max-w-2xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-2">{t(locale, "prov_settings_notifications")}</h3>
                <p className="text-outline mb-4 text-sm">{t(locale, "prov_settings_notifications_sub")}</p>
                <div className="py-3 border-b border-outline-variant/20">
                  <NotificationToggle />
                </div>
                <div className="py-3 border-b border-outline-variant/20">
                  <TelegramConnect />
                </div>
                {[
                  { labelKey: "prov_settings_email_label" as StringKey, detailKey: "prov_settings_email_detail" as StringKey },
                  { labelKey: "prov_settings_sms_label" as StringKey, detailKey: "prov_settings_sms_detail" as StringKey },
                  { labelKey: "prov_settings_weekly_label" as StringKey, detailKey: "prov_settings_weekly_detail" as StringKey },
                ].map((s) => (
                  <div key={t(locale, s.labelKey)} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
                    <div>
                      <p className=" text-label text-on-surface">{t(locale, s.labelKey)}</p>
                      <p className="text-caption text-outline">{t(locale, s.detailKey)}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ms-4">
                      <input type="checkbox" role="switch" aria-label={t(locale, s.labelKey)} defaultChecked className="sr-only peer" />
                      <div className="w-10 h-6 bg-outline-variant peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
                <h3 className=" text-title text-on-surface mb-4">{t(locale, "prov_settings_account")}</h3>
                <p className="text-outline text-sm">
                  {t(locale, "prov_account_note")}
                </p>
              </div>
            </div>
  );
}
