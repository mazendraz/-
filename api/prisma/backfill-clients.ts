// Backfill: create a Client row for every distinct phone number already on a
// Lead, and set Lead.clientId to point at it. One-time — every NEW lead from
// here on gets its Client upserted live (see leads.service.createLeadRecord /
// clients.service.upsertClientForLead).
//
//   npx tsx prisma/backfill-clients.ts            # apply
//   npx tsx prisma/backfill-clients.ts --dry-run  # report only
//
// IDEMPOTENT: Client.phone is @unique, and every lead is only ever assigned a
// clientId once here (WHERE clientId IS NULL) — re-running after a partial
// failure just picks up where it left off.
//
// firstSeenAt is backfilled from the EARLIEST lead for that phone (not "now")
// so a client who has been requesting services for months doesn't suddenly
// read as brand new the day this migration runs — that would corrupt the
// Clients & CRM screen's "New Clients" and retention numbers on day one.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Same production guard as seed.ts / backfill-offerings.ts. This writes
// across the whole Lead table.
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
  const leads = await prisma.lead.findMany({
    where: { clientId: null },
    select: { id: true, phone: true, customerName: true, createdAt: true },
    orderBy: { createdAt: "asc" }, // earliest-first, so "the name we keep" is deterministic
  });

  // Group by phone in memory — the lead volumes this codebase is built for
  // (architecture doc §11: hundreds to low thousands) make this cheap; a
  // table large enough for this to matter would need a SQL GROUP BY rewrite,
  // same caveat as pricingIntelligence.service.ts's MAX_ROWS_FOR_KPIS.
  const byPhone = new Map<string, typeof leads>();
  for (const lead of leads) {
    const bucket = byPhone.get(lead.phone) ?? [];
    bucket.push(lead);
    byPhone.set(lead.phone, bucket);
  }

  let clientsCreated = 0;
  let clientsReused = 0;
  let leadsLinked = 0;

  for (const [phone, group] of byPhone) {
    const earliest = group[0]!;
    const mostRecent = group[group.length - 1]!;

    let clientId: string;
    const existingClient = await prisma.client.findUnique({ where: { phone }, select: { id: true } });
    if (existingClient) {
      clientId = existingClient.id;
      clientsReused += 1;
    } else {
      clientId = existingClient ?? "PENDING"; // placeholder, overwritten below when not dry-run
      clientsCreated += 1;
      if (!dryRun) {
        const created = await prisma.client.create({
          data: {
            phone,
            name: mostRecent.customerName, // most-recent name, matching upsertClientForLead's live behavior
            firstSeenAt: earliest.createdAt,
            lastSeenAt: mostRecent.createdAt,
          },
        });
        clientId = created.id;
      }
    }

    if (!dryRun) {
      await prisma.lead.updateMany({
        where: { id: { in: group.map((l) => l.id) } },
        data: { clientId },
      });
    }
    leadsLinked += group.length;
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${clientsCreated} client(s) created · ${clientsReused} reused · ${leadsLinked} lead(s) linked`,
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
