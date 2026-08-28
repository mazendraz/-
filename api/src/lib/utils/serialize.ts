// Serializers: map Prisma rows → API contract shapes (src/lib/apiTypes.ts).
// Centralizes the boundary conversions: DateTime → epoch ms, LeadStatus enum ↔
// display label, and the derived fields (company.category/categoryLabel,
// lead.companySlug/companyName) that come from relations.
import { LeadStatus } from "@/generated/prisma/enums";
import type {
  BundleRule,
  Category,
  Client,
  Company,
  BusyWindow,
  FinancialAccount,
  Lead,
  LeadCompletion,
  LeadItem,
  Notification,
  Offering,
  OfferingTier,
  Project,
  Review,
  Transaction,
  TransactionCategory,
  WaitlistEntry,
} from "@/generated/prisma/client";
import { serializeOffering, serializeBundleRule } from "@/lib/services/offerings.service";
import type {
  ApiAdminCategory,
  ApiCategory,
  ApiClient,
  ApiCompany,
  ApiCustomerNotification,
  ApiFinancialAccount,
  ApiLead,
  ApiLeadCompletion,
  ApiLeadItem,
  ApiLeadStatus,
  ApiProject,
  ApiReview,
  ApiTransaction,
  ApiTransactionCategory,
  ApiWaitlistEntry,
} from "@/lib/apiTypes";

// ── Primitives ────────────────────────────────────────────────────────────────

/** DateTime → epoch milliseconds (ApiLead.createdAt is a Number). */
export function toEpochMs(date: Date): number {
  return date.getTime();
}

/**
 * Effective availability. A company is unavailable when EITHER holds:
 *
 *   • the manual switch is on and has not auto-expired
 *     (busy === true AND (busyUntil is null OR still in the future))
 *   • any scheduled window is currently running
 *     (startsAt <= now AND (endsAt is null OR still in the future))
 *
 * Everything is derived at READ time — no cron, nothing to fall behind. A window
 * or a busyUntil passes and the very next read reports the company available.
 *
 * `windows` is REQUIRED and deliberately has no `= []` default. A default would
 * not "keep old call sites working", it would make them silently WRONG: any path
 * that forgot to load the windows would show a busy company as available, and a
 * customer would send a request to someone who cannot take it. Making it
 * mandatory turns that into a compile error instead.
 */
export function isEffectivelyBusy(
  c: Pick<Company, "busy" | "busyUntil">,
  windows: Pick<BusyWindow, "startsAt" | "endsAt">[],
): boolean {
  const now = Date.now();
  const manual = c.busy === true && (c.busyUntil == null || c.busyUntil.getTime() > now);
  if (manual) return true;
  return windows.some(
    (w) => w.startsAt.getTime() <= now && (w.endsAt == null || w.endsAt.getTime() > now),
  );
}

/** When the current unavailability ends. null = no end date, or not busy. */
export function nextAvailableAt(
  c: Pick<Company, "busy" | "busyUntil">,
  windows: Pick<BusyWindow, "startsAt" | "endsAt">[],
): number | null {
  const now = Date.now();
  const ends: number[] = [];
  if (c.busy === true && c.busyUntil != null && c.busyUntil.getTime() > now) {
    ends.push(c.busyUntil.getTime());
  }
  for (const w of windows) {
    if (w.startsAt.getTime() <= now && w.endsAt != null && w.endsAt.getTime() > now) {
      ends.push(w.endsAt.getTime());
    }
  }
  // Open-ended unavailability (busy with no busyUntil, or a window with no
  // endsAt) yields nothing here — correctly, since there is no date to show.
  if (ends.length === 0) return null;
  // The LAST end wins: overlapping periods mean the company is busy until the
  // furthest one finishes, not the nearest.
  return Math.max(...ends);
}

/** Start of the soonest window that has not begun yet — "busy from 5 Aug". */
export function upcomingBusyFrom(
  windows: Pick<BusyWindow, "startsAt" | "endsAt">[],
): number | null {
  const now = Date.now();
  const future = windows
    .filter((w) => w.startsAt.getTime() > now)
    .map((w) => w.startsAt.getTime());
  return future.length ? Math.min(...future) : null;
}

/** Customer-facing reason for the current unavailability, if there is one. */
export function busyReason(
  c: Pick<Company, "busy" | "busyUntil" | "busyNote">,
  windows: Pick<BusyWindow, "startsAt" | "endsAt" | "note">[],
): string | null {
  const now = Date.now();
  if (c.busy === true && (c.busyUntil == null || c.busyUntil.getTime() > now) && c.busyNote) {
    return c.busyNote;
  }
  const active = windows.find(
    (w) => w.startsAt.getTime() <= now && (w.endsAt == null || w.endsAt.getTime() > now),
  );
  return active?.note ?? null;
}

const STATUS_TO_LABEL: Record<LeadStatus, ApiLeadStatus> = {
  [LeadStatus.NEW]: "New",
  [LeadStatus.CONTACTED]: "Contacted",
  [LeadStatus.IN_PROGRESS]: "In Progress",
  [LeadStatus.COMPLETED]: "Completed",
  [LeadStatus.CANCELLED]: "Cancelled",
};

const LABEL_TO_STATUS: Record<ApiLeadStatus, LeadStatus> = {
  New: LeadStatus.NEW,
  Contacted: LeadStatus.CONTACTED,
  "In Progress": LeadStatus.IN_PROGRESS,
  Completed: LeadStatus.COMPLETED,
  Cancelled: LeadStatus.CANCELLED,
};

export function leadStatusToLabel(status: LeadStatus): ApiLeadStatus {
  return STATUS_TO_LABEL[status];
}

export function leadStatusFromLabel(label: ApiLeadStatus): LeadStatus {
  return LABEL_TO_STATUS[label];
}

// ── Relation-augmented row types ──────────────────────────────────────────────

// One CompanyCategory junction row as loaded for serialization — the category
// it points to, plus whether this is the company's one primary link (see
// schema.prisma CompanyCategory for the one-primary-per-company invariant).
export type CompanyCategoryLink = {
  isPrimary: boolean;
  category: Pick<Category, "slug" | "label" | "pricingMode">;
};

export type CompanyWithRelations = Company & {
  categories: CompanyCategoryLink[];
  projects: Project[];
  reviews: Review[];
  // Required for the same reason as on CompanyCardRow — see the note there.
  busyWindows: BusyWindow[];
  // Optional so the detail/public queries that don't ask for it still typecheck;
  // only the admin list needs it.
  _count?: { leads: number };
  // Optional so callers that predate Feature B still typecheck. A missing value
  // serializes to [] — the profile just shows no priced offerings, which is the
  // correct reading of "this query did not ask for them".
  offerings?: (Offering & { tiers: OfferingTier[] })[];
  // Same contract as `offerings`: absent means "not asked for", which serializes
  // to [] and therefore to no discount in the client's preview.
  bundleRules?: BundleRule[];
};

export type LeadWithCompany = Lead & {
  company: Pick<Company, "slug" | "name">;
  // Optional so callers predating Feature C still typecheck; a missing value
  // serializes to [] — the classic single-service request.
  items?: LeadItem[];
  // Optional so callers that don't include the relation still typecheck; a
  // missing value serializes to no `completion` key at all (see serializeLead) —
  // "not asked for" must not be confused with "provider hasn't completed this".
  completion?: LeadCompletion | null;
};

// ── Entity serializers ────────────────────────────────────────────────────────

/**
 * Public project shape: deliberately omits `id` and `status`. The public profile
 * only ever returns APPROVED projects, so status is redundant, and exposing row
 * ids on public payloads serves no purpose. Pairs with serializeProjectAdmin.
 */
export function serializeProject(p: Project): ApiProject {
  return {
    title: p.title,
    img: p.img,
    description: p.description,
    year: p.year,
    featured: p.featured ?? false,
  };
}

/**
 * Admin/provider project shape: the public fields PLUS `id` and `status`, which
 * the per-project management UI needs to edit/delete and see moderation state.
 */
export function serializeProjectAdmin(p: Project): ApiProject {
  return {
    ...serializeProject(p),
    id: p.id,
    status: p.status,
  };
}

/**
 * Public review shape: omits `id` (see ApiReview). Pairs with serializeReviewAdmin,
 * which adds the id the per-review management UI needs.
 */
export function serializeReview(r: Review): ApiReview {
  return {
    author: r.author,
    avatar: r.avatar,
    rating: r.rating,
    text: r.text,
    date: r.date,
    district: r.district,
    verified: r.verified,
  };
}

/** Admin/provider review shape: the public fields PLUS `id` for management. */
export function serializeReviewAdmin(r: Review): ApiReview {
  return { ...serializeReview(r), id: r.id };
}

/** count = number of ACTIVE companies, computed live by the caller. */
export function serializeCategory(c: Category, count: number): ApiCategory {
  return {
    slug: c.slug,
    label: c.label,
    description: c.description,
    icon: c.icon,
    cover: c.cover ?? "",
    count,
    pricingMode: c.pricingMode,
    metaTitle: c.metaTitle ?? null,
    metaDescription: c.metaDescription ?? null,
    labelAr: c.labelAr ?? null,
    descriptionAr: c.descriptionAr ?? null,
  };
}

/**
 * Admin view — adds id + isActive to the public category shape, plus how many
 * of its companies currently have a published Offering (see
 * ApiAdminCategory.publishedOfferingCompanyCount for why).
 */
export function serializeCategoryAdmin(
  c: Category,
  count: number,
  publishedOfferingCompanyCount: number,
): ApiAdminCategory {
  return {
    id: c.id,
    isActive: c.isActive,
    publishedOfferingCompanyCount,
    ...serializeCategory(c, count),
  };
}

// Company row with only the categories relation (no projects/reviews) — the
// shape the list/card serializer needs.
export type CompanyCardRow = Company & {
  categories: CompanyCategoryLink[];
  // REQUIRED, not optional. Same reason isEffectivelyBusy takes a mandatory
  // parameter: an optional field with a `?? []` fallback would let a query that
  // forgot to load the windows compile fine and quietly report a busy company as
  // available. Making it required means TypeScript names every call site that
  // needs fixing. Load it via include (single company) or grouped in memory from
  // one query (list endpoints) — never per row.
  busyWindows: BusyWindow[];
};

// Scalar + category fields shared by the card and full serializers. A company
// may belong to several categories (see CompanyCategory) — `category`/
// `categoryLabel`/`categoryPricingMode` are the PRIMARY one (what every single-
// value display spot shows), and `categories` carries the full membership for
// editors and anything that needs it.
function companyScalars(c: CompanyCardRow) {
  const windows = c.busyWindows;
  // The DB guarantees exactly one isPrimary=true row per company (partial unique
  // index); the `?? c.categories[0]` fallback only guards a malformed test
  // fixture that forgot to mark one, never a real row.
  const primary = c.categories.find((cc) => cc.isPrimary) ?? c.categories[0];
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    nameAr: c.nameAr ?? null,
    tagline: c.tagline,
    about: c.about,
    logo: c.logo,
    cover: c.cover,
    category: primary.category.slug,
    categoryLabel: primary.category.label,
    categoryPricingMode: primary.category.pricingMode,
    categories: c.categories.map((cc) => ({
      slug: cc.category.slug,
      label: cc.category.label,
      pricingMode: cc.category.pricingMode,
      isPrimary: cc.isPrimary,
    })),
    services: c.services,
    rating: c.rating,
    reviewCount: c.reviewCount,
    completedProjects: c.completedProjects,
    gallery: c.gallery,
    phone: c.phone,
    location: c.location,
    yearsExperience: c.yearsExperience,
    responseTime: c.responseTime,
    verifiedSince: c.verifiedSince,
    badges: c.badges,
    featured: c.featured,
    verified: c.verified,
    // Effective busy state — the manual switch OR any running scheduled window,
    // all resolved at read time (see isEffectivelyBusy).
    busy: isEffectivelyBusy(c, windows),
    busyUntil: c.busyUntil ? toEpochMs(c.busyUntil) : null,
    busyNote: c.busyNote ?? null,
    nextAvailableAt: nextAvailableAt(c, windows),
    upcomingBusyFrom: upcomingBusyFrom(windows),
    busyReason: busyReason(c, windows),
    metaTitle: c.metaTitle ?? null,
    metaDescription: c.metaDescription ?? null,
  };
}

/**
 * List/card view: the full ApiCompany shape but with EMPTY projects/reviews. The
 * public list endpoints omit those heavy relations (they'd pull every review for
 * every listed company); the detail route (/companies/[slug]) returns them. Same
 * wire shape as serializeCompany, so the frontend Company type is unchanged — the
 * profile/provider pages fetch the full record by slug to fill the arrays.
 */
export function serializeCompanyCard(c: CompanyCardRow): ApiCompany {
  // Card payloads deliberately skip the heavy relations — list endpoints ask for
  // dozens of companies at once and none of this is rendered on a card.
  return { ...companyScalars(c), projects: [], reviews: [], offerings: [] };
}

export function serializeCompany(c: CompanyWithRelations): ApiCompany {
  return {
    ...companyScalars(c),
    projects: c.projects.map(serializeProject),
    reviews: c.reviews.map(serializeReview),
    offerings: (c.offerings ?? []).map(serializeOffering),
    bundleRules: (c.bundleRules ?? []).map(serializeBundleRule),
  };
}

/**
 * Admin view: the full company PLUS the internal contact fields (email/whatsapp)
 * that the public serializers deliberately omit. Used only by admin endpoints so
 * the company editor can display and round-trip them (lead notifications go here).
 */
export function serializeCompanyAdmin(c: CompanyWithRelations): ApiCompany {
  return {
    ...serializeCompany(c),
    email: c.email ?? null,
    whatsapp: c.whatsapp ?? null,
    // Admin-only: lets the editor show whether the rating is a manual override.
    ratingOverridden: c.ratingOverridden,
    // Exact, from a COUNT — not derived from whatever lead page the browser has.
    ...(c._count ? { leadCount: c._count.leads } : {}),
    // Business Control Center only — null means "use the platform default",
    // see finance.service.ts resolveCommissionPercent.
    commissionPercent: c.commissionPercent != null ? Number(c.commissionPercent) : null,
  };
}

export type WaitlistEntryWithCompany = WaitlistEntry & {
  company: Pick<Company, "slug" | "name">;
};

export function serializeCustomerNotification(n: Notification): ApiCustomerNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url ?? null,
    read: n.read,
    createdAt: toEpochMs(n.createdAt),
  };
}

/**
 * The priced basket frozen onto a waitlist entry, in the shape the client already
 * reads for a lead's items.
 *
 * The snapshot is a `ResolvedRequest` written whole by waitlist.service.join, and
 * its lines carry everything ApiLeadItem needs except `id` — the lines are not
 * rows and have none until conversion creates the LeadItems. The index stands in:
 * it is stable for a given entry (the array is never reordered or written again)
 * and is used for nothing but React keys until then.
 *
 * Everything is defensive here because the column is Json: a row written before it
 * existed reads as null, and one written by hand can be any shape at all.
 */
function waitlistItems(snapshot: unknown): ApiLeadItem[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const lines = (snapshot as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  return lines.map((line, i) => {
    const l = line as Record<string, unknown>;
    return {
      id: `${i}`,
      offeringId: (l.offeringId as string) ?? null,
      nameSnapshot: (l.nameSnapshot as string) ?? "",
      tierLabel: (l.tierLabel as string) ?? null,
      qty: typeof l.qty === "number" ? l.qty : 1,
      pricingModel: l.pricingModel as ApiLeadItem["pricingModel"],
      unitPriceMin: typeof l.unitPriceMin === "number" ? l.unitPriceMin : null,
      unitPriceMax: typeof l.unitPriceMax === "number" ? l.unitPriceMax : null,
      lineMin: typeof l.lineMin === "number" ? l.lineMin : null,
      lineMax: typeof l.lineMax === "number" ? l.lineMax : null,
    };
  });
}

function waitlistNumber(snapshot: unknown, key: string): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const v = (snapshot as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

export function serializeWaitlistEntry(e: WaitlistEntryWithCompany): ApiWaitlistEntry {
  const snapshot = e.itemsSnapshot;
  return {
    id: e.id,
    companyId: e.companyId,
    companySlug: e.company.slug,
    companyName: e.company.name,
    name: e.name,
    phone: e.phone,
    service: e.service ?? null,
    note: e.note ?? null,
    status: e.status,
    createdAt: toEpochMs(e.createdAt),
    convertedLeadId: e.convertedLeadId ?? null,
    // Null on entries joined through the short form that predates the full one —
    // see the WaitlistEntry model comment.
    district: e.district ?? null,
    budget: e.budget ?? null,
    // Coerced to the same non-optional shape serializeLead emits, and for the
    // same reason: a payload whose keys come and go makes every client guard
    // each field.
    items: waitlistItems(snapshot),
    estimatedMin: waitlistNumber(snapshot, "estimatedMin"),
    estimatedMax: waitlistNumber(snapshot, "estimatedMax"),
    discountPercent: waitlistNumber(snapshot, "discountPercent") ?? 0,
    hasOnInspection:
      typeof snapshot === "object" && snapshot !== null
        ? (snapshot as { hasOnInspection?: unknown }).hasOnInspection === true
        : false,
  };
}

export function serializeLead(l: LeadWithCompany): ApiLead {
  return {
    id: l.id,
    refNumber: l.refNumber,
    companySlug: l.company.slug,
    companyName: l.company.name,
    service: l.service,
    name: l.customerName,
    phone: l.phone,
    district: l.district,
    budget: l.budget,
    description: l.description,
    status: leadStatusToLabel(l.status),
    reviewed: l.reviewedAt != null, // true only when a review date is set
    createdAt: toEpochMs(l.createdAt),
    // Feature C. Prices here are snapshots from submission — never recomputed.
    items: (l.items ?? []).map(serializeLeadItem),
    // Coerced rather than passed straight through: a real row always has these,
    // but a serializer that can emit `undefined` produces a payload whose keys
    // come and go, and every client ends up guarding each field.
    estimatedMin: l.estimatedMin ?? null,
    estimatedMax: l.estimatedMax ?? null,
    discountPercent: l.discountPercent ?? 0,
    hasOnInspection: l.hasOnInspection ?? false,
    // Absent (not null) when the relation wasn't loaded OR the provider hasn't
    // completed this lead yet — both read as "no completion" to the client,
    // which is the correct behavior either way.
    ...(l.completion ? { completion: serializeLeadCompletion(l.completion) } : {}),
  };
}

/**
 * verificationStatus values (PENDING/CONFIRMED/DISCREPANCY) are identical
 * strings on both sides of the boundary — unlike LeadStatus, no label mapping
 * table is needed.
 */
export function serializeLeadCompletion(c: LeadCompletion): ApiLeadCompletion {
  return {
    providerAmount: c.providerAmount,
    additionalWorkDescription: c.additionalWorkDescription ?? null,
    additionalWorkAmount: c.additionalWorkAmount ?? null,
    notes: c.notes ?? null,
    attachments: c.attachments,
    finalTotal: c.providerAmount + (c.additionalWorkAmount ?? 0),
    submittedAt: toEpochMs(c.submittedAt),
    verificationStatus: c.verificationStatus,
    clientAmount: c.clientAmount ?? null,
    discrepancyNote: c.discrepancyNote ?? null,
    verifiedAt: c.verifiedAt ? toEpochMs(c.verifiedAt) : null,
  };
}

function serializeLeadItem(i: LeadItem): ApiLeadItem {
  return {
    id: i.id,
    offeringId: i.offeringId,
    nameSnapshot: i.nameSnapshot,
    tierLabel: i.tierLabel,
    qty: i.qty,
    pricingModel: i.pricingModel as ApiLeadItem["pricingModel"],
    unitPriceMin: i.unitPriceMin,
    unitPriceMax: i.unitPriceMax,
    lineMin: i.lineMin,
    lineMax: i.lineMax,
  };
}

// ── Business Control Center (desktop app) ────────────────────────────────────

export function serializeClient(
  c: Client,
  agg: { totalRequests: number; successfulServices: number; totalValue: number },
): ApiClient {
  // 90 days: the same "still relevant" horizon BusyWindow-style features in
  // this codebase use for "does this still matter" cutoffs — no product
  // decision has fixed this number, it's a documented v1 default (see
  // ApiClient.status doc comment) and easy to move to an AppSetting later if
  // Al Asima wants it configurable without a redeploy.
  const ACTIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  const isActive = Date.now() - c.lastSeenAt.getTime() <= ACTIVE_WINDOW_MS;
  return {
    id: c.id,
    phone: c.phone,
    name: c.name,
    firstSeenAt: toEpochMs(c.firstSeenAt),
    lastSeenAt: toEpochMs(c.lastSeenAt),
    totalRequests: agg.totalRequests,
    successfulServices: agg.successfulServices,
    totalValue: agg.totalValue,
    status: isActive ? "ACTIVE" : "DORMANT",
  };
}

export function serializeFinancialAccount(a: FinancialAccount): ApiFinancialAccount {
  return { id: a.id, name: a.name, type: a.type, isActive: a.isActive };
}

export function serializeTransactionCategory(c: TransactionCategory): ApiTransactionCategory {
  return { id: c.id, name: c.name, kind: c.kind, isActive: c.isActive };
}

export type TransactionWithRelations = Transaction & {
  account: Pick<FinancialAccount, "name"> | null;
  category: Pick<TransactionCategory, "name"> | null;
  lead: Pick<Lead, "refNumber"> | null;
  company: Pick<Company, "name"> | null;
};

export function serializeTransaction(t: TransactionWithRelations): ApiTransaction {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amount: t.amount,
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    leadId: t.leadId,
    leadRefNumber: t.lead?.refNumber ?? null,
    companyId: t.companyId,
    companyName: t.company?.name ?? null,
    note: t.note ?? null,
    attachments: t.attachments,
    occurredAt: toEpochMs(t.occurredAt),
    createdById: t.createdById,
    createdAt: toEpochMs(t.createdAt),
  };
}
