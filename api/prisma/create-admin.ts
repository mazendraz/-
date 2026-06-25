// Bootstraps the first ADMIN user so you can log into /admin after a fresh deploy.
// The catalog seed (seed.ts) does NOT create any admin — run this once per
// environment.
//
// Idempotent: if a user with the given email already exists it is PROMOTED to
// ADMIN and (optionally) its password is reset. Re-running is safe.
//
// Usage (credentials come from env or CLI flags; flags win):
//   ADMIN_EMAIL=you@site.com ADMIN_PASSWORD='strong-pass' npm run create-admin
//   npm run create-admin -- --email you@site.com --password 'strong-pass' --name 'Site Admin'
//
// In production set these as one-off env vars; never commit real credentials.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPgAdapter } from "../src/lib/dbAdapter";

// Keep in sync with BCRYPT_ROUNDS in src/lib/auth.ts.
const BCRYPT_ROUNDS = 12;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

/** Read a `--flag value` pair from argv, falling back to undefined. */
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = arg("password") ?? process.env.ADMIN_PASSWORD ?? "";
  const name = (arg("name") ?? process.env.ADMIN_NAME ?? "Site Admin").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid ADMIN_EMAIL (or --email) is required.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD (or --password) must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Upsert keeps this idempotent and also repairs an existing account: a returning
  // provider/locked-out admin is promoted to ADMIN, re-activated, and re-credentialed.
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", isActive: true, name },
    create: { email, passwordHash, role: "ADMIN", isActive: true, name },
  });

  console.log(`✓ Admin ready: ${user.email} (id ${user.id})`);
  console.log("  You can now log in at /admin with this email + password.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("✗ create-admin failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
