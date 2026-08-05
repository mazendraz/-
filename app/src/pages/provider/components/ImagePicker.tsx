import { useRef, useState } from "react";
import { uploadImage, isDataUrl, type UploadBucket } from "../../../lib/image";
import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

/**
 * Premium single-image picker for the provider profile editor — Logo and
 * Cover. Distinct from the admin `ImageUpload` (pages/admin/components/fields.tsx):
 * no always-visible raw-URL input (never show a file path to the provider),
 * explicit Upload/Replace/Remove controls that work on touch (not hover-only),
 * and a recommended-dimensions caption. Same underlying `uploadImage()`
 * primitive, just aimed at "/provider/upload" instead of the admin endpoint.
 */
export default function ImagePicker({
  label, value, onChange, shape, bucket, maxDim, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  shape: "logo" | "cover";
  bucket: UploadBucket;
  maxDim: number;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  async function handleFile(f: File | undefined) {
    if (!f || disabled) return;
    setBusy(true);
    setErr("");
    try {
      onChange(await uploadImage(f, bucket, maxDim, "/provider/upload"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(locale, "admin_upload_failed"));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (disabled) return;
    void handleFile(e.dataTransfer.files?.[0]);
  }

  function applyUrl() {
    onChange(urlDraft.trim());
    setUrlDraft("");
    setShowUrl(false);
  }

  const previewShape = shape === "logo"
    ? "w-32 h-32 rounded-2xl"
    : "w-full h-40 sm:h-48 rounded-2xl";

  return (
    <div>
      <label className="block text-label font-bold text-on-surface mb-1.5">{label}</label>

      <div
        onClick={() => !disabled && !value && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`relative ${previewShape} border-2 border-dashed overflow-hidden transition-colors ${
          value ? "border-transparent" : "cursor-pointer"
        } ${
          drag ? "border-primary bg-primary/5" : value ? "" : "border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {value ? (
          <img
            src={value}
            alt=""
            className={shape === "logo" ? "w-full h-full object-contain bg-white p-2" : "w-full h-full object-cover"}
            width={shape === "logo" ? 128 : 600}
            height={shape === "logo" ? 128 : 192}
          />
        ) : !busy && (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-3 gap-1">
            <Icon name="cloud_upload" className="text-outline/60 text-headline" />
            <p className="text-caption font-bold text-outline">
              {t(locale, "prov_img_drag_hint")} <span className="text-primary">{t(locale, "prov_img_browse")}</span>
            </p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-container-lowest/85">
            <span className="spinner spinner-primary" />
            <span className="text-caption font-bold text-outline">{t(locale, "prov_img_uploading")}</span>
          </div>
        )}

        {/* Always-visible (not hover-only) so this works on touch. */}
        {value && !busy && (
          <div className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-1.5 bg-gradient-to-t from-on-background/60 to-transparent ${shape === "logo" ? "justify-center" : ""}`}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) ref.current?.click(); }}
              disabled={disabled}
              aria-label={t(locale, "prov_img_replace")}
              title={shape === "logo" ? t(locale, "prov_img_replace") : undefined}
              className="flex items-center gap-1 bg-white/95 text-on-surface px-2.5 py-1.5 rounded-lg text-caption font-bold hover:bg-white transition-colors touch-press"
            >
              <Icon name="sync" className="text-label" />
              {shape !== "logo" && t(locale, "prov_img_replace")}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(""); }}
              disabled={disabled}
              aria-label={t(locale, "prov_img_remove")}
              title={shape === "logo" ? t(locale, "prov_img_remove") : undefined}
              className="flex items-center gap-1 bg-white/95 text-error px-2.5 py-1.5 rounded-lg text-caption font-bold hover:bg-white transition-colors touch-press"
            >
              <Icon name="delete" className="text-label" />
              {shape !== "logo" && t(locale, "prov_img_remove")}
            </button>
          </div>
        )}
      </div>

      {!value && !busy && (
        <button
          type="button"
          onClick={() => !disabled && ref.current?.click()}
          disabled={disabled}
          className="mt-2 flex items-center gap-1.5 bg-surface-container px-3.5 py-2 rounded-lg font-bold text-caption text-on-surface hover:bg-surface-container-high transition-colors touch-press disabled:opacity-50"
        >
          <Icon name="upload" className="text-label" />
          {t(locale, "prov_img_upload")}
        </button>
      )}

      <p className="text-caption text-outline mt-1.5">
        {t(locale, shape === "logo" ? "prov_img_recommended_logo" : "prov_img_recommended_cover")}
      </p>

      {err && <p className="text-caption text-error font-bold mt-1">{err}</p>}

      <button
        type="button"
        onClick={() => setShowUrl((s) => !s)}
        className="mt-1.5 text-caption font-bold text-outline hover:text-primary transition-colors underline underline-offset-2"
      >
        {t(locale, "prov_img_advanced_url")}
      </button>
      {showUrl && (
        <div className="flex gap-2 mt-1.5">
          <input
            className="field-input !py-2 text-caption"
            placeholder={t(locale, "prov_img_url_ph")}
            value={isDataUrl(urlDraft) ? "" : urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }}
          />
          <button type="button" onClick={applyUrl} className="bg-surface-container px-3 rounded-lg font-bold text-caption text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0">
            {t(locale, "prov_img_upload")}
          </button>
        </div>
      )}

      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
    </div>
  );
}
