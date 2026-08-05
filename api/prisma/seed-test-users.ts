// Bootstraps the two fixed accounts the mobile UI-audit suite logs in as
// (app/tests/auth.setup.ts): one ADMIN and one PROVIDER linked to a real
// company. Without them, `/admin` and `/provider` render the login screen and
// the whole dashboard half of that matrix silently measures a login form
// instead of a dashboard — see DASHBOARD-MOBILE-AUDIT.md § DM-01.
//
// Idempotent and NON-destructive: it only upserts these two rows. It never
// deletes anything, so unlike seed.ts it is safe to re-run over a populated
// dev database.
//
// Deliberately NOT reusing create-admin.ts: that script promotes an arbitrary
// email to ADMIN from env/flags (a deploy-time bootstrap), whereas the test
// suite needs two accounts at FIXED, checked-in credentials that any machine
// can reproduce. Different jobs.
//
// Run: npm run seed:test-users
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";

// Keep in sync with BCRYPT_ROUNDS in src/lib/auth.ts (and create-admin.ts).
const BCRYPT_ROUNDS = 12;

// Fixed credentials — these are LOCAL TEST accounts on a throwaway dev
// database, which is why they can live in the repo. The guard below is what
// keeps them from ever being created anywhere real.
export const TEST_ADMIN = {
  email: "e2e-admin@local.test",
  password: "e2e-admin-pass-2026",
  name: "E2E Admin",
};
export const TEST_PROVIDER = {
  email: "e2e-provider@local.test",
  password: "e2e-provider-pass-2026",
  name: "E2E Provider",
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

async function main() {
  // Same hard block as seed.ts. This script is additive rather than
  // destructive, but creating a known-password ADMIN on production would be
  // strictly worse than wiping a table — it is a backdoor with the credentials
  // published in the repo. No --force escape hatch on purpose.
  const looksLikeProd = /pooler\.supabase\.com|supabase\.co/i.test(connectionString ?? "");
  if (looksLikeProd) {
    throw new Error(
      "Refusing to create test users: DATABASE_URL points at a Supabase production host. " +
        "These accounts have fixed, repo-visible passwords and must only ever exist on a " +
        "local dev database. Point DATABASE_URL at localhost:5433 and re-run.",
    );
  }

  // The provider dashboard resolves its company from the session user's
  // companyId (useMyCompany → /provider/profile); a PROVIDER with a null
  // companyId lands on the "no company" dead end instead of the dashboard, and
  // every provider route in the matrix would measure that screen. Pin to a
  // stable company so screenshot baselines don't churn when seed order changes.
  const company =
    (await prisma.company.findUnique({ where: { slug: "aura-interiors" }, select: { id: true, name: true } })) ??
    (await prisma.company.findFirst({ orderBy: { slug: "asc" }, select: { id: true, name: true } }));

  if (!company) {
    throw new Error(
      "No companies in the database — run `npm run seed` first, otherwise the " +
        "provider test user has nothing to be a provider OF.",
    );
  }

  const [adminHash, providerHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN.password, BCRYPT_ROUNDS),
    bcrypt.hash(TEST_PROVIDER.password, BCRYPT_ROUNDS),
  ]);

  // `update` re-credentials an existing row so a half-broken leftover from an
  // earlier run (deactivated, wrong role, unlinked company) repairs itself
  // rather than failing the suite with a 401 nobody can explain.
  await prisma.user.upsert({
    where: { email: TEST_ADMIN.email },
    update: { passwordHash: adminHash, role: "ADMIN", isActive: true, name: TEST_ADMIN.name },
    create: {
      email: TEST_ADMIN.email,
      passwordHash: adminHash,
      role: "ADMIN",
      isActive: true,
      name: TEST_ADMIN.name,
    },
  });

  await prisma.user.upsert({
    where: { email: TEST_PROVIDER.email },
    update: {
      passwordHash: providerHash,
      role: "PROVIDER",
      isActive: true,
      name: TEST_PROVIDER.name,
      companyId: company.id,
    },
    create: {
      email: TEST_PROVIDER.email,
      passwordHash: providerHash,
      role: "PROVIDER",
      isActive: true,
      name: TEST_PROVIDER.name,
      companyId: company.id,
    },
  });

  console.log(`Test users ready:
  ADMIN     ${TEST_ADMIN.email} / ${TEST_ADMIN.password}
  PROVIDER  ${TEST_PROVIDER.email} / ${TEST_PROVIDER.password}  → ${company.name}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
