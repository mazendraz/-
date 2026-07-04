# Tests

## Unit tests

```bash
npm test            # runs everything in src/**/*.test.ts against no database
```

Unit tests never touch a real DB (a dummy `DATABASE_URL` is set in `vitest.setup.ts`).

## Integration tests

These run real route handlers against a **real Postgres**, creating and deleting
fixtures. A safety guard in [`tests/integration/setup.ts`](integration/setup.ts)
**refuses to run against a non-local database**, so they can never touch prod even
if `.env` points at Supabase.

### Run them locally

```bash
npm run test:db:up                     # start local Postgres (docker-compose.yml, :5433)
cp .env.test.example .env.test         # point the suite at it (gitignored)

# apply the schema to the test DB (Prisma reads DIRECT_URL/DATABASE_URL):
DIRECT_URL="postgresql://postgres:postgres@localhost:5433/alassema?schema=public" \
  npx prisma migrate deploy

npm run test:integration               # setup.ts loads .env.test automatically
npm run test:db:down                   # stop the DB (add -v to wipe)
```

### How the DB is selected

`setup.ts` loads `.env.test` if present (it wins over `.env`), else `.env`. Then it
asserts the resolved `DATABASE_URL` host is local (`localhost`/`127.0.0.1`/`db`/
`postgres`) — otherwise it throws with instructions. Override only if you know what
you're doing: `ALLOW_REMOTE_TEST_DB=1`.

CI already does the right thing: it spins up a Postgres service container and sets
`DATABASE_URL` to `localhost:5433`, so the guard passes and no `.env` is involved.
