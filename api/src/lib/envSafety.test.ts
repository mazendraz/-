// A guard against the single most dangerous file this repo can contain.
//
// ── What happened ────────────────────────────────────────────────────────────
// `api/.env.production` existed locally, holding the PRODUCTION Supabase
// credentials. CLAUDE.md treats that as safe because the file is gitignored and
// its contents are never copied into `.env`.
//
// It is not safe. Next.js loads `.env.production` AUTOMATICALLY whenever
// NODE_ENV=production, at a HIGHER precedence than `.env` — and both
// `next build` and `next start` set NODE_ENV=production. So `npm start` in
// api/, on a developer laptop, silently connects the local server to the
// production database. Confirmed by running it during this audit: the server
// came up and its queries went to aws-0-eu-west-1.pooler.supabase.com, not to
// localhost.
//
// This is the same class of accident as the July 2026 incident recorded in
// CLAUDE.md, where a seed run against a production DATABASE_URL destroyed real
// customer data. That incident was fixed by hardening the SEED script. The
// server itself was never hardened, and it reads the same credentials by a route
// nobody had to opt into.
//
// ── Why a test ───────────────────────────────────────────────────────────────
// A runtime guard would have to know which host is "production", and getting it
// wrong takes the real site down. A test costs nothing, fails loudly on the one
// machine where the file exists, and cannot affect production behaviour at all.
//
// ── How to fix it when this fails ────────────────────────────────────────────
// Keep the credentials, drop the magic filename — Next.js only auto-loads
// `.env`, `.env.local`, `.env.production`, `.env.production.local` and their
// development/test siblings:
//
//     mv api/.env.production api/.env.production.reference
//
// The deployed server is unaffected: it reads `api/.env` (see
// api/ecosystem.config.cjs), never `.env.production`.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Filenames Next.js loads by itself once NODE_ENV=production. */
const AUTOLOADED_IN_PRODUCTION = [".env.production", ".env.production.local"];

function looksRemote(url: string): boolean {
  const host = /@([^/:@]+)/.exec(url)?.[1] ?? "";
  return host !== "" && !/^(localhost|127\.0\.0\.1|::1|postgres|db)$/.test(host);
}

describe("no auto-loaded env file may point at a remote database", () => {
  it.each(AUTOLOADED_IN_PRODUCTION)(
    "%s does not silently override .env with production credentials",
    (filename) => {
      const path = resolve(process.cwd(), filename);
      if (!existsSync(path)) return; // the good case — nothing to override

      const contents = readFileSync(path, "utf8");
      const dbLine = /^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m.exec(contents)?.[1] ?? "";
      const host = /@([^/:@]+)/.exec(dbLine)?.[1] ?? "unknown";

      expect(
        looksRemote(dbLine),
        `${filename} exists and its DATABASE_URL points at "${host}".\n\n` +
          `Next.js auto-loads this file whenever NODE_ENV=production, ABOVE .env — ` +
          `and both "next build" and "next start" set NODE_ENV=production. Running ` +
          `npm start in api/ therefore points this machine's server at that database.\n\n` +
          `Fix: rename it so Next.js stops loading it automatically —\n` +
          `  mv api/${filename} api/${filename}.reference\n\n` +
          `The deployed server is unaffected: it reads api/.env (see ecosystem.config.cjs).`,
      ).toBe(false);
    },
  );
});
