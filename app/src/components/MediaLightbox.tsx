import { useEffect, useRef, type ReactNode } from "react";
import { isVideoUrl } from "../lib/image";
import Modal from "./Modal";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "./Icon";

export interface LightboxItem {
  src: string;
  /** Alt text, and the fallback caption when there is no `footer`. */
  caption?: string;
  /** Rich caption bar under the media — a name, a price, an action. Unlike the
   *  plain caption it takes clicks (the viewer's backdrop-close is stopped for
   *  it), so a customer can act on what they're looking at without closing. */
  footer?: ReactNode;
}

/**
 * Full-screen media viewer with prev/next, arrow keys, swipe and a counter.
 *
 * Extracted from CompanyGallery so the offering cards (product photos) get the
 * exact same viewer instead of a second, subtly-different one: same swipe
 * threshold, same key handling, same focus trap (from <Modal>).
 */
export default function MediaLightbox({ items, index, onIndex, onClose, label }: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Prefix for the dialog's accessible name, e.g. the company name. */
  label: string;
}) {
  const { locale } = useLocale();
  const swipeX = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const total = items.length;

  // Keyboard nav. Escape-to-close, focus-on-open and the focus trap all come
  // from <Modal> (useDialogA11y) — this only adds arrow-key navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < total - 1) onIndex(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, total, onIndex]);

  const item = items[index];

  // Start playing on open (and on every paged-to video). `autoPlay` alone is
  // not enough: with sound, browsers only allow it off a user gesture, and
  // Safari does not count the click that opened this dialog. So play() is
  // called explicitly, and a rejection falls back to a MUTED autoplay —
  // which is always permitted — rather than leaving a frozen first frame.
  // The controls are right there for the viewer to unmute.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      video.muted = true;
      void video.play().catch(() => {});
    });
  }, [index, item?.src]);

  if (!item) return null;

  const caption = item.caption;
  const alt = caption ? caption : `${label} — ${index + 1}`;
  const hasBar = Boolean(item.footer || caption);
  // Leave room for the caption bar instead of letting a tall photo push it
  // off the bottom of the viewport.
  const mediaMaxH = hasBar ? "max-h-[72vh]" : "max-h-[90vh]";

  return (
    <Modal
      variant="fullscreen"
      onClose={onClose}
      ariaLabel={`${label} — ${index + 1} / ${total}`}
      onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (swipeX.current === null) return;
        const delta = e.changedTouches[0].clientX - swipeX.current;
        swipeX.current = null;
        if (Math.abs(delta) < 50) return;
        if (delta > 0 && index > 0) onIndex(index - 1);
        if (delta < 0 && index < total - 1) onIndex(index + 1);
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label={t(locale, "profile_close_gallery")}
        className="absolute top-4 right-4 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <Icon name="close" />
      </button>

      {/* Prev */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
          aria-label={t(locale, "profile_prev_photo")}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <Icon name="arrow_back" />
        </button>
      )}

      {isVideoUrl(item.src) ? (
        // Explicit aspect-ratio + width: unlike <img>, a <video> has no
        // intrinsic size until its metadata loads over the network, so without
        // this it renders as a tiny sliver while loading instead of a proper
        // player-sized frame.
        <video
          key={item.src}
          ref={videoRef}
          src={item.src}
          controls
          autoPlay
          playsInline
          className={`w-[min(90vw,900px)] ${mediaMaxH} aspect-video rounded-xl shadow-2xl bg-black`}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={item.src}
          alt={alt}
          className={`max-w-full ${mediaMaxH} rounded-xl object-contain shadow-2xl`}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      )}

      {/* Next */}
      {index < total - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
          aria-label={t(locale, "profile_next_photo")}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <Icon name="arrow_forward" />
        </button>
      )}

      {/* Caption + counter. The counter is forced ltr: "N / total" must read
          left-to-right even on an RTL page, or the bidi algorithm visually
          reverses it (e.g. "1 / 6" renders as "6 / 1"). */}
      {(hasBar || total > 1) && (
        <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
          {item.footer ? (
            <div className="pointer-events-auto max-w-[min(94vw,680px)] w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
              {item.footer}
            </div>
          ) : caption && (
            <p className="text-white text-label font-bold text-center bg-black/50 px-4 py-2 rounded-xl max-w-[min(90vw,640px)]">
              {caption}
            </p>
          )}
          {total > 1 && (
            <div dir="ltr" className="text-white/70 text-label font-bold bg-black/40 px-3 py-1 rounded-full">
              {index + 1} / {total}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
