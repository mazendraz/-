// Seeds the catalog from the frontend's static data (app/src/lib/data.ts) so the
// live API serves the same companies the mock did. Idempotent: clears the catalog
// and reinserts. Aggregates (rating/reviewCount) are RECOMPUTED from the seeded
// review rows — consistent with the admin add/delete-review path — so they reflect
// the actual reviews present, not the mock's curated display numbers.
//
// Run: npm run seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COMPANIES, SERVICE_CATEGORIES } from "../../app/src/lib/data";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

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
  // Clear catalog (children first; company delete also cascades, but be explicit).
  await prisma.review.deleteMany();
  await prisma.project.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.company.deleteMany();
  await prisma.category.deleteMany();

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
