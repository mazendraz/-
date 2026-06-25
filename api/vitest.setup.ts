// Test env defaults. Importing modules that touch prisma.ts constructs the client
// (a connection pool, not an actual connection), which requires DATABASE_URL — set
// a dummy here so unit tests don't need .env or a live database.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-vitest";
