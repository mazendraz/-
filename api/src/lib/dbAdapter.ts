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

export function createPgAdapter(connectionString: string): PrismaPg {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const wantsSsl = sslmode !== null && sslmode !== "disable";

  if (!wantsSsl) return new PrismaPg({ connectionString });

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

  return new PrismaPg({ connectionString: url.toString(), ssl });
}
