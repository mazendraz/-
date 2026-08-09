import { useRef, useState } from "react";
import { uploadImage, isDataUrl, isVideoUrl, type UploadBucket } from "../../../lib/image";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

export function TagField({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const { locale } = useLocale();
  const [val, setVal] = useState("");
  // Splits on commas (Arabic or Latin), newlines, and periods — an admin
  // pasting/typing "A، B، C" or "A. B. C." in one go used to land as a
  // single giant tag (e.g. a run-on services list), which then broke the
  // layout everywhere that tag was rendered (option lists, chips, ...).
  function add() {
    const parts = val.split(/[،,.\n]+/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) { setVal(""); return; }
    const next = [...tags];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setVal("");
  }
  return (
    <div>
      <label className="block text-label font-bold text-on-surface mb-1.5">{label}</label>
      <div className="flex gap-2 mb-2">
        <input className="field-input" value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} />
        <button onClick={add} type="button" className="bg-surface-container px-4 rounded-xl font-bold text-label text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0">{t(locale, "admin_tag_add")}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1 rounded-full text-caption font-bold">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))}><Icon name="close" className="text-label" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Single image upload — drag-and-drop zone with live preview + URL fallback ──
export function ImageUpload({ label, value, onChange, shape = "wide", maxDim = 1000, bucket }: {
  label: string; value: string; onChange: (v: string) => void; shape?: "logo" | "wide"; maxDim?: number; bucket: UploadBucket;
}) {
  const { locale } = useLocale();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr("");
    try { onChange(await uploadImage(f, bucket, maxDim)); }
    catch (e) { setErr(e instanceof Error ? e.message : t(locale, "admin_upload_failed")); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  const zoneH = shape === "logo" ? "h-28" : "h-36";

  return (
    <div>
      <label className="block text-label font-bold text-on-surface mb-1.5">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`relative ${zoneH} w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40"
        }`}
      >
        {busy ? (
          <span className="spinner spinner-primary" />
        ) : value ? (
          <>
            <img src={value} alt="" className={`max-h-full max-w-full ${shape === "logo" ? "object-contain p-2" : "w-full h-full object-cover"}`} width={300} height={shape === "logo" ? 112 : 144} />
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="absolute top-1.5 right-1.5 bg-on-background/55 text-white rounded-full p-1 hover:bg-error transition-colors" aria-label={t(locale, "admin_upload_remove_image")}>
              <Icon name="close" className="text-body block" />
            </button>
          </>
        ) : (
          <>
            <Icon name="cloud_upload" className="text-outline/60 text-headline" />
            <p className="text-caption font-bold text-outline mt-1">{t(locale, "admin_upload_drag")} <span className="text-primary">{t(locale, "admin_upload_browse")}</span></p>
          </>
        )}
      </div>
      <input
        className="field-input !py-2 text-caption mt-2"
        placeholder={t(locale, "admin_upload_url")}
        value={isDataUrl(value) ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      {err && <p className="text-caption text-error font-bold mt-1">{err}</p>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
    </div>
  );
}

// ── Multi-image gallery upload ──
export function GalleryUpload({ images, onChange }: { images: string[]; onChange: (g: string[]) => void }) {
  const { locale } = useLocale();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true); setErr("");
    const added: string[] = [];
    let failed = 0;
    for (const f of files) {
      try { added.push(await uploadImage(f, "gallery", 1100)); } catch { failed++; }
    }
    if (added.length) onChange([...images, ...added]);
    if (failed) setErr(`${failed} ${tCount(locale, "gallery_failed", failed)}`);
    setBusy(false);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div>
      <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "admin_gallery_title")} <span className="text-outline font-normal">({images.length})</span></label>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {images.map((src) => (
          <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-outline-variant/20 group">
            {isVideoUrl(src) ? (
              <>
                <video src={src} muted preload="metadata" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-on-background/10">
                  <Icon name="play_circle" className="text-white text-title drop-shadow" style={{ fontVariationSettings: "'FILL' 1" }} />
                </div>
              </>
            ) : (
              <img src={src} alt="" className="w-full h-full object-cover" width={100} height={100} />
            )}
            <button type="button" onClick={() => onChange(images.filter((s) => s !== src))}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-on-surface/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="close" className="text-label" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="aspect-square rounded-lg border-2 border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-outline hover:border-primary hover:text-primary transition-colors">
          {busy ? <span className="spinner spinner-primary" /> : (
            <>
              <Icon name="add_photo_alternate" className="text-title" />
              <span className="text-caption font-bold mt-0.5">{t(locale, "admin_gallery_add")}</span>
            </>
          )}
        </button>
      </div>
      {err && <p className="text-caption text-error font-bold mt-1.5">{err}</p>}
      <input ref={ref} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={onFiles} />
    </div>
  );
}
