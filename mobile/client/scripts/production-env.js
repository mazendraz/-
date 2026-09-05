/**
 * The one definition of "what a production artifact is allowed to talk to",
 * shared by every script that can ship one.
 *
 * Extracted so the approved backend and the private-address rule exist ONCE.
 * Two copies of a security constant is how the OTA and the native build drift
 * apart, which is the class of problem that produced the 2026-09-04 incident
 * (see publish-production-update.js) — there, `eas.json`'s build profile and
 * whatever `eas update` happened to bundle were free to disagree, and nothing
 * compared them.
 */
const fs = require("node:fs");
const path = require("node:path");

const CLIENT_DIR = path.join(__dirname, "..");
const EAS_JSON = path.join(CLIENT_DIR, "eas.json");
const PROFILE = "production";

/** The one backend a production artifact may talk to. A staging host or a
 *  typo'd domain is as much a failure here as a laptop on someone's desk. */
const APPROVED_API_URL = "https://al-assema.tech/api/v1";

/**
 * Addresses that can only ever mean "a machine on someone's desk".
 *
 * `localhost` and `.local` are deliberately absent: both appear inside React
 * Native's and Expo's own bundled internals even in a known-good production
 * export (measured: 3 and 1 occurrences), so banning them outright would fail
 * every honest publish — and a check that cries wolf is a check people learn
 * to work around. They are still caught where it matters, by the bundle's
 * API-URL check, which inspects every `/api/v1`-bearing string that ships.
 */
const PRIVATE_ADDRESS =
  /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.0\.0\.1|0\.0\.0\.0)\b/g;

/** Any string in a bundle that looks like an API base URL. */
const API_URL_IN_BUNDLE = /https?:\/\/[a-zA-Z0-9.:_-]*\/api\/v1/g;

/**
 * Why an environment is not fit to ship, or an empty list if it is.
 *
 * Takes the env as an argument rather than reading it, so the rule itself can
 * be exercised against a deliberately-bad environment without editing
 * eas.json — a safety check nobody has ever seen reject anything is a safety
 * check nobody trusts.
 */
function problemsWith(env) {
  const problems = [];
  const apiUrl = env?.EXPO_PUBLIC_API_URL;

  if (!apiUrl) {
    problems.push("EXPO_PUBLIC_API_URL is missing or empty");
  } else if (apiUrl !== APPROVED_API_URL) {
    problems.push(`EXPO_PUBLIC_API_URL is not the approved backend (expected ${APPROVED_API_URL}, found ${apiUrl})`);
  }

  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value !== "string") continue;
    const hit = value.match(PRIVATE_ADDRESS);
    if (hit) problems.push(`${key} points at a private/LAN address: ${hit[0]}`);
  }
  return problems;
}

/**
 * The production environment from eas.json's `build.production.env` — the SAME
 * values `eas build --profile production` uses, so a native build and an OTA
 * cannot silently disagree. Exits the process if it is not fit to ship.
 */
function resolveProductionEnv() {
  let env;
  try {
    env = JSON.parse(fs.readFileSync(EAS_JSON, "utf8"))?.build?.[PROFILE]?.env;
  } catch (err) {
    console.error(`\n✗ Could not read ${EAS_JSON}\n${err.message}\n`);
    process.exit(1);
  }
  if (!env || typeof env !== "object") {
    console.error(`\n✗ eas.json has no build.${PROFILE}.env block to read the production environment from.\n`);
    process.exit(1);
  }

  const problems = problemsWith(env);
  if (problems.length > 0) {
    console.error("\n✗ The production environment in eas.json is not fit to ship:");
    console.error("    - " + problems.join("\n    - "));
    console.error("\nNothing was built or published.\n");
    process.exit(1);
  }
  return env;
}

module.exports = {
  CLIENT_DIR,
  PROFILE,
  APPROVED_API_URL,
  PRIVATE_ADDRESS,
  API_URL_IN_BUNDLE,
  problemsWith,
  resolveProductionEnv,
};
