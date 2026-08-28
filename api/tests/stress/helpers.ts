// Shared fixture + request helpers for the concurrency/stress suite.
//
// Deliberately the same shape as the ones inlined in tests/integration/*.int.test.ts
// (NextRequest built by hand, handlers called directly) — these tests are the
// integration tests run N-wide, not a different testing strategy. Factored out
// here only because six stress files would otherwise copy the same company
// fixture six times.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

/** Unique per test FILE so parallel-safe cleanup can key off it. */
export function makeTag(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function req(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    /** Client IP. Distinct values dodge the per-IP rate limit — see setup.ts. */
    ip?: string;
    cookie?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  headers.set("x-forwarded-for", opts.ip ?? "10.9.9.9");
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

/**
 * A parsed API response body.
 *
 * Deliberately loose: these tests read whatever shape a route happens to return,
 * including error bodies and the raw text of a non-JSON response, and asserting
 * against a declared shape would mean re-declaring every payload in the API here.
 * Indexable rather than `any`, so a typo still fails to compile where it can.
 */
// The `any` is the point: a test reads an arbitrary route's payload — success
// bodies, error bodies, the raw text of a non-JSON response — and narrowing it
// would mean re-declaring every response shape in the API inside this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResponseBody = any;

/** Response body + status in one await, so assertions read as one line. */
export async function read(res: Response): Promise<{ status: number; body: ResponseBody }> {
  const status = res.status;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status, body: body as ResponseBody };
}

/**
 * Fire `n` copies of the same request-producing function as simultaneously as
 * this process can manage, and report each outcome without letting one rejection
 * hide the rest.
 *
 * `Promise.all` is wrong here twice over: it rejects on the first failure (so a
 * duplicate-detection 409 would abort the run before the interesting request
 * lands), and it would report a thrown handler as a test error rather than as
 * the finding it is.
 */
export async function burst<T>(
  n: number,
  fn: (i: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
}

/** Status counts from a burst of route responses, e.g. { "201": 7, "409": 1 }. */
export async function statusTally(
  results: PromiseSettledResult<Response>[],
): Promise<Record<string, number>> {
  const tally: Record<string, number> = {};
  for (const r of results) {
    const key = r.status === "rejected" ? `threw:${(r.reason as Error)?.message ?? "?"}` : String(r.value.status);
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}

export const CATEGORY_ICON = "home";

export interface Fixture {
  tag: string;
  categoryId: string;
  companyId: string;
  companySlug: string;
  otherCompanyId: string;
  otherCompanySlug: string;
  providerToken: string;
  otherProviderToken: string;
  adminToken: string;
  providerId: string;
  otherProviderId: string;
  adminId: string;
}

function companyData(slug: string, name: string, categoryId: string) {
  return {
    categories: { create: [{ categoryId, isPrimary: true }] },
    slug,
    name,
    tagline: "t",
    about: "a",
    logo: "/l.jpg",
    cover: "/c.jpg",
    services: ["Finishing"],
    gallery: [],
    badges: [],
    phone: "+201000000000",
    location: "New Capital",
    yearsExperience: 3,
    responseTime: "1h",
    verifiedSince: "2024",
    status: "ACTIVE" as const,
  };
}

/**
 * Two ACTIVE companies (the second exists so every cross-tenant authorization
 * test has a real neighbour to be denied against), a provider for each, and an
 * admin.
 */
export async function createFixture(tag: string): Promise<Fixture> {
  // FIXED_CATALOG, not the QUOTE_ONLY default: offerings.service's
  // assertCatalogEnabled refuses to create or edit an offering unless one of the
  // company's categories runs a fixed-price catalogue, so a QUOTE_ONLY fixture
  // makes every catalogue test fail with a 400 that says nothing about the
  // behaviour under test.
  const category = await prisma.category.create({
    data: {
      slug: `${tag}-cat`,
      label: `Cat ${tag}`,
      description: "d",
      icon: CATEGORY_ICON,
      isActive: true,
      pricingMode: "FIXED_CATALOG",
    },
  });

  const companySlug = `${tag}-co`;
  const otherCompanySlug = `${tag}-other`;
  const company = await prisma.company.create({ data: companyData(companySlug, `Co ${tag}`, category.id) });
  const other = await prisma.company.create({ data: companyData(otherCompanySlug, `Other ${tag}`, category.id) });

  const passwordHash = await hashPassword("stress-test-pass-123");
  const provider = await prisma.user.create({
    data: { name: "P", email: `${tag}-prov@test.local`, passwordHash, role: "PROVIDER", companyId: company.id, isActive: true },
  });
  const otherProvider = await prisma.user.create({
    data: { name: "O", email: `${tag}-other@test.local`, passwordHash, role: "PROVIDER", companyId: other.id, isActive: true },
  });
  const admin = await prisma.user.create({
    data: { name: "A", email: `${tag}-admin@test.local`, passwordHash, role: "ADMIN", isActive: true },
  });

  return {
    tag,
    categoryId: category.id,
    companyId: company.id,
    companySlug,
    otherCompanyId: other.id,
    otherCompanySlug,
    providerId: provider.id,
    otherProviderId: otherProvider.id,
    adminId: admin.id,
    providerToken: await signToken({ sub: provider.id, role: "PROVIDER", companyId: company.id }),
    otherProviderToken: await signToken({ sub: otherProvider.id, role: "PROVIDER", companyId: other.id }),
    adminToken: await signToken({ sub: admin.id, role: "ADMIN", companyId: null }),
  };
}

/**
 * Tear down everything a fixture's two companies own, in FK order.
 *
 * Ordered by hand rather than relying on cascade because several relations are
 * deliberately SetNull (Lead.clientId, WaitlistEntry.convertedLeadId) — those
 * rows survive their parent and would leak between runs.
 */
export async function destroyFixture(f: Fixture): Promise<void> {
  const companyIds = [f.companyId, f.otherCompanyId];
  const leadWhere = { lead: { companyId: { in: companyIds } } };

  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.message.deleteMany({ where: { conversation: { companyId: { in: companyIds } } } });
  await prisma.conversation.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.leadCompletion.deleteMany({ where: leadWhere });
  await prisma.leadItem.deleteMany({ where: leadWhere });
  await prisma.review.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.waitlistEntry.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.lead.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.offeringTier.deleteMany({ where: { offering: { companyId: { in: companyIds } } } });
  await prisma.offering.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.busyWindow.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.project.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.changeRequest.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.notification.deleteMany({ where: { customer: { email: { startsWith: f.tag } } } });
  await prisma.customerSession.deleteMany({ where: { customer: { email: { startsWith: f.tag } } } });
  await prisma.customerUser.deleteMany({ where: { email: { startsWith: f.tag } } });
  // Exactly the numbers this run issued — never a prefix match. See the comment
  // on PHONE_PREFIX for what that would have cost.
  await prisma.client.deleteMany({ where: { phone: { in: [...issuedPhones] } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: f.tag } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: f.tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.category.deleteMany({ where: { id: f.categoryId } });
}

/**
 * Prefix for generated test numbers.
 *
 * NOT treated as a cleanup filter. `+20109` is a REAL Egyptian mobile prefix, and
 * an earlier version of this file deleted `Client` rows by `startsWith` on it —
 * which would have destroyed a genuine customer record the first time this suite
 * ran against a database holding one. Verified against the local dev database:
 * it contains exactly such a row, created by someone else, that the prefix sweep
 * would have matched.
 *
 * `Client` is the one table that needs this care: it is deduplicated by phone
 * GLOBALLY and has no company to scope a delete by. So instead of guessing from
 * the shape of a number, every phone this file hands out is remembered, and
 * teardown deletes exactly those.
 */
export const PHONE_PREFIX = "+20109";

/** Every phone `uniquePhone` has issued — the exact set teardown may delete. */
const issuedPhones = new Set<string>();

let phoneCounter = 0;
/** A distinct, valid E.164 phone per call. */
export function uniquePhone(): string {
  phoneCounter += 1;
  const phone = `${PHONE_PREFIX}${String(phoneCounter).padStart(7, "0")}`;
  issuedPhones.add(phone);
  return phone;
}

/** A well-formed lead payload; override any field per test. */
export function leadPayload(
  companySlug: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    companySlug,
    companyName: "Co",
    service: "Full apartment finishing",
    name: "Test Customer",
    phone: uniquePhone(),
    district: "R7",
    budget: "",
    description: "Please quote.",
    ...overrides,
  };
}
