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
 * Every money column this resolves into (Lead.estimatedMin/Max,
 * LeadItem.lineMin/Max) is a Postgres INTEGER. The per-unit cap is 100,000,000
 * and the quantity cap is 10,000, so a single line can arithmetically reach
 * 10^12 — roughly 465x what int4 holds. Writing that produced a driver-level
 * numeric overflow, which withErrors could only report as a generic 500 on a
 * PUBLIC endpoint: the customer saw "Something went wrong" with no idea which
 * part of their basket caused it, and Sentry filled with an error that was
 * really a validation problem.
 */
const MAX_INT4 = 2_147_483_647;

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
  // A basket naming the same offering twice is rejected, not merged.
  //
  // This is not cosmetic. `calculateRequest` takes the bundle threshold from
  // items.length, so two lines for one offering is a second "item" the customer
  // never picked — enough on its own to trip a `minItems: 2` rule and put an
  // unearned discount onto the estimate that gets SNAPSHOTTED on the lead and
  // shown to the provider as the agreed number. The request form can't build
  // this (RequestItemPicker keys its selection by offeringId, so choosing a
  // different tier patches the existing line), which is exactly why it has to be
  // enforced here: the only way to send it is by hand, and the only reason to
  // send it is to move the total.
  if (ids.length !== requested.length) {
    throw new ValidationError(
      "The same service appears more than once in this request. Please review your selection.",
    );
  }
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

  // Refuse a basket whose maths doesn't fit the columns it has to be stored in
  // (see MAX_INT4). Checked here rather than inside calculateRequest so the
  // shared calculator stays a pure arithmetic function that agrees with its
  // frontend mirror case-for-case — this is a storage constraint, and it belongs
  // with the code that does the storing.
  const overflows = [
    result.totalMin, result.totalMax,
    ...result.lines.flatMap((l) => [l.lineMin, l.lineMax]),
  ].some((v) => v != null && v > MAX_INT4);
  if (overflows) {
    throw new ValidationError(
      "This request is too large to price automatically. Please reduce the quantities or contact the company directly.",
    );
  }

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
