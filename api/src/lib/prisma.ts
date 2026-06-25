// Prisma client singleton.
// Prisma 7 requires a driver adapter; we use node-postgres (pg) which works with
// Supabase Postgres. DATABASE_URL must be a plain `postgresql://` URL at runtime.
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/lib/dbAdapter";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: createPgAdapter(connectionString) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
