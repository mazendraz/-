import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { prefersReducedMotion } from "../lib/motion";
import type { CategoryPricingMode } from "../lib/data";

/** The id OfferingCards' wrapping <section> in CompanyProfile.tsx carries. */
export const PRICING_SECTION_ID = "pricing-section";
const HIGHLIGHT_MS = 1200;

/**
 * Scroll to the pricing cards and give them a brief highlight so the customer
 * actually notices what just happened — a scroll with nothing to mark the
 * destination reads as "the page jumped", not "here are the services".
 * Skips the halo (but still scrolls, just instantly) under reduced motion.
 */
function goToPricingSection(): void {
  const el = document.getElementById(PRICING_SECTION_ID);
  if (!el) return;
  const reduced = prefersReducedMotion();
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  if (reduced) return;
  el.classList.add("ring-2", "ring-primary/40", "transition-shadow", "duration-slow");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), HIGHLIGHT_MS);
}

export interface PricingCTAProps {
  /** Undefined (legacy cached data) reads the same as QUOTE_ONLY — the old Link behavior. */
  pricingMode: CategoryPricingMode | undefined;
  requestHref: string;
  className: string;
  /** Icon for the FIXED_CATALOG button — pass the same icon (or omit) each call
   *  site used for its QUOTE_ONLY content, to keep the two states visually
   *  aligned at that spot. */
  catalogIcon?: string;
  /** Exact QUOTE_ONLY content (icon + label) — rendered completely unchanged,
   *  in the same <Link>, so that mode stays byte-for-byte what it was before
   *  this component existed. */
  children: ReactNode;
}

/**
 * Replaces the 4 separate "Request Service" buttons on a company profile with
 * one shared behavior (see phase-9-category-pricing-mode.md §5):
 *
 *   QUOTE_ONLY (or unknown)  → unchanged: a direct <Link> to the empty form.
 *   FIXED_CATALOG            → a button that brings the pricing cards into
 *                               view instead of skipping straight past them
 *                               into an empty form.
 *
 * The busy/waitlist CTA is a completely separate code path at every call site
 * and is never routed through this component — this only ever replaces the
 * "available" state's button.
 */
export default function PricingCTA({
  pricingMode, requestHref, className, catalogIcon, children,
}: PricingCTAProps) {
  const { locale } = useLocale();

  if (pricingMode !== "FIXED_CATALOG") {
    return <Link to={requestHref} className={className}>{children}</Link>;
  }

  return (
    <button type="button" onClick={goToPricingSection} className={className}>
      {catalogIcon && <span className="material-symbols-outlined text-title" aria-hidden="true" translate="no">{catalogIcon}</span>}
      {t(locale, "profile_choose_services")}
    </button>
  );
}
