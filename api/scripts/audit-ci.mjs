#!/usr/bin/env node
/**
 * Dependency-advisory gate for CI.
 *
 * ── Why this is not just `npm audit --audit-level=high` ─────────────────────
 * Because that command cannot currently express the thing we actually want.
 * `--omit=dev` is supposed to drop build- and test-time packages, and it does
 * not: `prisma` is a devDependency here, nothing in `dependencies` reaches it,
 * and `npm audit --omit=dev` still reports it (along with @prisma/config and
 * deepmerge-ts beneath it) and exits 1. A gate that is red on the day it is
 * written is a gate everybody learns to skip, which is worse than no gate.
 *
 * So the exception is made EXPLICIT and small, rather than by widening the
 * severity threshold until the noise disappears. Anything high or critical
 * fails the build unless it is named below with a reason.
 *
 * ── The rule for adding an entry ────────────────────────────────────────────
 * An advisory belongs here ONLY when the vulnerable code cannot be reached by
 * a request — a CLI run at deploy time, a test-only helper, a bundler. If you
 * cannot write that sentence about it truthfully, fix the dependency instead.
 */
import { execFileSync } from "node:child_process";

/** package name → why it cannot be reached from a request. */
const ALLOWED = {
  prisma:
    "devDependency. The CLI (`prisma generate` / `migrate deploy`) runs at build " +
    "and deploy time only; the request path uses @prisma/client, which does not " +
    "depend on it. Drop this entry once prisma ships a release with deepmerge-ts >= 8.",
  "@prisma/config":
    "Reached only through the prisma CLI above — it parses prisma.config.ts at " +
    "CLI startup. Never loaded by the server.",
  "deepmerge-ts":
    "GHSA-ggr8-5vv4-36mx (stack exhaustion on recursive object graphs). Reached " +
    "only through @prisma/config merging our own prisma.config.ts, which is a " +
    "file in this repo, not attacker input.",
};

// On Windows npm is a .cmd shim, and Node 18.20+/20.12+/22+ refuse to spawn one
// without a shell (the hardening added for CVE-2024-27980). CI is Linux, where
// neither applies — this is purely so the gate can be run locally before
// pushing. The arguments are fixed literals, so handing them to a shell on that
// one platform introduces nothing.
const IS_WIN = process.platform === "win32";

function audit() {
  try {
    // Exits non-zero whenever anything is found, so the output is read from the
    // error rather than the return value in that (normal) case.
    return JSON.parse(
      execFileSync(IS_WIN ? "npm.cmd" : "npm", ["audit", "--json"], {
        encoding: "utf8",
        shell: IS_WIN,
      }),
    );
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

const BLOCKING = new Set(["high", "critical"]);

const report = audit();
const vulns = Object.entries(report.vulnerabilities ?? {});

const blocking = [];
const waived = [];

for (const [name, v] of vulns) {
  if (!BLOCKING.has(v.severity)) continue;
  (name in ALLOWED ? waived : blocking).push({ name, v });
}

if (waived.length > 0) {
  console.log("Waived (documented as unreachable from a request):");
  for (const { name, v } of waived) console.log(`  · ${name} [${v.severity}] — ${ALLOWED[name]}`);
  console.log("");
}

if (blocking.length === 0) {
  const { high = 0, critical = 0 } = report.metadata?.vulnerabilities ?? {};
  console.log(`OK — no unwaived high/critical advisories (${high} high, ${critical} critical seen, all waived).`);
  process.exit(0);
}

console.error("Unwaived high/critical advisories:\n");
for (const { name, v } of blocking) {
  const titles = (v.via ?? [])
    .filter((x) => typeof x === "object")
    .map((x) => `      ${x.title}\n      ${x.url}`)
    .join("\n");
  console.error(`  ✗ ${name} [${v.severity}]  ${v.range ?? ""}`);
  if (titles) console.error(titles);
  if (v.nodes?.length) console.error(`      at ${v.nodes.join(", ")}`);
  console.error("");
}
console.error(
  "Fix the dependency, or — only if the vulnerable code genuinely cannot be\n" +
    "reached by a request — add it to ALLOWED in api/scripts/audit-ci.mjs with\n" +
    "a reason that says why.",
);
process.exit(1);
