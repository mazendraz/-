// The one behavioral signal the notifications system needs (see
// CustomerUser.lastViewedCategory* in schema.prisma): the MOST RECENT
// category a signed-in customer viewed, for the 14-day inactive-browsing
// re-engagement email (notifications.reengagement.service.ts) to reference
// something real instead of sending generic copy. Deliberately not an event
// log — one row, overwritten on every view.
import { prisma } from "@/lib/prisma";

/**
 * Record that this customer just viewed a category. Best-effort: a lost
 * write here means one future email is slightly less targeted, never
 * something worth failing the screen load over — so this never throws, and
 * callers fire it without awaiting.
 */
export async function recordCategoryView(customerId: string, categorySlug: string): Promise<void> {
  try {
    const category = await prisma.category.findUnique({
      where: { slug: categorySlug },
      select: { slug: true, label: true, labelAr: true },
    });
    if (!category) return; // an unknown/stale slug — nothing to record
    await prisma.customerUser.update({
      where: { id: customerId },
      data: {
        lastViewedCategorySlug: category.slug,
        lastViewedCategoryLabel: category.labelAr || category.label,
        lastViewedCategoryAt: new Date(),
      },
    });
  } catch (err) {
    console.error(`[browsing] recordCategoryView failed for customer ${customerId}:`, err);
  }
}
