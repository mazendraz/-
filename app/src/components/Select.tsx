import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Custom-styled single-select dropdown — a premium replacement for a bare
 * `<select>`. Built because the native control can't be styled past its own
 * trigger: every browser renders the open option list itself, so a single
 * long option (a mis-entered tag, a legitimately long service name) overflows
 * the popup with no way to wrap or truncate it. This version owns the whole
 * panel, so long labels just wrap onto a second line instead of blowing out
 * the layout.
 *
 * `triggerClassName` fully replaces the default field-input look (rather
 * than appending to it) — every call site in the app needs one of three
 * shapes (full-width form field, compact filter pill, colored status badge)
 * and none of them are additive to each other.
 */
export default function Select({
  id, value, onChange, options, placeholder, ariaLabel, ariaInvalid, describedById,
  disabled, className = "", triggerClassName, panelClassName = "", stopPropagation, dataHasError,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  describedById?: string;
  disabled?: boolean;
  /** Wrapper div width/layout, e.g. "w-full" or "!w-auto". */
  className?: string;
  /** Full override of the trigger button's classes (default: field-input). */
  triggerClassName?: string;
  /** Extra classes appended to the options panel. */
  panelClassName?: string;
  /** Table-row selects sit inside a clickable row — stops the click from
   *  reaching the row's own onClick, same as the native selects did with
   *  their own onClick={(e) => e.stopPropagation()}. */
  stopPropagation?: boolean;
  /** Mirrors this codebase's `data-has-error` convention (see RequestForm.tsx)
   *  — scroll-to-first-error on submit finds the trigger button by this. */
  dataHasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <button
        type="button"
        id={id}
        disabled={disabled}
        data-has-error={dataHasError}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={describedById}
        onClick={() => setOpen((o) => !o)}
        className={
          triggerClassName ??
          `field-input flex items-center justify-between gap-2 text-start touch-press disabled:opacity-60 ${ariaInvalid ? "error" : ""}`
        }
      >
        <span className={`truncate ${selected?.label ? "" : "text-outline"}`}>
          {selected?.label || placeholder}
        </span>
        <Icon
          name="expand_more"
          className={`flex-shrink-0 transition-transform duration-base ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`select-panel-enter absolute z-20 mt-2 min-w-full max-h-72 overflow-y-auto rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-bloom p-1.5 ${panelClassName}`}
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value || "__placeholder"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-label transition-colors ${
                  isSelected ? "bg-primary/8 text-primary font-bold" : "text-on-surface hover:bg-surface-container"
                }`}
              >
                <span className="whitespace-normal break-words">{o.label || placeholder}</span>
                {isSelected && <Icon name="check" className="flex-shrink-0 text-body mt-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
