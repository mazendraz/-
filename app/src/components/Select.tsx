import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerTransientOverlay } from "../lib/transientOverlays";
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
  // Anchor rect for the portaled panel below — recomputed each time the
  // dropdown opens. Rendering the panel through a portal (instead of an
  // absolutely-positioned child) keeps it from being clipped when the
  // trigger sits inside a scrolling container, e.g. the admin leads table's
  // `overflow-x-auto` wrapper, which was cutting the options list off.
  const [coords, setCoords] = useState<{
    top?: number; bottom?: number; left?: number; right?: number; width: number; maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const isRTL = document.documentElement.dir === "rtl";
    const gap = 8;
    const preferredMax = 288; // matches the old max-h-72
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Flip to open upward when there isn't enough room below — otherwise a
    // trigger near the bottom of the screen (last row in a long list, e.g.
    // the provider's leads cards) pushes the panel past the viewport edge
    // with no way to scroll it into view, since it's fixed-positioned.
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    setCoords({
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      width: rect.width,
      maxHeight: Math.max(120, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow)),
      ...(isRTL ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Capture phase: scroll events don't bubble, so this is the only way to
    // hear about scrolling inside an ancestor container (the leads table's
    // horizontal scroll) and not just the window itself.
    function onScroll(e: Event) {
      // ...but that also means scrolling *inside the options list* reaches this
      // listener (window → document → body → panel on the way down), which was
      // closing the panel the instant you tried to scroll a long list — e.g.
      // the company picker in the admin team modal. The panel owns its own
      // overflow, so its scrolls are never a reason to close it.
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Claims Escape for this panel while it's open, so a dialog containing the
    // Select doesn't close itself out from under an open dropdown.
    const releaseOverlay = registerTransientOverlay();
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      releaseOverlay();
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
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
        ref={triggerRef}
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

      {open && coords && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          style={{
            top: coords.top, bottom: coords.bottom, left: coords.left, right: coords.right,
            minWidth: coords.width, maxHeight: coords.maxHeight,
          }}
          className={`select-panel-enter fixed z-50 overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-bloom p-1.5 ${panelClassName}`}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
