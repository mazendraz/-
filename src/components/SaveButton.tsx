import { useSaved } from "../hooks/useSaved";

interface Props {
  slug: string;
  /** "icon" = round floating button (cards), "pill" = labelled button (profile) */
  variant?: "icon" | "pill";
  className?: string;
}

/** Heart toggle to save/shortlist a company. Stops link navigation. */
export default function SaveButton({ slug, variant = "icon", className = "" }: Props) {
  const { has, toggle } = useSaved();
  const saved = has(slug);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle(slug);
  }

  if (variant === "pill") {
    return (
      <button
        onClick={onClick}
        className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-[14px] border transition-colors touch-press
          ${saved
            ? "bg-error/8 border-error/30 text-error"
            : "bg-surface-container-lowest border-outline-variant/40 text-on-surface hover:border-error/40 hover:text-error"} ${className}`}
        aria-pressed={saved}
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ fontVariationSettings: saved ? "'FILL' 1" : "'FILL' 0" }}
        >
          favorite
        </span>
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-all touch-press active:scale-90
        ${saved ? "bg-white text-error" : "bg-white/90 backdrop-blur-sm text-on-surface-variant hover:text-error"} ${className}`}
      aria-label={saved ? "Remove from saved" : "Save company"}
      aria-pressed={saved}
    >
      <span
        className={`material-symbols-outlined text-[20px] ${saved ? "count-flash" : ""}`}
        style={{ fontVariationSettings: saved ? "'FILL' 1" : "'FILL' 0" }}
      >
        favorite
      </span>
    </button>
  );
}
