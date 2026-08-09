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
 */
export default function Select({
  id, value, onChange, options, placeholder, ariaInvalid, describedById, className = "",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaInvalid?: boolean;
  describedById?: string;
  className?: string;
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
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-describedby={describedById}
        onClick={() => setOpen((o) => !o)}
        className={`field-input flex items-center justify-between gap-2 text-start touch-press ${ariaInvalid ? "error" : ""}`}
      >
        <span className={`truncate ${selected?.label ? "text-on-surface" : "text-outline"}`}>
          {selected?.label || placeholder}
        </span>
        <Icon
          name="expand_more"
          className={`flex-shrink-0 text-outline transition-transform duration-base ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="select-panel-enter absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-bloom p-1.5"
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
