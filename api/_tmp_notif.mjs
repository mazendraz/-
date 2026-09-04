import fs from "node:fs";
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.DATABASE_URL || "";
if (/pooler\.supabase\.com|supabase\.co/.test(url)) { console.error("REFUSING: production DB"); process.exit(1); }
const pg = (await import("pg")).default;
const c = new pg.Client({ connectionString: url });
await c.connect();
const { rows: [cu] } = await c.query('SELECT id FROM "CustomerUser" WHERE email=$1', ["test.qa@alassema.local"]);
const n = Number(process.argv[2] ?? 2);
await c.query('DELETE FROM "Notification" WHERE "customerId"=$1', [cu.id]);
for (let i = 0; i < n; i++) {
  await c.query(
    `INSERT INTO "Notification" (id, "customerId", type, title, body, url, read, "createdAt")
     VALUES (gen_random_uuid()::text, $1, 'LEAD_STATUS', $2, $3, '/requests', false, now() - ($4 || ' minutes')::interval)`,
    [cu.id, "\u062a\u062d\u062f\u064a\u062b \u0639\u0644\u0649 \u0637\u0644\u0628\u0643", "\u0627\u0644\u0634\u0631\u0643\u0629 \u0628\u062f\u0623\u062a \u0627\u0644\u062a\u0646\u0641\u064a\u0630.", String(i * 3)],
  );
}
const { rows: [r] } = await c.query('SELECT count(*)::int AS unread FROM "Notification" WHERE "customerId"=$1 AND read=false', [cu.id]);
console.log("unread notifications =", r.unread);
await c.end();
