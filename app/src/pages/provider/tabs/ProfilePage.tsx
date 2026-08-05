import ProfileEditor from "../../../components/ProfileEditor";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { useProvider } from "../context";

export default function ProfilePage() {
  const { locale } = useLocale();
  const { company } = useProvider();
  return (
            <div className="max-w-3xl space-y-6">
              <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-36 overflow-hidden">
                  <img src={company.cover} alt={company.name} className="w-full h-full object-cover" width={672} height={144} />
                </div>
                <div className="px-6 pb-6">
                  <div className="-mt-8 mb-4 w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white">
                    <img src={company.logo} alt={t(locale, "common_logo_alt")} className="w-full h-full object-cover" width={64} height={64} />
                  </div>
                  <h2 className="font-display text-title text-on-surface mb-1">{company.name}</h2>
                  <p className="text-label font-display text-outline mb-3">{company.categoryLabel}</p>
                  <p className="text-body text-on-surface-variant leading-relaxed">{company.about}</p>
                </div>
              </div>

              {/* Editable profile — every save files a change request for admin
                  review; the public profile is untouched until it's approved.
                  Services (read-only) now live inside ProfileEditor itself,
                  as one of its sectioned cards — no need to duplicate the
                  same chip list here too. */}
              <ProfileEditor />
            </div>
  );
}
