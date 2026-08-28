// One-time backfill: fills labelAr/descriptionAr (Category), nameAr (Company)
// for the existing catalog rows with real Arabic translations of their
// existing English content — not fake/new data, just the Arabic form of what's
// already there. Offering is deliberately NOT touched here: there are no
// offerings in production yet, and future ones get their Arabic fields from
// whoever creates them (admin/provider), same as any other new row.
//
//   npx tsx prisma/backfill-bilingual-content.ts            # apply
//   npx tsx prisma/backfill-bilingual-content.ts --dry-run  # report only
//
// IDEMPOTENT: only fills a row whose *Ar column is still NULL — never
// overwrites a value an admin/provider already entered through the editor.
// Keyed by slug, so it's safe to re-run and safe to extend later for a new
// category/company added after this runs (it just won't have an entry here
// and will be skipped, same as any row already translated).
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Same production guard as backfill-clients.ts / backfill-offerings.ts — this
// is meant to run against production (that's the whole point: prod is what's
// missing the translations), but never by accident.
const PROD_HOSTS = ["pooler.supabase.com", "supabase.co"];
const host = (() => {
  try { return new URL(connectionString).hostname; } catch { return ""; }
})();
if (PROD_HOSTS.some((h) => host.endsWith(h)) && process.env.BACKFILL_I_KNOW !== "1") {
  throw new Error(
    `Refusing to run the backfill against what looks like production (${host}).\n` +
      `Set BACKFILL_I_KNOW=1 if you genuinely mean it.`,
  );
}

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

const CATEGORY_AR: Record<string, { labelAr: string; descriptionAr: string }> = {
  "interior-finishing": {
    labelAr: "التشطيبات والديكور الداخلي",
    descriptionAr: "تصميم وتنفيذ متكامل للمساحات السكنية والتجارية.",
  },
  "smart-home": {
    labelAr: "المنازل الذكية والأمان",
    descriptionAr: "أتمتة منزلية، كاميرات مراقبة، تحكم في الدخول، وإدارة المناخ.",
  },
  landscape: {
    labelAr: "تنسيق الحدائق والمساحات الخارجية",
    descriptionAr: "تصميم حدائق حائز على جوائز، مسابح، ومساحات معيشة خارجية.",
  },
  furniture: {
    labelAr: "الأثاث والديكور",
    descriptionAr: "أثاث فاخر مخصص، وتنسيق داخلي، وإكسسوارات منزلية مميزة.",
  },
  construction: {
    labelAr: "الإنشاءات والبناء",
    descriptionAr: "أعمال إنشائية، وتشطيبات جاهزة، ومقاولات متكاملة تسليم مفتاح.",
  },
  moving: {
    labelAr: "خدمات النقل",
    descriptionAr: "نقل احترافي للمنازل والشركات.",
  },
};

const COMPANY_AR: Record<string, string> = {
  "aura-interiors": "أورا إنتيريورز",
  "nextech-living": "نكست تك ليفينج",
  "eden-landscapes": "إيدن لاند سكيبس",
  "apex-architecture": "أبيكس أركيتكتشر",
};

async function main() {
  const categories = await prisma.category.findMany({
    where: { slug: { in: Object.keys(CATEGORY_AR) }, labelAr: null },
    select: { id: true, slug: true, label: true },
  });
  const companies = await prisma.company.findMany({
    where: { slug: { in: Object.keys(COMPANY_AR) }, nameAr: null },
    select: { id: true, slug: true, name: true },
  });

  console.log(`Categories to fill: ${categories.length}`);
  for (const c of categories) console.log(`  ${c.slug} (${c.label}) -> ${CATEGORY_AR[c.slug].labelAr}`);
  console.log(`Companies to fill: ${companies.length}`);
  for (const c of companies) console.log(`  ${c.slug} (${c.name}) -> ${COMPANY_AR[c.slug]}`);

  if (dryRun) {
    console.log("\n--dry-run: no writes made.");
    return;
  }

  for (const c of categories) {
    const ar = CATEGORY_AR[c.slug];
    await prisma.category.update({
      where: { id: c.id },
      data: { labelAr: ar.labelAr, descriptionAr: ar.descriptionAr },
    });
  }
  for (const c of companies) {
    await prisma.company.update({ where: { id: c.id }, data: { nameAr: COMPANY_AR[c.slug] } });
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
