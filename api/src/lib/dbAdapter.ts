// Builds the Prisma driver adapter (node-postgres) for both the Next.js runtime
// and the standalone scripts (prisma/seed.ts, prisma/create-admin.ts).
//
// Why this exists: the Supabase pooler presents a certificate chain that Node's
// default trust store doesn't include, and recent node-postgres enforces STRICT
// TLS verification when the connection string carries `sslmode=require` — which
// fails with "self-signed certificate in certificate chain". So when SSL is
// requested we strip `sslmode` from the URL and pass an explicit ssl config.
//
// TLS verification: when DATABASE_SSL_CA_PATH points at the Supabase project CA
// certificate (Dashboard → Settings → Database → SSL), we verify the chain against
// it (`sslmode=verify-full` semantics) — the correct production posture, closing
// the MITM window on the DB connection. Without a CA we fall back to encrypted-but-
// unverified TLS (libpq's `sslmode=require` behavior); we warn in production so the
// weaker mode can't ship silently. A plain/local URL (no sslmode, or `disable`)
// gets no SSL, so local Docker Postgres keeps working.
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";

// Read + cache the CA once (avoids a disk read per connection).
let cachedCa: string | null | undefined;
function loadCa(): string | null {
  if (cachedCa !== undefined) return cachedCa;
  const path = process.env.DATABASE_SSL_CA_PATH?.trim();
  cachedCa = path ? readFileSync(path, "utf8") : null;
  return cachedCa;
}

// Fail fast instead of hanging. Without these, a connection that goes bad
// mid-use (Prisma surfaces this as P1017 ConnectionClosed) leaves node-postgres
// to fall back on the OS's own TCP timeout before it notices and retries —
// observed locally taking several MINUTES per request, during which every
// caller (including the mobile app's maintenance/session bootstrap, which
// gates the entire first paint — see app/_layout.tsx) just hangs with nothing
// to show. Both callers already handle a fast rejection gracefully (try/catch
// with a sane fallback); they were never built to survive an open-ended one.
const CONNECTION_TIMEOUT_MS = 8_000;
const IDLE_TIMEOUT_MS = 15_000;

// ── Query timeout ─────────────────────────────────────────────────────────────
// connectionTimeoutMillis above bounds ACQUIRING a connection. It says nothing
// about how long a query may then run, and those are different failures: a
// single pathological statement (a missing index after a data-shape change, a
// lock wait) holds its pool slot indefinitely, and node-postgres' default pool
// is 10. Ten of those and every subsequent request queues until it hits the 8s
// acquisition timeout — the API stops answering while Postgres reports itself
// perfectly healthy.
//
// `statement_timeout` is enforced by the SERVER, so it also covers a client that
// has gone away: Postgres cancels the query and releases the slot rather than
// finishing work for nobody.
//
// 15s is far above anything this app runs (the heaviest reads are
// /admin/companies?pageSize=200 and the /admin/stats aggregates, both well under
// a second on a healthy database) and comfortably below the 8s+ that the client
// timeouts already give up at. Set DATABASE_STATEMENT_TIMEOUT_MS=0 to disable —
// which the seed and migration paths do NOT need, since both run many small
// statements rather than one long one.
const STATEMENT_TIMEOUT_MS = (() => {
  const raw = process.env.DATABASE_STATEMENT_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") return 15_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 15_000;
})();

/**
 * libpq `options` string applied to every connection in the pool, or undefined
 * when the timeout is disabled.
 */
function connectionOptions(): string | undefined {
  return STATEMENT_TIMEOUT_MS > 0 ? `-c statement_timeout=${STATEMENT_TIMEOUT_MS}` : undefined;
}

export function createPgAdapter(connectionString: string): PrismaPg {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const wantsSsl = sslmode !== null && sslmode !== "disable";

  if (!wantsSsl) {
    return new PrismaPg({
      connectionString,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      options: connectionOptions(),
    });
  }

  url.searchParams.delete("sslmode");

  const ca = loadCa();
  const ssl = ca
    ? { ca, rejectUnauthorized: true }
    : { rejectUnauthorized: false };

  if (!ca && process.env.NODE_ENV === "production") {
    console.warn(
      "[db] TLS certificate verification is OFF (encrypted but unverified). " +
        "Set DATABASE_SSL_CA_PATH to the Supabase CA cert to enable full verification.",
    );
  }

  return new PrismaPg({
    connectionString: url.toString(),
    ssl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    options: connectionOptions(),
  });
}
