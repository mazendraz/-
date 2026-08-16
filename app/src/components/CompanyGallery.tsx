import { useState } from "react";
import { isVideoUrl } from "../lib/image";
import MediaLightbox from "./MediaLightbox";
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

  const total = images.length;

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

      {lightboxIdx !== null && (
        <MediaLightbox
          items={images.map((src) => ({ src }))}
          index={lightboxIdx}
          onIndex={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          label={alt}
        />
      )}
    </>
  );
}
