import { useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { useToast } from "../../../context/ToastContext";
import { t } from "../../../lib/i18n";
import { uploadImage } from "../../../lib/image";
import { CURRENCY } from "../../../lib/pricing";
import Icon from "../../../components/Icon";

/** Step 2: whether there was additional work, and if so its details + optional photos. */
export default function AdditionalWorkSelector({
  hasExtra, onHasExtraChange,
  description, onDescriptionChange,
  amount, onAmountChange,
  notes, onNotesChange,
  attachments, onAttachmentsChange,
  errors,
  onBack, onContinue,
}: {
  hasExtra: boolean | null;
  onHasExtraChange: (v: boolean) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  attachments: string[];
  onAttachmentsChange: (urls: string[]) => void;
  errors: { description?: string; amount?: string };
  onBack: () => void;
  onContinue: () => void;
}) {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "projects", 1600, "/provider/upload");
      onAttachmentsChange([...attachments, url]);
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : "Upload failed", variant: "error" });
    } finally {
      setUploading(false);
    }
  }

  const cardBase = "border rounded-2xl p-4 cursor-pointer transition-colors";
  const cardClass = (active: boolean) =>
    active
      ? `${cardBase} border-primary bg-primary/8`
      : `${cardBase} border-outline-variant/40 bg-surface-container-lowest hover:border-outline-variant`;
  const dotClass = (active: boolean) =>
    `w-4 h-4 rounded-full flex-shrink-0 box-border ${active ? "border-[5px] border-primary" : "border border-outline-variant"}`;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 sm:p-7">
      <div className="font-bold text-label text-on-surface mb-1">{t(locale, "completion_extra_label")}</div>
      <p className="text-label text-outline mb-4">{t(locale, "completion_extra_question")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" onClick={() => onHasExtraChange(false)} className={cardClass(hasExtra === false)}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className={dotClass(hasExtra === false)} />
            <span className="font-medium text-label text-on-surface">{t(locale, "completion_extra_no")}</span>
          </div>
          <p className="text-caption text-outline text-start ms-[26px]">{t(locale, "completion_extra_no_desc")}</p>
        </button>
        <button type="button" onClick={() => onHasExtraChange(true)} className={cardClass(hasExtra === true)}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className={dotClass(hasExtra === true)} />
            <span className="font-medium text-label text-on-surface">{t(locale, "completion_extra_yes")}</span>
          </div>
          <p className="text-caption text-outline text-start ms-[26px]">{t(locale, "completion_extra_yes_desc")}</p>
        </button>
      </div>

      {hasExtra && (
        <div className="mt-5 pt-5 border-t border-outline-variant/20 flex flex-col gap-4">
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "completion_extra_desc_label")}</label>
            <textarea
              className="field-input w-full resize-none"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t(locale, "completion_extra_desc_ph")}
            />
            {errors.description && <p className="text-label text-error font-medium mt-1">{errors.description}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "completion_extra_amount_label")}</label>
              <div className="field-input flex items-baseline gap-2">
                <span className="text-caption font-bold text-outline flex-shrink-0">{CURRENCY[locale]}</span>
                <input
                  type="number" inputMode="numeric" min={0} step={1}
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 font-medium text-body [font-variant-numeric:tabular-nums] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {errors.amount && <p className="text-label text-error font-medium mt-1">{errors.amount}</p>}
            </div>
            <div>
              <label className="block text-label font-bold text-on-surface mb-1.5">
                {t(locale, "completion_extra_notes_label")} <span className="text-outline font-normal">{t(locale, "completion_optional")}</span>
              </label>
              <input
                type="text" className="field-input w-full" maxLength={2000}
                value={notes} onChange={(e) => onNotesChange(e.target.value)}
                placeholder={t(locale, "completion_extra_notes_ph")}
              />
            </div>
          </div>
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">
              {t(locale, "completion_extra_attach_label")} <span className="text-outline font-normal">{t(locale, "completion_optional")}</span>
            </label>
            <div className="flex flex-wrap gap-3 items-center">
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              <button
                type="button" disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-outline-variant rounded-xl px-4 py-3 text-label font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
              >
                {uploading ? "…" : `+ ${t(locale, "completion_extra_upload")}`}
              </button>
              {attachments.map((url) => (
                <div key={url} className="flex items-center gap-2 border border-outline-variant/40 rounded-xl px-3 py-2 bg-surface-container-lowest">
                  <img src={url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => onAttachmentsChange(attachments.filter((a) => a !== url))}
                    aria-label={t(locale, "common_close")}
                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-container"
                  >
                    <Icon name="close" className="text-caption text-outline" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-outline-variant/20 flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-label font-medium text-outline hover:text-primary transition-colors py-2">
          <Icon name="arrow_back" className="text-body rtl-flip" /> {t(locale, "completion_back")}
        </button>
        <button
          type="button" onClick={onContinue} disabled={hasExtra === null}
          className="bg-primary text-on-primary rounded-xl px-6 py-3.5 font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t(locale, "completion_continue")}
        </button>
      </div>
    </div>
  );
}
