/**
 * Sends TWO otherwise-identical emails so you can see, in a real inbox, what
 * the logo format actually does:
 *
 *   [BEFORE] the WebP sitting in AppSetting.logo_url — what production sends
 *            today. Gmail cannot render WebP; it re-encodes through its image
 *            proxy and the transparent alpha flattens to black. The brand mark
 *            is black line art, so the whole box goes black.
 *   [AFTER]  app/public/email-logo.png — a PNG flattened onto white, which is
 *            what emailSafeLogoUrl() now forces for mail.
 *
 * Everything else about the two mails is byte-identical: same shell, same body,
 * same From. The only variable is the image URL, which is the whole point.
 *
 * Why a script and not a unit test: the bug lives in GMAIL's image proxy, not
 * in our HTML. No amount of local rendering can prove the fix — only a message
 * that has actually travelled through Gmail can.
 *
 *   cd api
 *   node scripts/send-logo-test.mjs you@example.com
 *
 * Reads RESEND_API_KEY / RESEND_FROM / PUBLIC_SITE_URL from api/.env. Sends
 * nothing else, writes nothing, touches no database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.join(HERE, "..");

// ── env ───────────────────────────────────────────────────────────────────────
// A five-line parser rather than a dotenv dependency: this script is a
// diagnostic, and adding a package to package.json to run it once is a bad
// trade. Handles the quoting style api/.env actually uses.
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...loadEnv(path.join(API_ROOT, ".env")), ...process.env };

const API_KEY = env.RESEND_API_KEY;
const FROM = env.RESEND_FROM ?? "Al Assema <no-reply@al-assema.tech>";
const TO = process.argv[2];

if (!TO) {
  console.error("usage: node scripts/send-logo-test.mjs <recipient@example.com>");
  process.exit(1);
}
if (!API_KEY) {
  console.error("RESEND_API_KEY is not set in api/.env — nothing was sent.");
  process.exit(1);
}

// PUBLIC_SITE_URL in api/.env points at the dev server (localhost:5173), which
// is useless for an image a mail client has to fetch. Mirror the production
// default from notifications.service.ts instead, overridable for a real test.
const SITE_URL = (env.EMAIL_TEST_SITE_URL ?? "https://al-assema.tech").replace(/\/$/, "");

// ── the real template ─────────────────────────────────────────────────────────
// emailLayout.ts has no imports of its own, so it transpiles and loads
// standalone. Using the actual module (rather than a hand-copied approximation)
// is what makes this test worth running: if the shell changes, this follows.
const layoutTs = path.join(API_ROOT, "src/lib/utils/emailLayout.ts");
const js = ts.transpileModule(fs.readFileSync(layoutTs, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// The OS temp dir, not the repo: this leaves no stray file behind for git to
// notice, and pathToFileURL is the only correct way to hand a Windows path
// ("F:\\...") to a dynamic import.
const tmpModule = path.join(os.tmpdir(), `al-assema-emailLayout.${process.pid}.mjs`);
fs.writeFileSync(tmpModule, js);

let layout;
try {
  layout = await import(pathToFileURL(tmpModule).href);
} finally {
  // Best-effort: a leftover file in the temp dir is harmless, and a cleanup
  // failure must never be the reason the test does not run.
  try {
    fs.rmSync(tmpModule, { force: true });
  } catch {}
}

const { renderEmailDocument, emailHeading, emailDataTable, emailParagraph, emailNotice } = layout;

// ── the two variants ──────────────────────────────────────────────────────────
// The BEFORE URL is the literal value in AppSetting.logo_url. If an admin
// re-uploads the logo this hash changes; pass it as argv[3] to test the new one.
const BEFORE_LOGO =
  process.argv[3] ??
  "https://vdwurkqarfnrquwihweo.supabase.co/storage/v1/object/public/logos/49eeb3d6-9dc3-4eaa-9e06-69dbe20b3410.webp";
const AFTER_LOGO = `${SITE_URL}/email-logo.png`;

function build({ tag, note, logoUrl }) {
  const body =
    emailNotice(`<strong>${tag}</strong> — ${note}`, "ltr") +
    emailHeading("New lead — Stylla Outdoor", "ltr") +
    emailDataTable(
      [
        ["Company", "Stylla Outdoor"],
        ["Reference", "AA-20260903-CZDY"],
        ["Service", "سفرة خارجية دبار ٨ افراد"],
        ["District", "R7 District"],
      ],
      "ltr",
    ) +
    emailParagraph("Customer contact details are in the admin dashboard.", "ltr") +
    emailParagraph(`<span style="color:#6b7278;font-size:13px">logo: ${logoUrl}</span>`, "ltr");

  return renderEmailDocument({
    bodyHtml: body,
    logoUrl,
    dir: "ltr",
    preheader: `${tag} — logo format test`,
    footer: { siteName: "Al Assema", siteUrl: SITE_URL },
  });
}

const variants = [
  {
    tag: "BEFORE",
    subject: "[BEFORE] logo test — WebP (what production sends today)",
    note: "This is the WebP from the dashboard upload. Expect a solid black square.",
    logoUrl: BEFORE_LOGO,
  },
  {
    tag: "AFTER",
    subject: "[AFTER] logo test — PNG flattened onto white (the fix)",
    note: "This is app/public/email-logo.png. Expect the logo to render.",
    logoUrl: AFTER_LOGO,
  },
];

// ── send ──────────────────────────────────────────────────────────────────────
console.log(`from: ${FROM}`);
console.log(`to:   ${TO}\n`);

let failed = 0;
for (const v of variants) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      subject: v.subject,
      html: build(v),
      text: `${v.tag}: ${v.note}\nlogo: ${v.logoUrl}`,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`  ✅ ${v.tag.padEnd(6)} sent   id=${payload.id ?? "?"}`);
    console.log(`     ${v.logoUrl}`);
  } else {
    failed++;
    console.log(`  ❌ ${v.tag.padEnd(6)} FAILED HTTP ${res.status}`);
    console.log(`     ${JSON.stringify(payload)}`);
  }
}

console.log(
  failed
    ? `\n${failed} of ${variants.length} failed — nothing to compare.`
    : "\nBoth sent. Open them in Gmail on the SAME client (the phone app is where" +
        "\nyou saw the black box) and compare the header image. Load remote images" +
        "\nif Gmail asks. BEFORE should be a black square; AFTER should be the logo.",
);
