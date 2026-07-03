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
