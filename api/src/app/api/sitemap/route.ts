// Dynamic sitemap — generated from the live catalog so new companies/categories
// are discoverable without editing a static file or redeploying. `loc` URLs use
// PUBLIC_SITE_URL (the FRONTEND origin), since that's where the pages are served.
// Submit https://<api-domain>/api/sitemap to Search Console (or reference it from
// robots.txt). Exempt from the API-key gate in proxy.ts. Fail-soft: on a DB error
// it still returns the static routes so SEO never fully breaks.
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const SITE_URL = (process.env.PUBLIC_SITE_URL ?? "https://alassema.com").replace(/\/$/, "");

function entry(path: string, changefreq: string, priority: string): string {
  return `  <url><loc>${SITE_URL}${path}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

const STATIC_ENTRIES = [
  entry("/", "weekly", "1.0"),
  entry("/services", "weekly", "0.9"),
  entry("/companies", "daily", "0.9"),
  entry("/start", "monthly", "0.7"),
];

function xml(lines: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    lines.join("\n") +
    `\n</urlset>\n`
  );
}

export async function GET() {
  let dynamicEntries: string[] = [];
  try {
    const [categories, companies] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
      prisma.company.findMany({ where: { status: CompanyStatus.ACTIVE }, select: { slug: true } }),
    ]);
    dynamicEntries = [
      ...categories.map((c) => entry(`/services/${c.slug}`, "weekly", "0.8")),
      ...companies.map((c) => entry(`/companies/${c.slug}`, "weekly", "0.7")),
    ];
  } catch (err) {
    // Fail-soft: serve the static routes so the sitemap is never a hard 500.
    console.error("[sitemap] catalog query failed — serving static routes only:", err);
  }

  return new Response(xml([...STATIC_ENTRIES, ...dynamicEntries]), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
