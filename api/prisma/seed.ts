// Seeds the catalog from the frontend's static data (app/src/lib/data.ts) so the
// live API serves the same companies the mock did. Idempotent: clears the catalog
// and reinserts. Aggregates (rating/reviewCount) are RECOMPUTED from the seeded
// review rows — consistent with the admin add/delete-review path — so they reflect
// the actual reviews present, not the mock's curated display numbers.
//
// Run: npm run seed
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";
import { COMPANIES, SERVICE_CATEGORIES } from "../../app/src/lib/data";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

function aggregate(reviews: { rating: number }[]): {
  rating: number;
  reviewCount: number;
} {
  const reviewCount = reviews.length;
  if (!reviewCount) return { rating: 0, reviewCount: 0 };
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  return { rating: Math.round((sum / reviewCount) * 10) / 10, reviewCount };
}

async function main() {
  // Safety guard: this script DELETES the whole catalog before reseeding. That is
  // fine on a fresh/empty database, but catastrophic if run against production —
  // it would wipe every real lead, review, and company.
  //
  // History note (2026-07-20): the old guard keyed off Lead.count() > 0 only. All
  // leads were deleted earlier that day, so the guard passed and a stray seed run
  // (with DATABASE_URL pointing at prod) erased the live catalog. The guard below
  // is deliberately stricter: it treats the DB as "live" if it holds ANY users,
  // companies, or leads, AND it hard-refuses whenever DATABASE_URL points at the
  // Supabase production host — even with --force — unless SEED_I_KNOW is also set.
  const force =
    process.argv.includes("--force") || process.env.SEED_ALLOW_DESTRUCTIVE === "1";

  // Hard block: never seed the production database from a normal run.
  const looksLikeProd = /pooler\.supabase\.com|supabase\.co/i.test(connectionString);
  if (looksLikeProd && process.env.SEED_I_KNOW !== "1") {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at a Supabase production host. ` +
        `This script ERASES the entire catalog. If you *really* mean to rebuild ` +
        `production, set SEED_I_KNOW=1 as well. Point DATABASE_URL at your LOCAL ` +
        `dev database for normal seeding.`,
    );
  }

  const [leadCount, userCount, companyCount] = await Promise.all([
    prisma.lead.count(),
    prisma.user.count(),
    prisma.company.count(),
  ]);
  const looksLive = leadCount > 0 || userCount > 0 || companyCount > 0;
  if (looksLive && !force) {
    throw new Error(
      `Refusing to seed: the database already looks live ` +
        `(${userCount} user(s), ${companyCount} company(ies), ${leadCount} lead(s)). ` +
        `This script DELETES all companies, projects, leads, and reviews before ` +
        `reseeding. Re-run with --force (or SEED_ALLOW_DESTRUCTIVE=1) ONLY if you ` +
        `truly intend to erase and rebuild the catalog.`,
    );
  }

  // NON-DESTRUCTIVE: this seed never deletes anything anymore (that behaviour wiped
  // production on 2026-07-20). It only inserts into an EMPTY catalog. If any catalog
  // rows already exist, we abort instead of touching them — reset your LOCAL dev DB
  // yourself (e.g. `docker compose -f docker-compose.dev.yml down -v && up -d`) if you
  // really want a clean slate.
  const [catCount, projCount, revCount] = await Promise.all([
    prisma.category.count(),
    prisma.project.count(),
    prisma.review.count(),
  ]);
  if (companyCount > 0 || catCount > 0 || projCount > 0 || revCount > 0) {
    throw new Error(
      `Refusing to seed: the catalog is not empty ` +
        `(${companyCount} companies, ${catCount} categories, ${projCount} projects, ` +
        `${revCount} reviews). This seed only populates an EMPTY database and never ` +
        `deletes data. Reset your local dev DB first if you want a fresh seed.`,
    );
  }

  // Categories — slug → generated id map for linking companies.
  const categoryIdBySlug = new Map<string, string>();
  for (const cat of SERVICE_CATEGORIES) {
    const created = await prisma.category.create({
      data: {
        slug: cat.slug,
        label: cat.label,
        description: cat.description,
        icon: cat.icon,
        cover: cat.cover,
        isActive: true,
      },
    });
    categoryIdBySlug.set(cat.slug, created.id);
  }

  // Companies (+ nested projects & reviews), with recomputed aggregates.
  let companyCount = 0;
  for (const c of COMPANIES) {
    const categoryId = categoryIdBySlug.get(c.category);
    if (!categoryId) {
      throw new Error(`Company "${c.slug}" references unknown category "${c.category}"`);
    }
    const { rating, reviewCount } = aggregate(c.reviews);

    await prisma.company.create({
      data: {
        categoryId,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        about: c.about,
        logo: c.logo,
        cover: c.cover,
        services: c.services,
        gallery: c.gallery,
        badges: c.badges,
        phone: c.phone,
        location: c.location,
        yearsExperience: c.yearsExperience,
        responseTime: c.responseTime,
        verifiedSince: c.verifiedSince,
        completedProjects: c.completedProjects,
        rating,
        reviewCount,
        featured: c.featured ?? true,
        verified: c.verified ?? false,
        status: "ACTIVE",
        projects: {
          create: c.projects.map((p, i) => ({
            title: p.title,
            img: p.img,
            description: p.description,
            year: p.year,
            sortOrder: i,
          })),
        },
        reviews: {
          create: c.reviews.map((r) => ({
            author: r.author,
            avatar: r.avatar,
            rating: r.rating,
            text: r.text,
            date: r.date,
            district: r.district,
          })),
        },
      },
    });
    companyCount += 1;
  }

  // Keep the dev provider test user (provider@aura.test) linked to Aura Interiors
  // after a reseed, if that user exists. (Company delete nulls the FK.)
  const aura = await prisma.company.findUnique({
    where: { slug: "aura-interiors" },
    select: { id: true },
  });
  if (aura) {
    await prisma.user.updateMany({
      where: { email: "provider@aura.test" },
      data: { companyId: aura.id },
    });
  }

  console.log(
    `Seeded ${SERVICE_CATEGORIES.length} categories and ${companyCount} companies.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
