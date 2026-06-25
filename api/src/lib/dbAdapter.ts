// Builds the Prisma driver adapter (node-postgres) for both the Next.js runtime
// and the standalone scripts (prisma/seed.ts, prisma/create-admin.ts).
//
// Why this exists: the Supabase pooler presents a certificate chain that Node's
// default trust store doesn't include, and recent node-postgres enforces STRICT
// TLS verification when the connection string carries `sslmode=require` — which
// fails with "self-signed certificate in certificate chain". So when SSL is
// requested we strip `sslmode` from the URL and pass an explicit ssl config
// (still encrypted, just no CA verification — the same effective behavior as
// libpq's `sslmode=require`). A plain/local URL (no sslmode, or `disable`) gets
// no SSL, so local Docker Postgres keeps working.
import { PrismaPg } from "@prisma/adapter-pg";

export function createPgAdapter(connectionString: string): PrismaPg {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const wantsSsl = sslmode !== null && sslmode !== "disable";

  if (!wantsSsl) return new PrismaPg({ connectionString });

  url.searchParams.delete("sslmode");
  return new PrismaPg({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });
}
