// Site-review (platform testimonial) business logic. Visitor submissions are held
// for moderation (visible=false); admins toggle visibility and open/close intake.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/utils/errors";
import type { ApiPage, ApiSiteReview, ApiSiteReviewPayload } from "@/lib/apiTypes";

// AppSetting key for the global "submissions open" flag.
const REVIEWS_ENABLED_KEY = "site_reviews_enabled";

// Structural row type — avoids depending on generated model-type exports.
interface SiteReviewRow {
  id: string;
  name: string;
  district: string;
  rating: number;
  text: string;
  visible: boolean;
  createdAt: Date;
}

function serialize(r: SiteReviewRow): ApiSiteReview {
  return {
    id: r.id,
    name: r.name,
    district: r.district,
    rating: r.rating,
    text: r.text,
    visible: r.visible,
    createdAt: r.createdAt.getTime(), // DateTime → epoch ms
  };
}

/** Public: visible reviews, newest first (homepage). */
export async function listPublic(): Promise<ApiSiteReview[]> {
  const rows = await prisma.siteReview.findMany({
    where: { visible: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

export interface SiteReviewListQuery {
  search?: string; // matches name / district / text
  page?: number;
  pageSize?: number;
}

const SITE_REVIEW_DEFAULT_PAGE_SIZE = 20;
const SITE_REVIEW_MAX_PAGE_SIZE = 100;

/** Case-insensitive OR filter across the human-searchable site-review fields. */
function siteReviewSearchWhere(search?: string): Prisma.SiteReviewWhereInput {
  const s = search?.trim();
  if (!s) return {};
  return {
    OR: [
      { name: { contains: s, mode: "insensitive" } },
      { district: { contains: s, mode: "insensitive" } },
      { text: { contains: s, mode: "insensitive" } },
    ],
  };
}

/**
 * Admin: all reviews (visible and hidden), newest first. Optional `search` filters
 * in the DB. Returns the full (filtered) array — default response shape unchanged,
 * so existing callers keep working. Use `listPage` for bounded pagination.
 */
export async function listAll(query: SiteReviewListQuery = {}): Promise<ApiSiteReview[]> {
  const rows = await prisma.siteReview.findMany({
    where: siteReviewSearchWhere(query.search),
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

/** Admin: paginated reviews (newest first), filterable by `search`. */
export async function listPage(query: SiteReviewListQuery): Promise<ApiPage<ApiSiteReview>> {
  const where = siteReviewSearchWhere(query.search);
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const pageSize = Math.min(
    SITE_REVIEW_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? SITE_REVIEW_DEFAULT_PAGE_SIZE) || SITE_REVIEW_DEFAULT_PAGE_SIZE),
  );
  const [total, rows] = await Promise.all([
    prisma.siteReview.count({ where }),
    prisma.siteReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, pageSize } };
}

/** Public: create a review, held for moderation (visible=false). */
export async function create(payload: ApiSiteReviewPayload): Promise<ApiSiteReview> {
  const row = await prisma.siteReview.create({
    data: {
      name: payload.name,
      district: payload.district,
      rating: payload.rating,
      text: payload.text,
      visible: false,
    },
  });
  return serialize(row);
}

/** Admin: show/hide a review on the homepage. */
export async function setVisible(id: string, visible: boolean): Promise<ApiSiteReview> {
  const existing = await prisma.siteReview.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Review");
  const row = await prisma.siteReview.update({ where: { id }, data: { visible } });
  return serialize(row);
}

/** Admin: delete a review. */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.siteReview.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Review");
  await prisma.siteReview.delete({ where: { id } });
}

/** Whether public submissions are open. Defaults to true when unset. */
export async function getEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: REVIEWS_ENABLED_KEY } });
  return row ? row.value !== "false" : true;
}

/** Admin: open/close public submissions. */
export async function setEnabled(enabled: boolean): Promise<boolean> {
  await prisma.appSetting.upsert({
    where: { key: REVIEWS_ENABLED_KEY },
    create: { key: REVIEWS_ENABLED_KEY, value: String(enabled) },
    update: { value: String(enabled) },
  });
  return enabled;
}
