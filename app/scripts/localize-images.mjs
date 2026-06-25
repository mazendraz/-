// One-off: download hotlinked seed images and rewrite references to local
// /img/* paths so the app no longer depends on external (expirable) URLs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["src/lib/data.ts", "src/pages/Home.tsx", "index.html"].map((f) => resolve(root, f));
const imgDir = resolve(root, "public/img");
mkdirSync(imgDir, { recursive: true });

const URL_RE = /https:\/\/lh3\.googleusercontent\.com\/[^"' )]+/g;

// Collect unique URLs across all files.
const urls = new Set();
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(URL_RE)) urls.add(m[0]);

// Download each to a stable, indexed filename.
const map = new Map();
let i = 0;
for (const url of urls) {
  const name = `seed-${String(++i).padStart(2, "0")}.jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(resolve(imgDir, name), buf);
  map.set(url, `/img/${name}`);
  console.log(`✓ ${name}  (${buf.length} bytes)`);
}

// Rewrite references in every file.
for (const f of files) {
  let src = readFileSync(f, "utf8");
  for (const [url, local] of map) src = src.split(url).join(local);
  writeFileSync(f, src, "utf8");
  console.log(`rewrote ${f}`);
}
console.log(`Done: ${map.size} images localized.`);
