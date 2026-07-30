// Guard against untranslated UI creeping back into the frontend.
//
// ── Why this lives in the api package ────────────────────────────────────────
// `app/` has no unit-test runner — only Playwright. This guard reads .tsx files
// as TEXT and imports nothing from them, so it runs perfectly well here and the
// alternative (adding vitest + config to `app/` purely to hold one scanner) buys
// nothing. Same precedent as pricing.parity.test.ts.
//
// ── Why a guard at all ──────────────────────────────────────────────────────
// Phase 7 moved hundreds of hard-coded strings into i18n.ts. Without something
// enforcing it, the next component ships with English literals and the site
// drifts straight back to half-translated. This fails the build instead.
//
// It flags three things in app/src/**/*.tsx:
//   1. JSX text nodes containing Latin letters   (>Some text<)
//   2. literal placeholder= / aria-label= / title= strings
//   3. toLocaleDateString()/toLocaleString() with no locale — these silently use
//      the BROWSER's language, so an Arabic page shows "Jul 29, 2026"
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SRC = join(process.cwd(), "..", "app", "src");

/**
 * Files not migrated. EVERY entry needs a reason, and the list only shrinks.
 *
 * Phase 7 shipped in three parts (see docs/plan-v2/phase-7-i18n.md): 7A public,
 * 7B provider dashboard, 7C admin dashboard. All three are done — the one entry
 * below is permanent, and NOTHING should ever be added back. If a new component
 * fails this test, translate it; do not exempt it.
 */
const EXEMPT: Record<string, string> = {
  // ── Permanent ──
  "components/CrashScreen.tsx":
    "PERMANENT. Renders after React has already thrown, from an ErrorBoundary " +
    "above LocaleProvider. Calling t() would re-enter the code that just failed " +
    "and produce a blank page. Its strings are inline by design — see the banner " +
    "comment in the file.",
};

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip comments and imports so their prose doesn't read as UI copy. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");
}

/**
 * Language-neutral literals that are correct as-is in both locales, so requiring
 * a translation key for them would be noise. Keep this list SHORT — it is the
 * one hole in the guard.
 */
const NEUTRAL = new Set([
  "Al Assema",
  "you@example.com",
  // An env-var NAME rendered in a <span className="font-mono"> — an identifier the
  // reader types into a .env file, identical in both locales.
  "VITE_API_URL",
]);

/**
 * JSX text nodes holding Latin words, i.e. visible untranslated copy.
 *
 * The delimiters are `>` or `}` on the left and `<` or `{` on the right, and a
 * newline before the closing tag is allowed. All three of those were blind spots
 * that let real untranslated copy ship:
 *
 *   `{count} new`                → text starts after `}`, not `>`
 *   `lead{n !== 1 ? "s" : ""}`   → text ends at `{`, not `<`
 *   `arrow_back</span> Back to site\n</Link>`
 *                                → newline sat between the text and the close
 *
 * Requiring `>…<` with no braces or newlines missed every one of them, so the
 * provider dashboard passed this guard with a dozen English literals in it.
 */
function latinJsxText(src: string): string[] {
  const text = strip(src);
  const hits: string[] = [];

  // TWO patterns, kept separate on purpose. `>` only ever opens a text node in
  // JSX, so that one can be permissive. `}` and `{` are ordinary TypeScript too,
  // so the second has to be strict — a single combined `[>}]…[<{]` pattern
  // matched `} catch (err) {` in nearly every file, and a guard that cries wolf
  // gets switched off, which costs more than the blind spot it closes.
  //
  //   />…</   a text node. Newlines now allowed before the closing tag, which is
  //           what hid `arrow_back</span> Back to site\n</Link>`.
  //   /}…[<{]/  text beside a JSX expression, on ONE line: `{count} new</span>`
  //           and `lead{n !== 1 ? "s" : ""}`.
  for (const [pattern, allowNewline, isTextNode] of [
    [/>([^<>{}]*[A-Za-z]{2}[^<>{}]*)</g, true, true],
    [/\}([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)[<{]/g, false, false],
  ] as const) {
    for (const m of text.matchAll(pattern)) {
      const body = m[1].trim();
      if (!body) continue;

      // `=>` is an arrow function, not a closing tag: `(): Promise<T> =>` and
      // `() => Promise<X>` both look like ">…<" to a regex.
      if (text[m.index! - 1] === "=") continue;

      // Blank line = we ran out of the text node into unrelated code.
      if (allowNewline && /\n\s*\n/.test(m[1])) continue;

      // Code punctuation a rendered text node never contains. `\w\s*\(` (rather
      // than `\w\(`) is what catches `catch (err)` — the space let it through.
      if (/[;`=(){}[\]]|\w\s*\(/.test(body)) continue;
      if (/[&|]/.test(body)) continue; // expression operators → code
      if (/^[,.:;!?]+$/.test(body)) continue; // stray punctuation between tags
      if (/[,:]\s*$/.test(body)) continue; // trailing comma/colon → object literal
      // A ternary branch that fell between two elements: `: img ?` in
      // `{uploading ? <a/> : img ? <b/> : <c/>}`.
      if (/^[:?]/.test(body) || /[?]\s*$/.test(body)) continue;
      if (JS_KEYWORDS.has(body)) continue; // `} catch {`, `} else {`
      if (body.includes("$")) continue; // `${…}` remnant → template literal
      if (isClassSoup(body)) continue; // className built in a template literal

      if (/^\/[a-z0-9/-]+$/.test(body)) continue; // URL path in <code>: /terms

      // Material Symbols ligatures are icon NAMES, not copy — but a blanket
      // "single lowercase word" exclusion also swallowed real copy, because
      // `new`, `leads` and `lead` look exactly like `menu` and `star`. So the
      // exclusion is scoped to elements that actually render an icon. That is
      // what let `{stats.new} new` ship untranslated.
      if (isTextNode && isIconLigature(body, text, m.index!)) continue;

      // Trailing punctuation stripped before the neutral check, so "Al Assema."
      // in the footer's copyright line is recognised as the brand name.
      if (NEUTRAL.has(body.replace(/[.,!?]+$/, ""))) continue;

      hits.push(body.replace(/\s+/g, " ").slice(0, 60));
    }
  }
  return [...new Set(hits)];
}

/**
 * User-visible strings passed as PROPS or inside JSX expressions.
 *
 * The original version only checked placeholder/aria-label/title, which is why
 * `centerLabel="leads"` and `msg={loading ? "Searching…" : "No leads match…"}`
 * both shipped untranslated: one is a prop nobody listed, the other is a string
 * literal inside a conditional rather than a text node.
 *
 * Rather than maintain a list of "copy-ish" prop names, this looks at any
 * double-quoted literal that reads like a SENTENCE OR PHRASE — two or more Latin
 * words, or one capitalised word — while skipping the things that legitimately
 * look like that in code: className values, imports, icon ligatures, urls.
 */
/**
 * Props whose value reaches the screen as words.
 *
 * A list, not a heuristic over every prop: `className` and `style` are full of
 * strings that look like phrases, and flagging them would bury the real hits.
 * When a component gains a new copy-bearing prop, add it here.
 */
const COPY_PROPS = new Set([
  "placeholder", "aria-label", "title", "alt",
  "label", "msg", "subtitle", "valueLabel", "centerLabel",
  "noun", "nounPlural",
]);

const COPY_ATTRS = new RegExp(
  `\\b(${[...COPY_PROPS].join("|")})=\\{?"([^"]+)"\\}?`,
  "g",
);

function literalAttrs(src: string): string[] {
  const hits: string[] = [];
  const text = strip(src);

  // A BARE attribute is unambiguous: `centerLabel="leads"` has no other possible
  // reading, so a single lowercase word counts.
  for (const m of text.matchAll(COPY_ATTRS)) {
    const value = m[2].trim();
    if (!looksLikeCopy(value)) continue;
    hits.push(`${m[1]}="${value.slice(0, 50)}"`);
  }

  // String literals inside a copy-bearing prop's expression:
  //   msg={loading ? "Searching…" : "No leads match your search."}
  //
  // Only the VALUE side is scanned — everything before the first `?` is a
  // condition, and its literals are sentinels being compared against
  // (`status === "PENDING"`, `filter !== "All"`), not text anyone reads. Scanning
  // the whole expression flagged those and buried the real hits.
  for (const m of text.matchAll(/\b([a-zA-Z-]+)=\{([^{}]*"[^"]+"[^{}]*)\}/g)) {
    if (!COPY_PROPS.has(m[1])) continue;
    const q = m[2].indexOf("?");
    const values = q === -1 ? m[2] : m[2].slice(q + 1);
    for (const lit of values.matchAll(/"([^"]+)"/g)) {
      const value = lit[1].trim();
      if (!looksLikeCopy(value)) continue;
      // Inside an expression a bare word is almost always an identifier, a
      // translation KEY, an icon name or a sentinel — `setTab("leads")`,
      // `icon="badge"`, `"ar-EG"`, `set("logo", v)`. Requiring a PHRASE (a space,
      // or sentence punctuation) keeps the real finds — "Searching…", "No leads
      // match your search." — without that noise. Bare single words in a
      // copy-bearing position are caught by the bare-attribute pass above, which
      // has no such ambiguity to contend with.
      if (!/\s/.test(value) && !/[.!?…:]$/.test(value)) continue;
      // A literal being COMPARED is a sentinel, not copy. Needed on top of the
      // `?` split because a chained ternary puts later conditions after the
      // first `?`: `msg={a ? x : (q || status !== "All") ? y : z}`.
      if (/[=!]==?\s*$/.test(values.slice(0, lit.index))) continue;
      hits.push(`${m[1]}={… "${value.slice(0, 50)}"}`);
    }
  }
  return [...new Set(hits)];
}

/**
 * Tailwind class strings read like phrases to a regex but are not copy.
 *
 * The tell is that every token is lowercase/symbolic AND at least one carries a
 * `-`, `:` or `[` — real copy has neither. Checked per token rather than by word
 * COUNT, because a two-token value like "material-symbols-outlined text-[18px]"
 * is just as much class soup as a ten-token one.
 */
/**
 * Is this text an icon name rather than copy?
 *
 * Decided by the ELEMENT it sits in, not by the shape of the word: the tag
 * immediately before it has to carry `material-symbols`. Judging by shape alone
 * meant every single lowercase word was ignored — and `new`, `lead` and `leads`
 * have exactly the shape of `menu` and `star` while being real copy. That is what
 * let `{stats.new} new` ship untranslated.
 */
function isIconLigature(body: string, text: string, matchIndex: number): boolean {
  if (!/^[a-z0-9_]+$/.test(body)) return false;
  const open = openingTagStart(text, matchIndex);
  if (open === -1) return false;
  return text.slice(open, matchIndex).includes("material-symbols");
}

/**
 * Index of the `<` that opens the element containing `matchIndex`.
 *
 * Skips a `<` that is really a comparison, which is not hypothetical: the icon
 * spans in Stars.tsx carry `style={{ fontVariationSettings: i <= n ? … }}`, so the
 * nearest `<` searching backwards was the one in `i <= n`. Anchoring on that made
 * the ligature check miss and reported `star` as untranslated copy.
 */
function openingTagStart(text: string, matchIndex: number): number {
  for (let i = matchIndex; i >= 0; i -= 1) {
    if (text[i] !== "<") continue;
    if (/[A-Za-z/]/.test(text[i + 1] ?? "")) return i;
  }
  return -1;
}

/** Bare keywords sitting between `}` and `{`: `} catch {`, `} else {`. */
const JS_KEYWORDS = new Set([
  "catch", "finally", "else", "try", "do", "return", "break", "continue", "in", "of",
]);

function isClassSoup(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (!tokens.every((tok) => /^[a-z0-9:./%#[\]()!-]+$/.test(tok))) return false;
  return tokens.some((tok) => /[-:[]/.test(tok));
}

/**
 * Does this literal read as human-facing copy rather than as code?
 *
 * The prop name has already told us this value reaches the screen (COPY_PROPS
 * gates the caller), so a bare lowercase word IS copy here — `centerLabel="leads"`
 * is a chart label, not an identifier. Only shapes that CANNOT be copy are
 * excluded: translation keys, urls, paths, enum values and class strings.
 * Requiring a capital or a second word was what let `centerLabel="leads"` pass.
 */
function looksLikeCopy(value: string): boolean {
  if (!value || !/[A-Za-z]{2}/.test(value)) return false;
  if (NEUTRAL.has(value.replace(/[.,!?]+$/, ""))) return false;
  if (/^https?:\/\//.test(value)) return false; // url sample
  if (/^\/[a-z0-9/-]*$/.test(value)) return false; // route or asset path
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) return false; // snake_case i18n key
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return false; // SCREAMING_CASE enum value
  if (/^[a-z]+[A-Z]\w*$/.test(value)) return false; // camelCase identifier
  if (isClassSoup(value)) return false;
  return true;
}

/** Date/number formatting that silently follows the browser, not the site. */
function localelessFormatting(src: string): string[] {
  const hits: string[] = [];
  for (const m of strip(src).matchAll(/\.(toLocaleDateString|toLocaleString|toLocaleTimeString)\(\s*\)/g)) {
    hits.push(`${m[1]}() with no locale`);
  }
  return hits;
}

/** formatReopenDate(x) — single argument falls back to the browser locale. */
function localelessReopenDate(src: string): string[] {
  const hits: string[] = [];
  for (const m of strip(src).matchAll(/formatReopenDate\(([^),]+)\)/g)) {
    hits.push(`formatReopenDate(${m[1].trim().slice(0, 30)}) — missing locale`);
  }
  return hits;
}

describe("frontend i18n coverage", () => {
  const files = tsxFiles(APP_SRC).map((f) => ({
    rel: relative(APP_SRC, f).split(sep).join("/"),
    src: readFileSync(f, "utf8"),
  }));

  it("found frontend files to scan", () => {
    // Without this a broken path makes every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(20);
  });

  const checked = files.filter((f) => !(f.rel in EXEMPT));

  it("has non-exempt files to check", () => {
    expect(checked.length).toBeGreaterThan(10);
  });

  it.each(checked.map((f) => [f.rel, f.src] as const))(
    "%s has no untranslated UI text",
    (rel, src) => {
      const problems = [
        ...latinJsxText(src).map((s) => `JSX text: ${s}`),
        ...literalAttrs(src),
        ...localelessFormatting(src),
        ...localelessReopenDate(src),
      ];
      expect(
        problems,
        `${rel} contains untranslated or locale-unaware UI:\n  ` +
          problems.join("\n  ") +
          `\n\nMove the text into app/src/lib/i18n.ts (both en and ar) and read it ` +
          `with t(locale, "key"). For dates use formatDate/formatDateTime from ` +
          `app/src/lib/format.ts. If the file genuinely must stay as-is, add it to ` +
          `EXEMPT in this test WITH A REASON.`,
      ).toEqual([]);
    },
  );

  it("every EXEMPT entry still points at a real file and states a reason", () => {
    const known = new Set(files.map((f) => f.rel));
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(known.has(rel), `EXEMPT lists ${rel}, which no longer exists`).toBe(true);
      expect(reason.length, `EXEMPT["${rel}"] needs a real reason`).toBeGreaterThan(10);
    }
  });

  // The guard is only worth anything if it actually fires.
  it("detects each violation class", () => {
    expect(latinJsxText(`<p>Hello there</p>`)).toHaveLength(1);
    // Icon ligature — recognised by the element it sits in, not by its shape.
    expect(latinJsxText(
      `<span className="material-symbols-outlined">chevron_right</span>`,
    )).toHaveLength(0);
    expect(latinJsxText(`<p>{t(locale, "key")}</p>`)).toHaveLength(0);
    expect(latinJsxText(`if (m.index > last) nodes.push(x)`)).toHaveLength(0); // code
    expect(latinJsxText(`<code>/terms</code>`)).toHaveLength(0); // url path
    expect(literalAttrs(`<input placeholder="Search…" />`)).toHaveLength(1);
    expect(literalAttrs(`<input placeholder={t(locale, "k")} />`)).toHaveLength(0);
    expect(literalAttrs(`<input placeholder="https://x.com/…" />`)).toHaveLength(0);
    expect(localelessFormatting(`new Date(x).toLocaleDateString()`)).toHaveLength(1);
    expect(localelessFormatting(`new Date(x).toLocaleDateString(intlLocale(locale))`)).toHaveLength(0);
    expect(localelessReopenDate(`formatReopenDate(ms)`)).toHaveLength(1);
    expect(localelessReopenDate(`formatReopenDate(ms, locale)`)).toHaveLength(0);
  });

  // ── Regressions ────────────────────────────────────────────────────────────
  // Every case below is real copy that shipped to production untranslated while
  // this test was passing. The guard was `>…<` with no braces and no newlines,
  // plus a three-name attribute list, so none of it was reachable. If one of
  // these ever returns 0 again, the same class of bug can ship again.
  it("catches text beside a JSX expression", () => {
    // `{stats.new} new` — the text node starts after `}`, not `>`.
    expect(latinJsxText(`<span>{count} new</span>`)).toContain("new");
    // `lead{n !== 1 ? "s" : ""}` — the text node ends at `{`, not `<`.
    expect(latinJsxText(`<span>{total} lead{total !== 1 ? "s" : ""}</span>`)).toContain("lead");
  });

  it("catches text separated from its closing tag by a newline", () => {
    const src = `<Link>\n  <span>arrow_back</span> Back to site\n</Link>`;
    expect(latinJsxText(src)).toContain("Back to site");
  });

  it("catches copy in props beyond placeholder/aria-label/title", () => {
    expect(literalAttrs(`<DonutChart centerLabel="leads" />`)).toHaveLength(1);
    expect(literalAttrs(`<img alt="New Administrative Capital skyline" />`)).toHaveLength(1);
    expect(literalAttrs(`<Pagination noun="lead" nounPlural="leads" />`)).toHaveLength(2);
  });

  it("catches copy inside a JSX expression, not just a bare attribute", () => {
    const src = `<EmptyState msg={loading ? "Searching…" : "No leads match your search."} />`;
    expect(literalAttrs(src)).toHaveLength(2);
  });

  // ── The other half of a useful guard: staying quiet ─────────────────────────
  // A first pass at the above matched `} catch (err) {` in nearly every file.
  // Noise gets a guard switched off, so the non-findings matter as much as the
  // findings.
  it("stays quiet on ordinary TypeScript", () => {
    expect(latinJsxText(`try { a(); } catch (err) { b(); }`)).toHaveLength(0);
    expect(latinJsxText(`function f({ a }: Props) { return 1; }`)).toHaveLength(0);
    expect(latinJsxText(`const x = { path: "/a", errorElement: <E /> };`)).toHaveLength(0);
    expect(latinJsxText("const c = `w-full ${on ? 'a' : 'b'} rounded`;")).toHaveLength(0);
    expect(latinJsxText(`{uploading ? <S /> : img ? <I /> : <P />}`)).toHaveLength(0);
  });

  it("does not mistake class strings or sentinels for copy", () => {
    // Two tokens, but unmistakably Tailwind — the old word-count rule let it by.
    expect(literalAttrs(`<span title={x} className="material-symbols-outlined text-[18px]" />`))
      .toHaveLength(0);
    // Literals being COMPARED are sentinels, not text anyone reads.
    expect(literalAttrs(`<E msg={filter === "PENDING" ? a : b} />`)).toHaveLength(0);
    expect(literalAttrs(`<E msg={a ? b : (q || status !== "All") ? c : d} />`)).toHaveLength(0);
  });

  it("treats the brand name as language-neutral even with punctuation", () => {
    // As it appears in the footer's copyright line: the year is an expression,
    // so the text node is just the brand name plus a full stop.
    expect(latinJsxText(`<p>{year} Al Assema.</p>`)).toHaveLength(0);
  });
});
