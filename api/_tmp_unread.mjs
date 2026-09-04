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
const n = process.argv[2];
const r = await c.query(`
  SELECT cv.id, cv."customerUnread", co.name
  FROM "Conversation" cv
  JOIN "Company" co ON co.id = cv."companyId"
  JOIN "Lead" l ON l.id = cv."leadId"
  JOIN "CustomerUser" cu ON cu.id = l."customerId"
  WHERE cu.email = 'test.qa@alassema.local'
  ORDER BY cv."lastMessageAt" DESC NULLS LAST`);
console.log("QA convs:\n" + r.rows.map(x => ` ${x.id} | ${x.name} | unread=${x.customerUnread}`).join("\n"));
if (n && r.rows[0]) {
  await c.query('UPDATE "Conversation" SET "customerUnread"=$1 WHERE id=$2', [Number(n), r.rows[0].id]);
  console.log(`SET customerUnread=${n} on ${r.rows[0].id}`);
}
await c.end();
