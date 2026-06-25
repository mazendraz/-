// Loads .env (Prisma 7 does not auto-load it) and points the CLI at the schema.
// The datasource URL itself is declared in prisma/schema.prisma via env().
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Wires `npx prisma db seed` (Prisma 7 reads the seed command from here, not
    // from package.json's "prisma.seed"). Same script as `npm run seed`.
    seed: "tsx prisma/seed.ts",
  },
  // Used by Prisma Migrate / Studio (CLI). Migrations must run over a DIRECT /
  // session connection (port 5432), NOT a transaction pooler (6543/pgbouncer),
  // so prefer DIRECT_URL and fall back to DATABASE_URL when it isn't set.
  // The runtime app client uses DATABASE_URL via a driver adapter in
  // src/lib/prisma.ts (that one may point at the transaction pooler on serverless).
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
