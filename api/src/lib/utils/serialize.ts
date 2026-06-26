// Serializers: map Prisma rows → API contract shapes (src/lib/apiTypes.ts).
// Centralizes the boundary conversions: DateTime → epoch ms, LeadStatus enum ↔
// display label, and the derived fields (company.category/categoryLabel,
// lead.companySlug/companyName) that come from relations.
import { LeadStatus } from "@/generated/prisma/enums";
import type {
  Category,
  Company,
  Lead,
  Project,
  Review,
} from "@/generated/prisma/client";
import type {
  ApiAdminCategory,
  ApiCategory,
  ApiCompany,
  ApiLead,
  ApiLeadStatus,
  ApiProject,
  ApiReview,
} from "@/lib/apiTypes";

// ── Primitives ────────────────────────────────────────────────────────────────

/** DateTime → epoch milliseconds (ApiLead.createdAt is a Number). */
export function toEpochMs(date: Date): number {
  return date.getTime();
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

export type CompanyWithRelations = Company & {
  category: Pick<Category, "slug" | "label">;
  projects: Project[];
  reviews: Review[];
};

export type LeadWithCompany = Lead & {
  company: Pick<Company, "slug" | "name">;
};

// ── Entity serializers ────────────────────────────────────────────────────────

export function serializeProject(p: Project): ApiProject {
  return {
    title: p.title,
    img: p.img,
    description: p.description,
    year: p.year,
    featured: p.featured ?? false,
  };
}

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

/** count = number of ACTIVE companies, computed live by the caller. */
export function serializeCategory(c: Category, count: number): ApiCategory {
  return {
    slug: c.slug,
    label: c.label,
    description: c.description,
    icon: c.icon,
    cover: c.cover ?? "",
    count,
    metaTitle: c.metaTitle ?? null,
    metaDescription: c.metaDescription ?? null,
  };
}

/** Admin view — adds id + isActive to the public category shape. */
export function serializeCategoryAdmin(
  c: Category,
  count: number,
): ApiAdminCategory {
  return { id: c.id, isActive: c.isActive, ...serializeCategory(c, count) };
}

// Company row with only the category relation (no projects/reviews) — the shape
// the list/card serializer needs.
export type CompanyCardRow = Company & {
  category: Pick<Category, "slug" | "label">;
};

// Scalar + category fields shared by the card and full serializers.
function companyScalars(c: CompanyCardRow) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    about: c.about,
    logo: c.logo,
    cover: c.cover,
    category: c.category.slug,
    categoryLabel: c.category.label,
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
  return { ...companyScalars(c), projects: [], reviews: [] };
}

export function serializeCompany(c: CompanyWithRelations): ApiCompany {
  return {
    ...companyScalars(c),
    projects: c.projects.map(serializeProject),
    reviews: c.reviews.map(serializeReview),
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
  };
}
