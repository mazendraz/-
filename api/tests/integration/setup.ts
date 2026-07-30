// Integration-test bootstrap. These tests CREATE and DELETE real rows, so they must
// run against a throwaway local Postgres — never a shared/prod database.
//
// Env precedence: .env.test (a local test DB) wins over .env (which typically holds
// prod credentials). See api/.env.test.example + api/docker-compose.yml.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const testEnvPath = resolve(process.cwd(), ".env.test");
const dotEnvPath = resolve(process.cwd(), ".env");
if (existsSync(testEnvPath)) {
  // override:true so a local test DB always wins over any ambient DATABASE_URL.
  config({ path: testEnvPath, override: true });
} else if (existsSync(dotEnvPath)) {
  config({ path: dotEnvPath });
}
// else: rely on process.env already set (e.g. CI injects DATABASE_URL directly).

// ── Safety guard ──────────────────────────────────────────────────────────────
// Refuse to run the destructive suite against a non-local database. Without this,
// pointing api/.env at prod Supabase (the normal app config) would silently write
// and delete fixtures in production on every `npm run test:integration`.
function dbHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const host = dbHost(process.env.DATABASE_URL ?? "");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
  throw new Error(
    `Refusing to run integration tests against a non-local database ` +
      `(host: ${host || "unknown"}). These tests CREATE and DELETE data.\n` +
      `Use a local Postgres:\n` +
      `  docker compose up -d --wait db   # api/docker-compose.yml\n` +
      `  cp .env.test.example .env.test\n` +
      `  DIRECT_URL=$(grep DATABASE_URL .env.test | cut -d'"' -f2) npx prisma migrate deploy\n` +
      `  npm run test:integration\n` +
      `Or set ALLOW_REMOTE_TEST_DB=1 to override (NOT recommended against prod).`,
  );
}

// ── Known-good preconditions ──────────────────────────────────────────────────
// The suite shares the developer's local database, so it inherits whatever state
// was left in the admin UI. Maintenance mode is the one that bites: it makes
// EVERY public write return 503, which surfaced here as eight unrelated chat
// tests failing with "expected 503 to be 201" — a real afternoon lost to a
// switch someone flipped in another tab.
//
// Forced off for the run and restored afterwards, so a developer who left the
// site in maintenance finds it exactly as they left it.
import { afterAll, beforeAll } from "vitest";

// Imported INSIDE the hooks, not at module scope: `import` is hoisted above the
// dotenv calls above, and constructing the Prisma client reads DATABASE_URL at
// import time — so a static import here throws "DATABASE_URL is not set" before
// the env this file exists to load has been applied.
async function db() {
  const [{ prisma }, { MAINTENANCE_ENABLED_KEY }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/services/settings.service"),
  ]);
  return { prisma, key: MAINTENANCE_ENABLED_KEY };
}

let maintenanceWasOn = false;

beforeAll(async () => {
  const { prisma, key } = await db();
  const row = await prisma.appSetting.findUnique({ where: { key } });
  maintenanceWasOn = row?.value === "true";
  if (maintenanceWasOn) {
    await prisma.appSetting.update({ where: { key }, data: { value: "false" } });
  }
});

afterAll(async () => {
  if (!maintenanceWasOn) return;
  const { prisma, key } = await db();
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: "true" },
    update: { value: "true" },
  });
});
