import { useState } from "react";
import Icon from "./Icon";

/**
 * Interactive 1-5 star rating input. Extracted from MyRequests.tsx's
 * ReviewModal (the only place this existed before) so the post-verification
 * review step (PriceVerificationGate) can use the exact same control instead
 * of a second hand-rolled copy.
 */
export default function StarRatingInput({
  value, onChange, size = "text-headline",
}: {
  value: number;
  onChange: (rating: number) => void;
  /** Tailwind font-size class for the star glyphs. */
  size?: string;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          className="p-0.5 touch-press"
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
        >
          <Icon
            name="star"
            className={`text-secondary ${size}`}
            style={{ fontVariationSettings: i <= (hover || value) ? "'FILL' 1" : "'FILL' 0" }}
          />
        </button>
      ))}
    </div>
  );
}
