// Zod schemas for offerings, tiers and bundle rules.
//
// The cross-field rules here are the ones that keep a price MEANINGFUL. A row
// that passes the column types but says "quoted after inspection — 5,000 EGP" is
// worse than a rejected write: the customer sees a contradiction and the
// provider never finds out which half of it applies.
import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";

const text = (max: number) => z.string().transform(stripHtml).pipe(z.string().max(max));

const PRICING_MODELS = ["FIXED", "RANGE", "PER_UNIT", "ON_INSPECTION"] as const;
const OFFERING_KINDS = ["SERVICE", "PRODUCT"] as const;
export const PRICE_UNITS = [
  "SQM", "METER", "PIECE", "DOOR", "WINDOW", "ROOM", "APARTMENT", "HOUR", "DAY", "JOB",
] as const;

// Egyptian pounds, whole numbers. The cap is a typo guard — someone meaning
// 50,000 who types an extra zero twice should be stopped, not published.
const price = z.number().int().min(0).max(100_000_000);

const offeringBase = z.object({
  name: text(120).pipe(z.string().min(1, "Name is required")),
  description: text(2000).nullish(),
  kind: z.enum(OFFERING_KINDS).optional(),
  pricingModel: z.enum(PRICING_MODELS).optional(),
  priceMin: price.nullish(),
  priceMax: price.nullish(),
  unit: z.enum(PRICE_UNITS).nullish(),
  minQty: z.number().int().positive().max(1_000_000).nullish(),
  image: text(500).nullish(),
  note: text(300).nullish(),
});

type OfferingShape = z.infer<typeof offeringBase>;

/** The cross-field pricing rules, shared by create and update. */
function refinePricing(data: Partial<OfferingShape>, ctx: z.RefinementCtx, model?: string): void {
  const pricingModel = model ?? data.pricingModel;
  if (!pricingModel) return;

  const { priceMin, priceMax, unit } = data;

  if (pricingModel === "ON_INSPECTION") {
    // "Quoted after inspection" and a number on the same card contradict each
    // other, and the customer has no way to know which one is real.
    if (priceMin != null || priceMax != null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceMin"],
        message: "An inspection-quoted offering can't carry a price.",
      });
    }
    return;
  }

  if (pricingModel === "FIXED") {
    if (priceMin == null) {
      ctx.addIssue({ code: "custom", path: ["priceMin"], message: "A fixed price is required." });
    }
    if (priceMax != null && priceMax !== priceMin) {
      ctx.addIssue({
        code: "custom", path: ["priceMax"],
        message: "A fixed price can't also have a maximum. Use a range instead.",
      });
    }
  }

  if (pricingModel === "RANGE") {
    if (priceMin == null || priceMax == null) {
      ctx.addIssue({
        code: "custom", path: ["priceMax"],
        message: "A range needs both a minimum and a maximum.",
      });
    } else if (priceMin > priceMax) {
      ctx.addIssue({
        code: "custom", path: ["priceMax"],
        message: "The maximum can't be lower than the minimum.",
      });
    }
  }

  if (pricingModel === "PER_UNIT") {
    if (priceMin == null) {
      ctx.addIssue({ code: "custom", path: ["priceMin"], message: "A per-unit price is required." });
    }
    if (!unit) {
      // Without a unit "2,500" is meaningless — per square metre? per door?
      ctx.addIssue({ code: "custom", path: ["unit"], message: "Choose a unit for a per-unit price." });
    }
    if (priceMax != null && priceMin != null && priceMax < priceMin) {
      ctx.addIssue({ code: "custom", path: ["priceMax"], message: "The maximum can't be lower than the minimum." });
    }
  }
}

export const createOfferingSchema = offeringBase.superRefine((data, ctx) =>
  refinePricing(data, ctx, data.pricingModel ?? "RANGE"),
);

/**
 * Update takes a partial patch, but pricing consistency is a property of the
 * FINAL row, not of the patch. The route merges the patch over the current row
 * and validates that — `validateMergedOffering` below.
 */
export const updateOfferingSchema = offeringBase.partial().refine(
  (o) => Object.keys(o).length > 0,
  "At least one field is required",
);

/** Validate a patch merged over the existing row. Throws a ZodError on failure. */
export const mergedOfferingSchema = offeringBase.superRefine((data, ctx) =>
  refinePricing(data, ctx, data.pricingModel ?? "RANGE"),
);

export const visibilitySchema = z
  .object({
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((o) => o.isActive !== undefined || o.sortOrder !== undefined, {
    message: "Provide isActive or sortOrder",
  });

export const tierSchema = z
  .object({
    label: text(80).pipe(z.string().min(1, "Label is required")),
    qtyMin: z.number().int().positive().max(1_000_000).nullish(),
    qtyMax: z.number().int().positive().max(1_000_000).nullish(),
    priceMin: price.nullish(),
    priceMax: price.nullish(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.qtyMin != null && t.qtyMax != null && t.qtyMin > t.qtyMax) {
      ctx.addIssue({ code: "custom", path: ["qtyMax"], message: "Maximum quantity can't be lower than the minimum." });
    }
    if (t.priceMin != null && t.priceMax != null && t.priceMin > t.priceMax) {
      ctx.addIssue({ code: "custom", path: ["priceMax"], message: "Maximum price can't be lower than the minimum." });
    }
  });

export const bundleRuleSchema = z.object({
  label: text(80).nullish(),
  // Fewer than two items is not a bundle.
  minItems: z.number().int().min(2).max(50),
  // Capped at 50%: past that it is almost certainly a typo (95 instead of 9.5),
  // and it would be published straight onto a customer's total.
  discountPercent: z.number().int().min(1).max(50),
});

export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>;
export type TierInput = z.infer<typeof tierSchema>;
export type BundleRuleInput = z.infer<typeof bundleRuleSchema>;
