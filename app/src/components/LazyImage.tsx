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
 * How long a still-loading image is given before it is treated as failed.
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

  useEffect(() => {
    // Reset on a NEW src. Without this the component inherited the previous
    // image's outcome: a gallery swapping src kept "loaded" (so the next image
    // popped in with no placeholder) or kept "error" (so a perfectly good image
    // rendered as a failure until its own onLoad happened to fire).
    const img = imgRef.current;
    const alreadyDecoded = Boolean(img?.complete && img.naturalHeight !== 0);
    setState(alreadyDecoded ? "loaded" : "loading");
    if (alreadyDecoded) return;

    const timer = window.setTimeout(() => setState("error"), IMAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${wrapperClassName}`} style={style}>
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
