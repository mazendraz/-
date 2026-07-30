// Backfill: turn each string in Company.services into a published Offering.
//
//   npx tsx prisma/backfill-offerings.ts            # apply
//   npx tsx prisma/backfill-offerings.ts --dry-run  # report only
//
// Priced ON_INSPECTION because the old `services` array carried no price
// information — inventing one would be worse than saying "we'll quote you".
// Published immediately: these services are ALREADY public today, so leaving
// them as drafts would silently empty every company profile.
//
// IDEMPOTENT via `migratedFromService` + the @@unique([companyId,
// migratedFromService]) index. Deliberately not keyed on `name`: a unique index
// on name would permanently stop a company having two offerings called
// "Installation" under different headings — a permanent product constraint paid
// for a one-off migration.
//
// Company.services is NOT dropped here. The frontend keeps reading it as a
// fallback until Feature B's UI has shipped and settled; removing the column is
// its own migration, later.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Same production guard as seed.ts. This writes to every company in the
// database, so an accidental run against prod is not a small mistake.
const PROD_HOSTS = ["pooler.supabase.com", "supabase.co"];
const host = (() => {
  try { return new URL(connectionString).hostname; } catch { return ""; }
})();
if (PROD_HOSTS.some((h) => host.endsWith(h)) && process.env.BACKFILL_I_KNOW !== "1") {
  throw new Error(
    `Refusing to run the backfill against what looks like production (${host}).\n` +
      `Run it locally, or set BACKFILL_I_KNOW=1 if you genuinely mean it.`,
  );
}

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, services: true },
  });

  let created = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const company of companies) {
    const raw = company.services.map((s) => s.trim()).filter(Boolean);
    const unique = [...new Set(raw)];

    // Explicit de-dup with a warning. Without this, upsert would quietly collapse
    // duplicates and the offering count would come out lower than the service
    // count — nobody would notice until a provider reported a missing service.
    if (unique.length !== raw.length) {
      const dupes = raw.filter((s, i) => raw.indexOf(s) !== i);
      duplicates += raw.length - unique.length;
      console.warn(
        `  ⚠ ${company.name}: duplicate service name(s) collapsed — ${[...new Set(dupes)].join(", ")}`,
      );
    }

    for (const [index, service] of unique.entries()) {
      const existing = await prisma.offering.findUnique({
        where: { companyId_migratedFromService: { companyId: company.id, migratedFromService: service } },
        select: { id: true },
      });

      if (existing) { skipped += 1; continue; }

      if (!dryRun) {
        await prisma.offering.create({
          data: {
            companyId: company.id,
            name: service,
            kind: "SERVICE",
            pricingModel: "ON_INSPECTION",
            isPublished: true,
            isActive: true,
            sortOrder: index,
            migratedFromService: service,
          },
        });
      }
      created += 1;
    }
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}created ${created} · skipped ${skipped} (already migrated) · ${duplicates} duplicate name(s)`,
  );
  if (dryRun) console.log("Nothing was written. Re-run without --dry-run to apply.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("✗ backfill failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
