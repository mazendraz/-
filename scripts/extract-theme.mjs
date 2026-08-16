#!/usr/bin/env node
/**
 * Regenerates packages/core/src/theme.ts's `colors` object from
 * app/tailwind.config.js.
 *
 * The website's Tailwind config is the source of truth for the palette — it's
 * where a contrast fix or a rebrand actually happens — and this keeps the
 * mobile apps' copy from drifting the way the four ApiOffering definitions
 * did before the core extraction. Run it whenever tailwind.config.js's
 * `colors` block changes, then re-check the diff by eye before committing:
 * this only touches the generated block, never the type-scale or the
 * hand-written comments around it.
 *
 * Usage: node scripts/extract-theme.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tailwindPath = join(root, "app/tailwind.config.js");
const themePath = join(root, "packages/core/src/theme.ts");

const src = readFileSync(tailwindPath, "utf8");

const marker = "colors: {";
const start = src.indexOf(marker);
if (start === -1) throw new Error(`Could not find "${marker}" in ${tailwindPath}`);

let depth = 1;
let i = start + marker.length;
while (depth > 0) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") depth--;
  i++;
}
const body = src
  .slice(start + marker.length, i - 1)
  .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
  .replace(/\/\/.*$/gm, ""); // line comments

const hexRe = /["']?([a-zA-Z0-9-]+)["']?\s*:\s*"(#[0-9a-fA-F]{3,8})"/g;
const colors = {};
let m;
while ((m = hexRe.exec(body))) colors[m[1]] = m[2];

const count = Object.keys(colors).length;
if (count < 40) {
  // A sanity floor, not an exact count: the palette has grown before and will
  // again. A number far below what's ever been seen means the parser broke on
  // a config change, not that colors were removed — surface that loudly rather
  // than writing a truncated theme file silently.
  throw new Error(`Only found ${count} colors — parser likely broken, aborting.`);
}

const camelCase = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const lines = Object.entries(colors)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `  ${camelCase(k)}: "${v}",`)
  .join("\n");

const themeSrc = readFileSync(themePath, "utf8");
const blockRe = /(export const colors = \{\n)([\s\S]*?)(\n\} as const;)/;
if (!blockRe.test(themeSrc)) {
  throw new Error(`Could not find the colors block in ${themePath} — has its shape changed?`);
}
writeFileSync(themePath, themeSrc.replace(blockRe, `$1${lines}$3`));

console.log(`Wrote ${count} colors to ${themePath}`);
