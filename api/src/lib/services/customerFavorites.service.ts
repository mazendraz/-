/**
 * The account's saved companies ("المفضلة").
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Favorites used to be device-local — AsyncStorage on mobile, localStorage on
 * the web — so one account had a different shortlist on every client it was
 * signed into. That is the one piece of per-customer state that never reached
 * the database, and it is exactly what "one account, one server-side data
 * state" rules out. This is the server side of moving them onto the account.
 *
 * ── The client contract is SLUGS, the storage is IDS ───────────────────────
 * Both clients already speak company slugs everywhere (routes, cards, the
 * heart toggle), and rewriting them to carry ids would have been a much larger
 * change for no benefit. So the API takes and returns slugs and this module is
 * the one place that translates — the row still points at `companyId`, which
 * is what a foreign key and a cascade need.
 *
 * ── Idempotence ────────────────────────────────────────────────────────────
 * `add` is an upsert and `remove` a deleteMany, both scoped to the caller's own
 * customerId. That matters more than it looks: the sign-in merge below replays
 * a device's whole local list at the server, and two devices merging the same
 * company must not race into a duplicate — the @@unique([customerId, companyId])
 * makes that impossible and the upsert makes it silent.
 */
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/utils/errors";

/** The account's saved company slugs, newest first. */
export async function list(customerId: string): Promise<string[]> {
  const rows = await prisma.customerFavorite.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { company: { select: { slug: true } } },
  });
  return rows.map((r) => r.company.slug);
}

/**
 * Resolve a slug to a company id, or throw 404.
 *
 * Deliberately NOT filtered by status: a customer who saved a company that has
 * since been paused should keep the save (and see it return if the company comes
 * back), rather than have it silently vanish from their shortlist.
 */
async function companyIdForSlug(slug: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company not found");
  return company.id;
}

/** Save one company. Idempotent. Returns the account's full list afterwards. */
export async function add(customerId: string, slug: string): Promise<string[]> {
  const companyId = await companyIdForSlug(slug);
  await prisma.customerFavorite.upsert({
    where: { customerId_companyId: { customerId, companyId } },
    create: { customerId, companyId },
    update: {},
  });
  return list(customerId);
}

/** Unsave one company. Idempotent — removing what isn't there is not an error. */
export async function remove(customerId: string, slug: string): Promise<string[]> {
  const companyId = await companyIdForSlug(slug);
  await prisma.customerFavorite.deleteMany({ where: { customerId, companyId } });
  return list(customerId);
}

/**
 * Fold a device's local shortlist into the account's, then hand back the union.
 *
 * This is what runs the first time a client with existing local favorites
 * signs in. It is additive ON PURPOSE and never deletes: the device's list is
 * evidence of intent ("I saved these"), while its ABSENCES are not evidence of
 * anything — a company missing locally may simply have been saved on another
 * device the day before. Treating the local list as authoritative would let an
 * old phone silently wipe a shortlist built elsewhere, which is the one
 * outcome a merge must never produce.
 *
 * Unknown slugs are skipped rather than failing the whole merge: a local list
 * can outlive a company that has since been removed from the catalogue, and
 * one stale entry must not cost the customer the rest of their saves.
 */
export async function merge(customerId: string, slugs: string[]): Promise<string[]> {
  const wanted = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length > 0) {
    const companies = await prisma.company.findMany({
      where: { slug: { in: wanted } },
      select: { id: true },
    });
    if (companies.length > 0) {
      await prisma.customerFavorite.createMany({
        data: companies.map((c) => ({ customerId, companyId: c.id })),
        // The unique constraint is what makes replaying a merge safe; this is
        // what stops it throwing when the row is already there.
        skipDuplicates: true,
      });
    }
  }
  return list(customerId);
}
