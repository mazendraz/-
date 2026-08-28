// Guardrail for the maintenance gate.
//
// There is no global middleware here (see maintenance.ts), so every public write
// route is wrapped BY HAND. The realistic failure is not a bad exemption — it is
// someone adding a new public write endpoint six months from now and never
// thinking about maintenance, leaving it quietly accepting submissions while the
// site shows "we're down". Nobody notices until a customer complains.
//
// So: walk every route file, and for each one that exports a write verb and is
// not under admin/ | provider/ | auth/, require EITHER `withMaintenance` OR an
// explicit entry in EXEMPT below with a stated reason. A new route can't be
// silently forgotten — it fails here until someone makes a decision.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const API_DIR = join(process.cwd(), "src", "app", "api");
const WRITE_VERBS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Routes that are public-ish but must NOT be gated. Every entry needs a reason —
 * if you are adding one, say why blocking it during maintenance would be wrong.
 */
const EXEMPT: Record<string, string> = {
  "telegram/webhook/route.ts":
    "Inbound callback from the Telegram Bot API, authenticated by a webhook secret, " +
    "not a user submission. 503ing it makes Telegram retry and eventually disable the webhook.",
  "chat/summaries/route.ts":
    "A READ that is POST only because its body carries tracking tokens — the same " +
    "reason the single-thread endpoint takes its token in a header rather than the " +
    "query string. It creates and modifies nothing, so it falls under the existing " +
    "'reads stay open during maintenance' rule; the verb is about keeping secrets " +
    "out of access logs, not about writing.",
  "customer/sessions/route.ts":
    "Revoking a device session is a SECURITY control, not a submission. The person " +
    "reaching for 'sign out everywhere' has usually just lost a phone, and telling " +
    "them to come back after maintenance means leaving a live credential on it for " +
    "the duration. It only ever REMOVES access, so there is no state to protect by " +
    "blocking it.",
  "unsubscribe/route.ts":
    "The one write a customer must be able to make even during maintenance: a link " +
    "sitting in an already-delivered email, opened by someone who may never come " +
    "back to check whether it 'worked yet'. 503ing it means the opt-out silently " +
    "fails and the next marketing send goes out anyway. It only ever flips " +
    "marketingEmailEnabled to false, authenticated by a signed per-customer token " +
    "(not a user submission), so there is no meaningful state to protect by blocking it.",
};

/** Auth-gated prefixes: these are not public, and their dashboards stay usable. */
const AUTH_GATED_PREFIXES = ["admin/", "provider/", "auth/"];

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** Handlers that require a login are not public, whatever their path. */
function isAuthedHandler(src: string): boolean {
  return /=\s*(authed|adminOnly|providerOnly)\s*\(/.test(src);
}

function exportsWriteVerb(src: string): boolean {
  return WRITE_VERBS.some((v) =>
    new RegExp(`export\\s+(const|async\\s+function)\\s+${v}\\b`).test(src),
  );
}

describe("maintenance gate coverage", () => {
  const files = routeFiles(API_DIR).map((f) => ({
    rel: relative(API_DIR, f).split(sep).join("/"),
    src: readFileSync(f, "utf8"),
  }));

  it("finds route files to check (guards against a broken walker)", () => {
    // If the walk silently returns nothing, every assertion below passes
    // vacuously and the guardrail is worthless.
    expect(files.length).toBeGreaterThan(20);
  });

  const publicWriteRoutes = files.filter(
    (f) =>
      exportsWriteVerb(f.src) &&
      !AUTH_GATED_PREFIXES.some((p) => f.rel.startsWith(p)) &&
      !isAuthedHandler(f.src),
  );

  it("has public write routes to guard (the filter still matches reality)", () => {
    expect(publicWriteRoutes.length).toBeGreaterThan(0);
  });

  it.each(publicWriteRoutes.map((f) => [f.rel, f.src] as const))(
    "%s is wrapped in withMaintenance (or explicitly exempt)",
    (rel, src) => {
      if (rel in EXEMPT) {
        expect(EXEMPT[rel].length).toBeGreaterThan(20); // a real reason, not ""
        return;
      }
      expect(
        src.includes("withMaintenance"),
        `${rel} exports a public write verb but is not wrapped in withMaintenance.\n` +
          `Either wrap it:  export const POST = withErrors(withMaintenance(async (req) => { ... }));\n` +
          `or add it to EXEMPT in this file with a reason why maintenance must not block it.`,
      ).toBe(true);
    },
  );

  it("every EXEMPT entry still points at a real route file", () => {
    const known = new Set(files.map((f) => f.rel));
    for (const rel of Object.keys(EXEMPT)) {
      expect(known.has(rel), `EXEMPT lists ${rel}, which no longer exists`).toBe(true);
    }
  });
});
