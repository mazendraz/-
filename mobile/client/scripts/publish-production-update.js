#!/usr/bin/env node
/**
 * The ONLY supported way to publish a production OTA update.
 *
 * ── The incident this exists to prevent ────────────────────────────────────
 * On 2026-09-04 a production OTA was published to the `production` branch
 * carrying `http://192.168.1.10:3000/api/v1` — a developer's laptop — as the
 * API base URL. Every TestFlight phone that picked it up stopped talking to
 * the real backend. The publish had been done "carefully": `.env` was
 * rewritten to production values first, and the Expo CLI even confirmed it
 * had loaded them (`env: export EXPO_PUBLIC_API_URL ...`). The bundle still
 * shipped the LAN IP.
 *
 * ── Why being careful was not enough ──────────────────────────────────────
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle by Babel at
 * TRANSFORM time, and Metro caches transformed modules in a shared directory
 * (`%TEMP%/metro-cache`) whose cache key does NOT include the values of those
 * variables. So whichever value first inlined `index.ts` keeps being served
 * from cache no matter what `.env` or the shell says afterwards.
 *
 * Demonstrated both directions:
 *   - dev `.env` loaded, production values served from cache
 *   - production `.env` loaded, dev values served from cache  ← the incident
 *
 * This means no amount of "remember to set the environment first" can be
 * correct, and it also means the DEV loop is exposed to the mirror-image
 * hazard: a stale cache can point a local session at the production database.
 * (This repo has already lost real customer data to a local command reaching
 * production once — see CLAUDE.md.)
 *
 * ── What this script does instead ─────────────────────────────────────────
 * It refuses to trust intent, and verifies the artifact:
 *
 *   1. Reads the production env from eas.json's `build.production.env` — the
 *      SAME values `eas build --profile production` uses, so a native build
 *      and an OTA can never silently disagree. There is no second list to
 *      keep in sync, and `.env` is not consulted at all.
 *   2. Refuses to continue unless the API URL is exactly the approved one.
 *   3. Exports with the cache cleared, `.env` loading disabled entirely
 *      (EXPO_NO_DOTENV), and every inherited EXPO_PUBLIC_* stripped from the
 *      environment, so nothing local can leak in through any of the three
 *      channels that could carry it.
 *   4. GREPS THE BUILT BUNDLES. This is the check that cannot be fooled,
 *      because it reads the bytes that are about to ship rather than the
 *      configuration that was supposed to produce them. A stale cache, a
 *      hardcoded URL, a rogue fallback — all of them fail here.
 *   5. Publishes with `--skip-bundler --input-dir`, so EAS uploads exactly
 *      the directory that was just verified. Nothing is re-bundled between
 *      the check and the publish, so there is no window for them to diverge.
 *   6. Clears the Metro cache on the way out, so the next `npm start` cannot
 *      inherit production-inlined modules into a local session.
 *
 * Deliberately has no --force, no --skip-checks and no way to publish an
 * unverified bundle. If this script refuses, the configuration is wrong and
 * the fix is to correct it, not to go around this.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
// The approved backend, the private-address rule and the bundle URL pattern
// live in ONE place, shared with scripts/build-production.js — two copies of a
// security constant is how the OTA path and the native-build path drift apart.
const {
  CLIENT_DIR,
  APPROVED_API_URL,
  PRIVATE_ADDRESS,
  API_URL_IN_BUNDLE,
  resolveProductionEnv,
} = require("./production-env");

const OUT_DIR = path.join(CLIENT_DIR, "dist-production");
const BRANCH = "production";

function fail(message, detail) {
  console.error(`\n✗ ${message}`);
  if (detail) console.error(detail);
  console.error("\nNothing was published.\n");
  process.exit(1);
}

function step(n, message) {
  console.log(`\n[${n}/6] ${message}`);
}

/**
 * Run a CLI, surfacing WHY it failed.
 *
 * `shell: true` is required, not cosmetic: since the fix for CVE-2024-27980
 * (Node 18.20 / 20.12 and everything after, including the 24.x this repo runs)
 * Node refuses to spawn a Windows `.cmd` — which is what `npx` and `eas` both
 * are here — without one. Without it spawnSync returns an EINVAL in
 * `result.error` and never starts the process, producing no output at all.
 *
 * Reporting `result.error` matters just as much. The first version of this
 * script only checked `result.status`, so that EINVAL surfaced as a bare
 * "expo export failed" with nothing to act on — a safety gate that cannot say
 * why it stopped is one people learn to work around.
 *
 * The command is assembled into ONE string rather than passed as an args array
 * alongside `shell: true`. That combination is deprecated (DEP0190) precisely
 * because the array is concatenated without escaping, which reads as safety it
 * does not provide; doing the quoting explicitly here says what is actually
 * happening. Embedded double quotes are stripped rather than escaped, since
 * nothing this script passes legitimately contains one.
 */
function run(command, args, label, env) {
  const line = [command, ...args.map((a) => `"${String(a).replace(/"/g, "")}"`)].join(" ");
  const result = spawnSync(line, {
    cwd: CLIENT_DIR,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.error) fail(`${label} could not be started.`, `    ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed (exit code ${result.status}).`);
}

// ── 1. Where the production values come from ────────────────────────────────
step(1, "Resolving the production environment from eas.json");

// Exits with an explanation if the environment is not fit to ship — same rule,
// same shared definition, as the native-build path.
const profileEnv = resolveProductionEnv();
const resolvedApiUrl = profileEnv.EXPO_PUBLIC_API_URL;

console.log("");
console.log("    Environment      production (eas.json build.production.env)");
console.log(`    API URL          ${resolvedApiUrl ?? "(undefined)"}`);
console.log(`    Asset URL        ${profileEnv.EXPO_PUBLIC_ASSET_URL ?? "(unset — derived from API URL)"}`);
console.log(`    Branch           ${BRANCH}`);
console.log("    Platforms        ios, android");

// ── 2. Refuse anything that is not the approved backend ─────────────────────
step(2, "Validating the resolved production environment");

console.log(`    ✓ API URL is the approved production backend (${APPROVED_API_URL})`);
console.log("    ✓ no private/LAN address in any production variable");

// ── 3. Export, with every local channel closed off ──────────────────────────
step(3, "Exporting (cache cleared, .env disabled, inherited EXPO_PUBLIC_* stripped)");

fs.rmSync(OUT_DIR, { recursive: true, force: true });

// Three independent ways a local value could reach the bundle, all closed:
//   - the Metro transform cache          → --clear
//   - mobile/client/.env                 → EXPO_NO_DOTENV=1
//   - an exported shell variable         → stripped below
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) {
  if (key.startsWith("EXPO_PUBLIC_")) delete childEnv[key];
}
Object.assign(childEnv, profileEnv, { EXPO_NO_DOTENV: "1" });

run(
  "npx",
  // `--platform all` (ios + android + web) rather than a narrower list: it is
  // exactly what `eas update`'s own internal export produces, so the directory
  // handed to --input-dir below has the metadata.json shape EAS expects. The
  // web bundle costs a few seconds and gets scanned in step 4 for free.
  ["expo", "export", "--platform", "all", "--output-dir", OUT_DIR, "--clear"],
  "expo export",
  childEnv,
);

// ── 4. Read the bytes that are about to ship ────────────────────────────────
step(4, "Verifying the built bundles (the check that cannot be fooled)");

function bundleFiles() {
  const jsDir = path.join(OUT_DIR, "_expo", "static", "js");
  if (!fs.existsSync(jsDir)) fail(`Export produced no bundles at ${jsDir}`);
  const found = [];
  for (const platform of fs.readdirSync(jsDir)) {
    for (const file of fs.readdirSync(path.join(jsDir, platform))) {
      // .map files are source maps — they legitimately contain the original
      // source of every dependency, LAN-IP-bearing comments included, and are
      // not what runs on the device.
      if (file.endsWith(".map")) continue;
      found.push({ platform, file: path.join(jsDir, platform, file) });
    }
  }
  return found;
}

const bundles = bundleFiles();
if (bundles.length === 0) fail("Export produced no runnable bundles to verify.");

let problems = [];
for (const { platform, file } of bundles) {
  // latin1 so byte offsets in a Hermes .hbc still yield the embedded strings.
  const bytes = fs.readFileSync(file, "latin1");

  const apiUrls = [...new Set(bytes.match(API_URL_IN_BUNDLE) ?? [])];
  const privateHits = [...new Set(bytes.match(PRIVATE_ADDRESS) ?? [])];

  const wrongApi = apiUrls.filter((u) => u !== APPROVED_API_URL);
  if (!apiUrls.includes(APPROVED_API_URL)) {
    problems.push(`${platform}: approved API URL is NOT present in the bundle`);
  }
  if (wrongApi.length > 0) {
    problems.push(`${platform}: unexpected API URL(s) in the bundle → ${wrongApi.join(", ")}`);
  }
  if (privateHits.length > 0) {
    problems.push(`${platform}: private/LAN address(es) in the bundle → ${privateHits.join(", ")}`);
  }

  console.log(`    ${platform.padEnd(8)} api=${apiUrls.join(",") || "(none)"}  private=${privateHits.join(",") || "none"}`);
}

if (problems.length > 0) {
  fail("The built bundle does not match the approved production configuration.", "    - " + problems.join("\n    - "));
}
console.log("    ✓ every bundle resolves to the approved production backend, and only that");
console.log("    ✓ no private/LAN address in any bundle");

// ── 5. Publish exactly what was verified ────────────────────────────────────
step(5, "Publishing the verified bundle (--skip-bundler, so nothing is re-built)");

const message = process.argv.slice(2).join(" ").trim() || `production update ${new Date().toISOString().slice(0, 16)}`;

run(
  "npx",
  ["eas", "update", "--branch", BRANCH, "--message", message, "--skip-bundler", "--input-dir", OUT_DIR],
  "eas update",
  childEnv,
);

// ── 6. Do not leave a production-poisoned cache behind ──────────────────────
step(6, "Clearing the Metro cache so the dev loop cannot inherit production values");

const metroCache = path.join(os.tmpdir(), "metro-cache");
try {
  fs.rmSync(metroCache, { recursive: true, force: true });
  console.log(`    ✓ removed ${metroCache}`);
} catch (err) {
  console.log(`    ! could not remove ${metroCache} (${err.message}) — run 'npx expo start --clear' before your next dev session`);
}

console.log("\n✓ Published and verified.\n");
