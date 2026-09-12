import { useEffect, useRef, useState } from "react";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  wrapperClassName?: string;
  /** Set true for above-the-fold images — skips lazy loading */
  eager?: boolean;
}

/**
 * Image with skeleton shimmer placeholder + smooth blur-up reveal.
 * All off-screen images load lazily. Pass `eager` for hero / LCP images.
 */
/**
 * How long a still-loading image is given, once it is near the viewport and the
 * browser has begun fetching it, before it is treated as failed.
 *
 * `onLoad` and `onError` were the ONLY two exits from the "loading" state, and a
 * response that stalls mid-body fires neither — so the shimmer ran forever. On a
 * company profile with a cover plus a gallery that reads as a page which never
 * finishes loading, even though everything else on it has rendered.
 *
 * Generous on purpose: this is a backstop for a stalled connection, not a
 * performance budget. A real image on slow mobile data must never hit it.
 */
const IMAGE_TIMEOUT_MS = 15_000;

export default function LazyImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  eager = false,
  style,
  ...rest
}: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset on a NEW src. Without this the component inherited the previous
    // image's outcome: a gallery swapping src kept "loaded" (so the next image
    // popped in with no placeholder) or kept "error" (so a perfectly good image
    // rendered as a failure until its own onLoad happened to fire).
    const img = imgRef.current;
    if (!img) return;
    const alreadyDecoded = img.complete && img.naturalHeight !== 0;
    setState(alreadyDecoded ? "loaded" : "loading");
    if (alreadyDecoded) return;

    let timer = 0;
    // Ask the element, don't assume. `onLoad` fires once and does not clear this
    // timer, so the timer used to fire afterwards and overwrite "loaded" with
    // "error" — every image on the page went grey 15s in, having loaded and
    // rendered perfectly, with no second `onLoad` left to bring it back. A cache
    // hit that completes between render and this callback lands here too.
    const settle = () => {
      setState(img.complete && img.naturalHeight !== 0 ? "loaded" : "error");
    };
    // The clock may only start once the browser has a reason to fetch the image.
    // It used to start on mount, but a `loading="lazy"` image is not requested
    // until it nears the viewport, so cards far down the page were timed out
    // before their request was ever sent.
    const arm = () => {
      if (!timer) timer = window.setTimeout(settle, IMAGE_TIMEOUT_MS);
    };

    if (eager || typeof IntersectionObserver === "undefined") {
      arm();
      return () => window.clearTimeout(timer);
    }

    // Fires well after the browser's own lazy-load threshold, so the image has
    // already been in flight for a while by the time the clock starts. The
    // wrapper is watched rather than the <img>, which is still 0x0 in callers
    // that size it only through the loaded bitmap.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        arm();
      },
      { rootMargin: "200px" },
    );
    observer.observe(wrapperRef.current ?? img);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [src, eager]);

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${wrapperClassName}`} style={style}>
      {/* Skeleton shown while loading */}
      {state === "loading" && (
        <div className="absolute inset-0 skeleton-shimmer" aria-hidden />
      )}
      {/* A settled failure gets a flat, quiet surface rather than the browser's
          broken-image glyph. The <img> stays mounted underneath (so a late
          `onLoad` can still recover it) but is fully covered while it can't
          render anything worth showing. */}
      {state === "error" && (
        <div className="absolute inset-0 bg-surface-container" aria-hidden />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`img-lazy ${state === "loaded" ? "img-loaded" : "img-loading"} ${className}`}
        {...rest}
      />
    </div>
  );
}
