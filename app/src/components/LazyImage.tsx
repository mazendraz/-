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
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalHeight !== 0) {
      setState("loaded");
    }
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${wrapperClassName}`} style={style}>
      {/* Skeleton shown while loading */}
      {state === "loading" && (
        <div className="absolute inset-0 skeleton-shimmer" aria-hidden />
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
