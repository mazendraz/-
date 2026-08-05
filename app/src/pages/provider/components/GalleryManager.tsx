import { useRef, useState } from "react";
import { uploadImage, isVideoUrl } from "../../../lib/image";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

/**
 * Provider-facing gallery manager: thumbnail grid with per-tile replace/delete,
 * drag-to-reorder (desktop) plus move-earlier/move-later buttons (touch/
 * keyboard fallback — HTML5 drag-and-drop doesn't work on mobile touch), and
 * multi-file drag-drop upload. Distinct from the admin `GalleryUpload`
 * (pages/admin/components/fields.tsx), which has no reorder or per-tile
 * replace. Same underlying `uploadImage()` primitive, aimed at
 * "/provider/upload".
 */
export default function GalleryManager({
  images, onChange, disabled,
}: {
  images: string[];
  onChange: (g: string[]) => void;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceIndex = useRef<number>(-1);
  const dragIndex = useRef<number>(-1);

  const [busyCount, setBusyCount] = useState<{ done: number; total: number } | null>(null);
  const [replacingAt, setReplacingAt] = useState<number>(-1);
  const [err, setErr] = useState("");
  const [dropTarget, setDropTarget] = useState<number>(-1);
  const [zoneDrag, setZoneDrag] = useState(false);

  async function addFiles(files: File[]) {
    if (!files.length || disabled) return;
    setErr("");
    setBusyCount({ done: 0, total: files.length });
    const added: string[] = [];
    let failed = 0;
    for (const f of files) {
      try {
        added.push(await uploadImage(f, "gallery", 1100, "/provider/upload"));
      } catch {
        failed++;
      }
      setBusyCount((c) => (c ? { done: c.done + 1, total: c.total } : c));
    }
    if (added.length) onChange([...images, ...added]);
    if (failed) setErr(`${failed} ${tCount(locale, "gallery_failed", failed)}`);
    setBusyCount(null);
  }

  async function replaceFile(f: File | undefined) {
    const idx = replaceIndex.current;
    if (!f || idx < 0 || disabled) return;
    setReplacingAt(idx);
    setErr("");
    try {
      const url = await uploadImage(f, "gallery", 1100, "/provider/upload");
      onChange(images.map((s, i) => (i === idx ? url : s)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(locale, "admin_upload_failed"));
    } finally {
      setReplacingAt(-1);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = images.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function onZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setZoneDrag(false);
    if (dragIndex.current >= 0) return; // a tile reorder drop, not a file drop
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void addFiles(files);
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-label font-bold text-on-surface mb-2">
        {t(locale, "prov_field_gallery")}
        <span className="text-outline font-normal text-caption">({images.length})</span>
      </label>

      {images.length === 0 && !busyCount && (
        <p className="text-caption text-outline mb-2">{t(locale, "prov_gallery_empty")}</p>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setZoneDrag(true); }}
        onDragLeave={() => setZoneDrag(false)}
        onDrop={onZoneDrop}
        className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 rounded-xl transition-colors ${zoneDrag ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
      >
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            draggable={!disabled}
            onDragStart={() => { dragIndex.current = i; }}
            onDragEnd={() => { dragIndex.current = -1; setDropTarget(-1); }}
            onDragOver={(e) => { e.preventDefault(); if (dragIndex.current >= 0) setDropTarget(i); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragIndex.current >= 0) move(dragIndex.current, i);
              dragIndex.current = -1;
              setDropTarget(-1);
            }}
            className={`relative aspect-square rounded-xl overflow-hidden border transition-shadow group ${
              dropTarget === i ? "border-primary ring-2 ring-primary/40" : "border-outline-variant/20"
            } ${disabled ? "opacity-60" : ""}`}
          >
            {isVideoUrl(src) ? (
              <>
                <video src={src} muted preload="metadata" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-on-background/10">
                  <Icon name="play_circle" className="text-white text-title drop-shadow" fill />
                </div>
              </>
            ) : (
              <img src={src} alt="" className="w-full h-full object-cover" width={200} height={200} loading="lazy" />
            )}

            {replacingAt === i && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container-lowest/85">
                <span className="spinner spinner-primary" />
              </div>
            )}

            {/* Always-visible controls (touch-friendly, not hover-only). */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1">
              <span
                className="w-6 h-6 rounded-md bg-on-background/45 text-white flex items-center justify-center cursor-grab"
                title={t(locale, "prov_gallery_drag_hint")}
              >
                <Icon name="drag_indicator" className="text-label" />
              </span>
              <button
                type="button"
                onClick={() => onChange(images.filter((_, idx) => idx !== i))}
                disabled={disabled}
                aria-label={t(locale, "prov_gallery_delete")}
                className="w-6 h-6 rounded-md bg-on-background/60 text-white flex items-center justify-center hover:bg-error transition-colors"
              >
                <Icon name="close" className="text-label" />
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1 bg-gradient-to-t from-on-background/60 to-transparent">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={disabled || i === 0}
                aria-label={t(locale, "prov_gallery_move_earlier")}
                className="w-6 h-6 rounded-md bg-white/90 text-on-surface flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
              >
                <Icon name="chevron_left" className="text-label rtl-flip" />
              </button>
              <button
                type="button"
                onClick={() => { replaceIndex.current = i; replaceRef.current?.click(); }}
                disabled={disabled}
                aria-label={t(locale, "prov_gallery_replace")}
                className="flex-1 h-6 rounded-md bg-white/90 text-on-surface flex items-center justify-center hover:bg-white transition-colors"
              >
                <Icon name="sync" className="text-caption" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={disabled || i === images.length - 1}
                aria-label={t(locale, "prov_gallery_move_later")}
                className="w-6 h-6 rounded-md bg-white/90 text-on-surface flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
              >
                <Icon name="chevron_right" className="text-label rtl-flip" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => !disabled && addRef.current?.click()}
          disabled={disabled || !!busyCount}
          className="aspect-square rounded-xl border-2 border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-outline hover:border-primary hover:text-primary transition-colors"
        >
          {busyCount ? (
            <>
              <span className="spinner spinner-primary" />
              <span className="text-caption font-bold mt-1">{busyCount.done}/{busyCount.total}</span>
            </>
          ) : (
            <>
              <Icon name="add_photo_alternate" className="text-title" />
              <span className="text-caption font-bold mt-0.5">{t(locale, "prov_gallery_add")}</span>
            </>
          )}
        </button>
      </div>

      {err && <p className="text-caption text-error font-bold mt-1.5">{err}</p>}

      <input
        ref={addRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden
        onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); if (addRef.current) addRef.current.value = ""; }}
      />
      <input
        ref={replaceRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden
        onChange={(e) => void replaceFile(e.target.files?.[0])}
      />
    </div>
  );
}
