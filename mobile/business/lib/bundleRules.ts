import type { ApiBundleRule } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

export interface BundleRuleInput {
  label?: string | null;
  minItems: number;
  discountPercent: number;
}

/** GET/POST only — there is no provider-facing edit or delete route for a
 *  bundle rule once created (confirmed against the actual route files, not
 *  assumed); this screen is create + list, matching what the API actually
 *  supports. */
export function fetchBundleRules(): Promise<ApiBundleRule[]> {
  return apiGet<ApiBundleRule[]>("/provider/bundle-rules");
}

/** Created as a DRAFT, same publish rule as an offering — a discount is
 *  content that reaches customers, so it waits for review before it applies. */
export function createBundleRule(input: BundleRuleInput): Promise<ApiBundleRule> {
  return apiPost<ApiBundleRule>("/provider/bundle-rules", input);
}
