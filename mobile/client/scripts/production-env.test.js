#!/usr/bin/env node
/**
 * Regression test for the production environment gate.
 *
 *   npm run test:env
 *
 * A safety check nobody has watched reject anything is a safety check nobody
 * trusts — and one that has quietly stopped rejecting is worse than none,
 * because it still prints a reassuring tick. This exercises the rule in
 * scripts/production-env.js against the environment that actually caused the
 * 2026-09-04 incident plus every neighbouring shape, and asserts the real
 * eas.json still passes.
 *
 * Plain node, no test runner: the mobile client has no test dependency and
 * this needs to stay runnable from a release checklist without one.
 */
const { problemsWith } = require("./production-env");
const easProductionEnv = require("../eas.json").build.production.env;

/** [name, env, mustBeRejected] */
const CASES = [
  ["the real eas.json production env", easProductionEnv, false],
  // The exact value that shipped to TestFlight on 2026-09-04.
  ["the LAN URL that caused the incident", { EXPO_PUBLIC_API_URL: "http://192.168.1.10:3000/api/v1" }, true],
  ["localhost", { EXPO_PUBLIC_API_URL: "http://localhost:3000/api/v1" }, true],
  ["127.0.0.1", { EXPO_PUBLIC_API_URL: "http://127.0.0.1:3000/api/v1" }, true],
  // The Android emulator's alias for the host machine.
  ["10.x private range", { EXPO_PUBLIC_API_URL: "http://10.0.2.2:3000/api/v1" }, true],
  ["172.16-31 private range", { EXPO_PUBLIC_API_URL: "http://172.20.1.5:3000/api/v1" }, true],
  ["empty", { EXPO_PUBLIC_API_URL: "" }, true],
  ["undefined", {}, true],
  // Not a LAN address at all — the check is an allow-list, not a deny-list,
  // so a typo'd domain that resolves to nothing is caught just the same.
  ["a plausible typo", { EXPO_PUBLIC_API_URL: "https://al-assema.tec/api/v1" }, true],
  ["staging", { EXPO_PUBLIC_API_URL: "https://staging.al-assema.tech/api/v1" }, true],
  // A correct API URL does not excuse a LAN asset host: images would 404 for
  // every customer while the app otherwise looked healthy.
  [
    "approved API but LAN asset host",
    { EXPO_PUBLIC_API_URL: "https://al-assema.tech/api/v1", EXPO_PUBLIC_ASSET_URL: "http://192.168.1.10:5173" },
    true,
  ],
];

let failed = 0;
for (const [name, env, mustBeRejected] of CASES) {
  const problems = problemsWith(env);
  const rejected = problems.length > 0;
  const ok = rejected === mustBeRejected;
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${(rejected ? "REJECTED" : "accepted").padEnd(9)} ${name}` +
      (rejected ? `  — ${problems[0]}` : ""),
  );
}

if (failed > 0) {
  console.error(`\n✗ ${failed} case(s) behaved incorrectly — the production gate is not doing its job.\n`);
  process.exit(1);
}
console.log(`\n✓ production environment gate correct on all ${CASES.length} cases\n`);
