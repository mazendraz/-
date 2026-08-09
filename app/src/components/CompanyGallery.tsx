import { useEffect, useRef, useState } from "react";
import { isVideoUrl } from "../lib/image";
import Modal from "./Modal";
import LazyImage from "./LazyImage";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

const PREVIEW_COUNT = 8;

/**
 * The company profile's photo/video grid — auto-visible (no tab to click
 * into), first tile larger for a premium feel, click any tile for a
 * full-screen lightbox. Owns its own lightbox state entirely (moved out of
 * CompanyProfile.tsx) so gallery interaction never re-renders the rest of
 * the page.
 */
export default function CompanyGallery({ images, alt }: { images: string[]; alt: string }) {
  const { locale } = useLocale();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const swipeX = useRef<number | null>(null);

  const lightboxOpen = lightboxIdx !== null;
  const total = images.length;

  // Keyboard nav for the lightbox. Escape-to-close, focus-on-open and the
  // focus trap all come from <Modal> (useDialogA11y) — this only adds the
  // arrow-key gallery navigation on top of that.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setLightboxIdx((i) => (i !== null && i < total - 1 ? i + 1 : i));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen, total]);

  if (total === 0) return null;

  const preview = images.slice(0, PREVIEW_COUNT);
  const hasMore = total > PREVIEW_COUNT;

  return (
    <>
      <h2 className="font-display text-title text-on-surface mb-6">{t(locale, "profile_photo_gallery")}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 grid-flow-dense auto-rows-[130px] sm:auto-rows-[150px] lg:auto-rows-[170px] gap-3">
        {preview.map((img, i) => {
          const isVideo = isVideoUrl(img);
          return (
            <div
              key={i}
              className={`group relative overflow-hidden rounded-xl cursor-pointer shadow-bloom shadow-bloom-hover touch-press ${
                i === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-1"
              }`}
              onClick={() => setLightboxIdx(i)}
            >
              {isVideo ? (
                <video src={img} muted preload="metadata" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow" />
              ) : (
                <LazyImage
                  src={img}
                  alt={`${alt} ${i + 1}`}
                  wrapperClassName="w-full h-full"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-white opacity-0 group-hover:opacity-100 transition-opacity text-headline" aria-hidden="true" translate="no">
                  {isVideo ? "play_circle" : "zoom_in"}
                </span>
              </div>
              {isVideo && (
                <Icon name="play_circle" className="absolute bottom-1.5 end-1.5 text-white text-title drop-shadow pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }} />
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setLightboxIdx(0)}
          className="mt-5 inline-flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/30 px-5 py-2.5 rounded-xl font-bold text-label text-on-surface hover:bg-surface-container transition-colors shadow-bloom touch-press btn-press"
        >
          <Icon name="grid_view" className="text-subhead" />
          {t(locale, "profile_view_all_photos")} ({total})
        </button>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Modal
          variant="fullscreen"
          onClose={() => setLightboxIdx(null)}
          ariaLabel={`${alt} gallery, photo ${lightboxIdx + 1} of ${total}`}
          onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const delta = e.changedTouches[0].clientX - swipeX.current;
            swipeX.current = null;
            if (Math.abs(delta) < 50) return;
            if (delta > 0 && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
            if (delta < 0 && lightboxIdx < total - 1) setLightboxIdx(lightboxIdx + 1);
          }}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIdx(null)}
            aria-label={t(locale, "profile_close_gallery")}
            className="absolute top-4 right-4 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <Icon name="close" />
          </button>

          {/* Prev */}
          {lightboxIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              aria-label={t(locale, "profile_prev_photo")}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Icon name="arrow_back" />
            </button>
          )}

          {isVideoUrl(images[lightboxIdx]) ? (
            // Explicit aspect-ratio + width: unlike <img>, a <video> has no
            // intrinsic size until its metadata loads over the network, so
            // without this it renders as a tiny sliver while loading instead
            // of a proper player-sized frame.
            <video
              key={lightboxIdx}
              src={images[lightboxIdx]}
              controls
              className="w-[min(90vw,900px)] max-h-[90vh] aspect-video rounded-xl shadow-2xl bg-black"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={images[lightboxIdx]}
              alt={`${alt} — photo ${lightboxIdx + 1}`}
              className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
          )}

          {/* Next */}
          {lightboxIdx < total - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              aria-label={t(locale, "profile_next_photo")}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Icon name="arrow_forward" />
            </button>
          )}

          {/* Counter — forced ltr: "N / total" must read left-to-right even on
              an RTL page, or the bidi algorithm visually reverses it (e.g.
              "1 / 6" renders as "6 / 1"), which is backwards for a photo count. */}
          {total > 1 && (
            <div dir="ltr" className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-label font-bold bg-black/40 px-3 py-1 rounded-full pointer-events-none">
              {lightboxIdx + 1} / {total}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
