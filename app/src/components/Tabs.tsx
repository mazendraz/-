import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "../context/LocaleContext";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  /** Unique per tab strip on the page — used to build tab/panel `id`s so
   * `aria-controls`/`aria-labelledby` actually point at something. */
  idPrefix: string;
  className?: string;
  tabClassName: (active: boolean) => string;
}

/**
 * The ARIA tabs pattern (CMP-10) — `role="tablist"`/`"tab"`/`"tabpanel"`,
 * `aria-selected`, and roving tabindex with Left/Right/Home/End, in one place
 * instead of four visually-styled `<button>` strips with none of that (the
 * company profile page, the admin company editor's sub-tabs, and originally
 * `PersonalTabs` too — that one navigates between routes rather than
 * switching panels, so it's a `<nav>` with `aria-current` instead of this).
 * Arrow keys are mirrored under RTL: "next tab" is Left in Arabic, not Right.
 */
export default function Tabs<T extends string>({ items, activeId, onChange, idPrefix, className = "", tabClassName }: TabsProps<T>) {
  const { isRTL } = useLocale();
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  function focusAndSelect(index: number) {
    const item = items[index];
    onChange(item.id);
    buttonRefs.current[item.id]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextKey = isRTL ? "ArrowLeft" : "ArrowRight";
    const prevKey = isRTL ? "ArrowRight" : "ArrowLeft";
    if (e.key === nextKey) { e.preventDefault(); focusAndSelect((index + 1) % items.length); }
    else if (e.key === prevKey) { e.preventDefault(); focusAndSelect((index - 1 + items.length) % items.length); }
    else if (e.key === "Home") { e.preventDefault(); focusAndSelect(0); }
    else if (e.key === "End") { e.preventDefault(); focusAndSelect(items.length - 1); }
  }

  return (
    // DM-09: `max-w-full overflow-x-auto scrollbar-hide` lives here rather than
    // at each call site. CompanyEditor's four Arabic sub-tab labels measure
    // ~360px inside a ~318px modal at 390px — a horizontal overflow INSIDE a
    // modal, which is both the hardest kind to notice and the most annoying to
    // use. SettingsTab's equivalent strip had already been given the same
    // treatment by hand; putting it in the component means the next caller
    // can't forget it. Same pattern as PersonalTabs.tsx.
    <div role="tablist" className={`max-w-full overflow-x-auto scrollbar-hide ${className}`}>
      {items.map((item, index) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(el) => { buttonRefs.current[item.id] = el; }}
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={tabClassName(active)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Wrap each tab's content in this so it's a real `tabpanel` linked to its tab. */
export function TabPanel({ idPrefix, id, children, className }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
