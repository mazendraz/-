import type { CSSProperties, ReactNode } from "react";

interface IconProps {
  /** Material Symbols ligature name, e.g. "close" — or a dynamic expression
   *  that resolves to one (`{cond ? "close" : "add"}` at call sites). */
  name: ReactNode;
  className?: string;
  /** Shorthand for the FILL variant axis — `fill` (always on) or `fill={cond}`
   *  (conditional), instead of writing out the raw fontVariationSettings. */
  fill?: boolean;
  style?: CSSProperties;
  /** Only when this icon is the SOLE content of an unlabeled control and
   *  nothing else supplies an accessible name — renders visually-hidden text
   *  instead of aria-hidden. Prefer labeling the control itself
   *  (aria-label on the surrounding button) over this. */
  label?: string;
  [key: string]: unknown;
}

/**
 * Wrapper for Material Symbols icons (A11Y-17): screen readers otherwise read
 * the ligature's literal name ("arrow_forward", "event_busy", ...) as text,
 * which on a card footer like "View profile" + icon reads as "View profile
 * arrow forward". Always aria-hidden (unless `label` is given) and
 * translate="no" (so browser/AT translation features never touch the glyph
 * name), centralizing icon sizing/fill in one place at the same time.
 */
export default function Icon({ name, className = "", fill, style, label, ...rest }: IconProps) {
  const mergedStyle: CSSProperties | undefined =
    fill !== undefined ? { fontVariationSettings: fill ? "'FILL' 1" : "'FILL' 0", ...style } : style;

  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ""}`}
      style={mergedStyle}
      aria-hidden={label ? undefined : "true"}
      translate="no"
      {...rest}
    >
      {name}
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
