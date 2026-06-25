// Loads .env (Prisma 7 does not auto-load it) and points the CLI at the schema.
// The datasource URL itself is declared in prisma/schema.prisma via env().
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Used by Prisma Migrate / Studio (CLI). The runtime client uses the same URL
  // via a driver adapter in src/lib/prisma.ts.
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
