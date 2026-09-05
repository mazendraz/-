#!/usr/bin/env node
/**
 * A guarded production NATIVE build.
 *
 *   npm run build:production -- android
 *   npm run build:production -- ios
 *
 * ── Why a build needs a gate too ──────────────────────────────────────────
 * The 2026-09-04 incident was an OTA, and the OTA path is now gated by
 * publish-production-update.js. A native build is structurally safer — EAS
 * builds on its own servers from a clean checkout, so there is no local Metro
 * cache and no developer `.env` to leak in, which is exactly why the Android
 * v1.0.0(5) and iOS v1.0.0(6) builds were correct while the OTA published
 * from the same machine was not.
 *
 * But "structurally safer" is not "checked". Everything the cloud build reads
 * comes from `eas.json`'s `build.production.env`, and nothing was verifying
 * that block itself. A wrong value committed there would sail into a Play
 * Store / TestFlight binary with no warning at all — and a bad binary is far
 * worse than a bad OTA, because it cannot be superseded in three minutes.
 *
 * So this runs the same validation the OTA path runs, against the same shared
 * definition (scripts/production-env.js), before spending 30 minutes and a
 * build credit on an artifact that would have to be thrown away.
 *
 * What it deliberately does NOT do is verify the built bundle's bytes the way
 * the OTA script does — the bundle is produced on EAS's servers and never
 * exists locally. The env check is the whole of what can be checked from here;
 * the artifact-level guarantee comes from the clean-checkout build itself.
 */
const { spawnSync } = require("node:child_process");
const { CLIENT_DIR, resolveProductionEnv, APPROVED_API_URL } = require("./production-env");

const platform = (process.argv[2] || "").trim().toLowerCase();
if (platform !== "android" && platform !== "ios") {
  console.error("\n✗ Usage: npm run build:production -- <android|ios>\n");
  process.exit(1);
}

console.log("\n[1/2] Validating the production environment eas.json will hand the build\n");
const env = resolveProductionEnv();
console.log("    Environment      production (eas.json build.production.env)");
console.log(`    API URL          ${env.EXPO_PUBLIC_API_URL}`);
console.log(`    Platform         ${platform}`);
console.log("    Profile          production");
console.log(`\n    ✓ API URL is the approved production backend (${APPROVED_API_URL})`);
console.log("    ✓ no private/LAN address in any production variable");

console.log("\n[2/2] Building on EAS\n");
// See publish-production-update.js's `run` for why this goes through a shell
// as a single string: Node refuses to spawn a Windows .cmd without one, and
// passing an args array alongside `shell: true` is deprecated (DEP0190).
const line = `npx "eas" "build" "--platform" "${platform}" "--profile" "production" "--non-interactive"`;
const result = spawnSync(line, { cwd: CLIENT_DIR, stdio: "inherit", shell: true });

if (result.error) {
  console.error(`\n✗ eas build could not be started.\n    ${result.error.message}\n`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`\n✗ eas build failed (exit code ${result.status}).\n`);
  process.exit(result.status ?? 1);
}

console.log("\n✓ Build finished.");
console.log("  `autoIncrement` bumps the version in app.json locally — commit that change.\n");
