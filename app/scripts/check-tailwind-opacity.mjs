#!/usr/bin/env node
// Guards against DS-01 (UI-UX-AUDIT.md §3): Tailwind 3.4's default opacity
// scale only has stops at 0,5,10,15…100. A class like `bg-primary/6` or
// `text-outline/70` compiles to NOTHING if `6`/`70` isn't a real stop — no
// warning, no error, the element just silently gets no color at all (e.g. a
// fully transparent bottom nav). This script builds the real Tailwind output
// and checks every color-utility/opacity class actually used in the app
// against it, so that gap can never come back unnoticed.
//
// Deliberately does NOT special-case or "fix" anything — Phase 0 exists to
// prove the harness catches the bug that's already there (see FIX-PROMPT.md
// Phase 0's "معايير القبول": this script is expected to fail right now).

import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");

function findTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTsxFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) results.push(full);
  }
  return results;
}

// Color-accepting utility prefixes. Deliberately excludes sizing/spacing
// prefixes (w-, h-, basis-, gap-, ...) whose `/N` suffix is a FRACTION
// (e.g. `w-1/2`), not an opacity modifier — those are unrelated to DS-01.
const COLOR_PREFIXES = [
  "bg", "text", "border", "ring", "ring-offset", "divide", "placeholder",
  "accent", "caret", "outline", "decoration", "from", "via", "to",
  "shadow", "fill", "stroke",
];

const VARIANT = "(?:[\\w-]+:)*"; // hover:, sm:, dark:, rtl:, group-hover:, ...
const CLASS_RE = new RegExp(
  `\\b${VARIANT}(?:${COLOR_PREFIXES.join("|")})-[a-zA-Z0-9-]+\\/(\\d{1,3})\\b`,
  "g"
);

function escapeForSelector(className) {
  // Mirrors Tailwind's own class-name escaping so we can find the generated
  // selector as a literal substring of the compiled CSS: `:` and `/` (the
  // only special characters our token set can contain) become `\:` / `\/`.
  return className.replace(/[:/]/g, (c) => `\\${c}`);
}

function findUsages() {
  const files = findTsxFiles(path.join(appRoot, "src"));
  const usages = new Map(); // className -> [{file, line}]
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(CLASS_RE)) {
        const className = match[0];
        const rel = path.relative(appRoot, file);
        const list = usages.get(className) ?? [];
        list.push(`${rel}:${i + 1}`);
        usages.set(className, list);
      }
    }
  }
  return usages;
}

function buildCss() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "tw-opacity-check-"));
  const outFile = path.join(tmpDir, "built.css");
  try {
    execSync(
      `npx tailwindcss -i "${path.join(appRoot, "src/index.css")}" -o "${outFile}" --config "${path.join(appRoot, "tailwind.config.js")}" --minify`,
      { cwd: appRoot, stdio: ["ignore", "ignore", "pipe"] }
    );
    return readFileSync(outFile, "utf8");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  console.log("Building Tailwind CSS...");
  const css = buildCss();

  console.log("Scanning src/**/*.tsx for color-opacity utility classes...");
  const usages = findUsages();

  const missing = [];
  for (const [className, locations] of usages) {
    const selector = `.${escapeForSelector(className)}`;
    if (!css.includes(selector)) {
      missing.push({ className, locations });
    }
  }

  if (missing.length === 0) {
    console.log(`✓ All ${usages.size} color-opacity classes generated real CSS.`);
    process.exit(0);
  }

  console.error(
    `\n✗ ${missing.length} class(es) out of ${usages.size} produced NO CSS ` +
      `(the opacity value isn't on Tailwind's default scale — see DS-01 in UI-UX-AUDIT.md):\n`
  );
  for (const { className, locations } of missing.sort((a, b) => a.className.localeCompare(b.className))) {
    console.error(`  ${className}`);
    for (const loc of locations) console.error(`    ${loc}`);
  }
  console.error("");
  process.exit(1);
}

main();
