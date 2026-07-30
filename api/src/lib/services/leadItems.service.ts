// Resolving a customer's item selection into priced, snapshotted lead lines.
//
// The customer sends offering ids, quantities and (optionally) a tier. The server
// looks up the REAL prices — it never trusts prices from the client, or the
// basket could be submitted with whatever total the browser felt like.
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/utils/errors";
import { calculateRequest, type PricedItem } from "@/lib/services/pricing";

/** What the client may send per line. Deliberately no prices. */
export interface RequestedItem {
  offeringId: string;
  qty?: number;
  tierId?: string | null;
}

export interface ResolvedLine {
  offeringId: string;
  nameSnapshot: string;
  tierLabel: string | null;
  qty: number;
  pricingModel: "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
  unitPriceMin: number | null;
  unitPriceMax: number | null;
  lineMin: number | null;
  lineMax: number | null;
}

export interface ResolvedRequest {
  lines: ResolvedLine[];
  estimatedMin: number | null;
  estimatedMax: number | null;
  discountPercent: number;
  hasOnInspection: boolean;
  /** Comma-joined item names — keeps Lead.service meaningful for older screens. */
  serviceSummary: string;
}

const MAX_ITEMS = 25;
const MAX_QTY = 10_000;

/**
 * Resolve requested items against the company's live catalogue and price them.
 *
 * Only PUBLISHED + ACTIVE offerings belonging to this company are accepted: a
 * draft or a hidden offering was never on the public profile, so a request for
 * one can only have come from a stale page or a hand-made payload.
 */
export async function resolveItems(
  companyId: string,
  requested: RequestedItem[],
): Promise<ResolvedRequest> {
  if (requested.length === 0) throw new ValidationError("Choose at least one service.");
  if (requested.length > MAX_ITEMS) {
    throw new ValidationError(`A request can include at most ${MAX_ITEMS} items.`);
  }

  const ids = [...new Set(requested.map((r) => r.offeringId))];
  const offerings = await prisma.offering.findMany({
    where: { id: { in: ids }, companyId, isPublished: true, isActive: true },
    // Published tiers ONLY. A tier price replaces the offering's for its line
    // (see below), so loading drafts here would let a hand-made payload name an
    // unreviewed tier id and be quoted from a price no admin ever approved —
    // the same reason the offering itself is filtered.
    include: { tiers: { where: { isPublished: true } } },
  });
  const byId = new Map(offerings.map((o) => [o.id, o]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new ValidationError(
      "Some of the selected services are no longer available. Please review your request.",
    );
  }

  const lines: ResolvedLine[] = requested.map((item) => {
    const offering = byId.get(item.offeringId)!;
    const qty = Math.min(MAX_QTY, Math.max(1, Math.trunc(item.qty ?? 1) || 1));

    // A tier price replaces the offering's own price for that line.
    const tier = item.tierId ? offering.tiers.find((t) => t.id === item.tierId) : undefined;
    if (item.tierId && !tier) {
      throw new ValidationError("One of the selected options is no longer available.");
    }

    const unitPriceMin = tier ? tier.priceMin : offering.priceMin;
    const unitPriceMax = tier ? tier.priceMax : offering.priceMax;

    return {
      offeringId: offering.id,
      // Snapshotted so the line still reads correctly if the offering is renamed
      // or deleted later — a request is a record, not a live view.
      nameSnapshot: offering.name,
      tierLabel: tier?.label ?? null,
      qty,
      pricingModel: offering.pricingModel as ResolvedLine["pricingModel"],
      unitPriceMin,
      unitPriceMax,
      lineMin: null,
      lineMax: null,
    };
  });

  // Only published + active rules can affect a customer's total.
  const rules = await prisma.bundleRule.findMany({
    where: { companyId, isPublished: true, isActive: true },
    select: { minItems: true, discountPercent: true },
  });

  const priced: PricedItem[] = lines.map((l) => ({
    qty: l.qty,
    pricingModel: l.pricingModel,
    unitPriceMin: l.unitPriceMin,
    unitPriceMax: l.unitPriceMax,
  }));
  const result = calculateRequest(priced, rules);

  result.lines.forEach((computed, i) => {
    lines[i].lineMin = computed.lineMin;
    lines[i].lineMax = computed.lineMax;
  });

  return {
    lines,
    estimatedMin: result.totalMin,
    estimatedMax: result.totalMax,
    discountPercent: result.discountPercent,
    hasOnInspection: result.hasOnInspection,
    // Lead.service is still read by the older lists, the notification emails and
    // the CSV export. Filling it keeps all of those working unchanged.
    serviceSummary: lines
      .map((l) => (l.qty > 1 ? `${l.nameSnapshot} ×${l.qty}` : l.nameSnapshot))
      .join(", ")
      .slice(0, 500),
  };
}
