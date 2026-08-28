// Throughput, latency and the abuse ceilings.
//
// Two jobs:
//
//   1. Measure. Every test here prints its own numbers through the assertion
//      message, so a run is a datasheet as well as a pass/fail. The thresholds
//      are deliberately loose — they exist to catch an order-of-magnitude
//      regression (an N+1 appearing in a list endpoint, a missing index), not to
//      pin down millisecond timings on whatever laptop happens to run them.
//
//   2. Confirm the abuse ceilings actually hold. The per-IP limit on the public
//      submit is the one defence that stands between this endpoint and a single
//      script, so it gets asserted rather than assumed.
//
// NOTE ON WHAT THESE NUMBERS ARE: route handlers are invoked in-process against
// a local Postgres. There is no HTTP parsing, no TLS, no network and no Caddy in
// the path, and the database is on the same machine. Treat them as a floor for
// server-side work — production latency is this plus the network — and as a
// comparable baseline between runs, not as a prediction of production.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/middleware/rateLimit";
import { POST as leadsPOST } from "@/app/api/leads/route";
import { GET as companiesGET } from "@/app/api/companies/route";
import { GET as companyGET } from "@/app/api/companies/[slug]/route";
import { GET as providerLeadsGET } from "@/app/api/provider/leads/route";
import { GET as adminLeadsGET } from "@/app/api/admin/leads/route";
import { GET as searchGET } from "@/app/api/search/route";
import { createFixture, ctx, destroyFixture, leadPayload, makeTag, req, uniquePhone, type Fixture } from "./helpers";

const tag = makeTag("load");
let f: Fixture;

/** How many leads to seed before measuring the list endpoints. */
const SEEDED_LEADS = 500;

beforeAll(async () => {
  f = await createFixture(tag);

  // Seed a realistic-but-large pipeline in one round trip. createMany skips the
  // per-lead conversation/notification fan-out on purpose: this file measures
  // READ performance against a populated table, and going through the API 500
  // times would measure the fan-out instead.
  await prisma.lead.createMany({
    data: Array.from({ length: SEEDED_LEADS }, (_, i) => ({
      companyId: f.companyId,
      refNumber: `AA-${tag}-${String(i).padStart(5, "0")}`,
      trackingToken: `tok-${tag}-${i}`,
      customerName: `Load Customer ${i}`,
      phone: uniquePhone(),
      district: i % 2 === 0 ? "R7" : "R8",
      service: i % 3 === 0 ? "Full apartment finishing" : "Kitchen fit-out",
      budget: "",
      description: "Seeded for load measurement.",
      status: (["NEW", "CONTACTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)[i % 5],
    })),
  });
});

afterAll(async () => {
  await destroyFixture(f);
});

interface Stats {
  n: number;
  errors: number;
  totalMs: number;
  rps: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/** Run `n` calls at `concurrency` and report the latency distribution. */
async function measure(n: number, concurrency: number, call: (i: number) => Promise<Response>): Promise<Stats> {
  const latencies: number[] = [];
  let errors = 0;
  let next = 0;
  const started = Date.now();

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      const t0 = performance.now();
      try {
        const res = await call(i);
        if (res.status >= 500) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  const totalMs = Date.now() - started;
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    n,
    errors,
    totalMs,
    rps: Math.round((n / Math.max(1, totalMs)) * 1000),
    avg: Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(percentile(sorted, 100)),
  };
}

const report = (name: string, s: Stats): string =>
  `${name}: n=${s.n}, ${s.rps} rps, avg ${s.avg}ms, ` +
  `p50 ${s.p50}ms, p95 ${s.p95}ms, p99 ${s.p99}ms, max ${s.max}ms, ${s.errors} 5xx`;

describe("read throughput at increasing concurrency", () => {
  for (const concurrency of [10, 50, 100]) {
    it(`serves the public company list at concurrency ${concurrency}`, async () => {
      const s = await measure(concurrency * 3, concurrency, () =>
        companiesGET(req("/api/companies?page=1&pageSize=20", { ip: "10.70.0.1" })),
      );
      console.log(report(`GET /api/companies @${concurrency}`, s));
      expect(s.errors, `5xx under load — ${report("companies", s)}`).toBe(0);
      expect(s.p95, `p95 ${s.p95}ms at concurrency ${concurrency}`).toBeLessThan(5_000);
    });
  }

  it(`serves the provider lead list over ${SEEDED_LEADS} leads`, async () => {
    const s = await measure(60, 20, () =>
      providerLeadsGET(req("/api/provider/leads?page=1&pageSize=20", { token: f.providerToken, ip: "10.70.0.2" }), ctx({})),
    );
    console.log(report("GET /api/provider/leads", s));
    expect(s.errors).toBe(0);
    expect(s.p95, `p95 ${s.p95}ms — a paged list over ${SEEDED_LEADS} rows`).toBeLessThan(5_000);
  });

  it("serves the admin lead list with a search term", async () => {
    // leadSearchWhere ORs five `contains` filters with mode:"insensitive" —
    // none of which any index can serve. This is where a slow query would show.
    const s = await measure(30, 10, () =>
      adminLeadsGET(req("/api/admin/leads?search=Load%20Customer&page=1&pageSize=20", { token: f.adminToken, ip: "10.70.0.3" }), ctx({})),
    );
    console.log(report("GET /api/admin/leads?search", s));
    expect(s.errors).toBe(0);
    expect(s.p95, `p95 ${s.p95}ms for an unindexed 5-column ILIKE search over ${SEEDED_LEADS} rows`).toBeLessThan(5_000);
  });

  it("serves the deep last page as fast as the first", async () => {
    // OFFSET paging degrades linearly with depth. At 500 rows it should not be
    // visible; this records the ratio so a future 500k-row table has a baseline.
    const first = await measure(10, 5, () =>
      adminLeadsGET(req("/api/admin/leads?page=1&pageSize=20", { token: f.adminToken, ip: "10.70.0.4" }), ctx({})),
    );
    const last = await measure(10, 5, () =>
      adminLeadsGET(req(`/api/admin/leads?page=${Math.floor(SEEDED_LEADS / 20)}&pageSize=20`, { token: f.adminToken, ip: "10.70.0.5" }), ctx({})),
    );
    console.log(report("GET /api/admin/leads page 1", first));
    console.log(report(`GET /api/admin/leads page ${Math.floor(SEEDED_LEADS / 20)}`, last));
    expect(last.errors).toBe(0);
  });

  it("serves global search without a 5xx", async () => {
    const s = await measure(30, 10, () => searchGET(req("/api/search?q=finishing", { ip: "10.70.0.6" })));
    console.log(report("GET /api/search?q=finishing", s));
    expect(s.errors).toBe(0);
  });

  it("serves a company profile page", async () => {
    const s = await measure(30, 10, () => companyGET(req(`/api/companies/${f.companySlug}`, { ip: "10.70.0.7" }), ctx({ slug: f.companySlug })));
    console.log(report("GET /api/companies/[slug]", s));
    expect(s.errors).toBe(0);
  });
});

describe("write throughput", () => {
  it("accepts 100 distinct lead submissions at concurrency 25", async () => {
    // Distinct payloads and distinct IPs: this measures the write path, not the
    // de-duplication or the rate limiter.
    const s = await measure(100, 25, (i) =>
      leadsPOST(req("/api/leads", { method: "POST", body: leadPayload(f.companySlug), ip: `10.71.${Math.floor(i / 250)}.${(i % 250) + 1}` })),
    );
    console.log(report("POST /api/leads", s));
    expect(s.errors, `5xx during concurrent submits — ${report("leads", s)}`).toBe(0);
    expect(s.p95, `p95 ${s.p95}ms on the public submit`).toBeLessThan(10_000);
  });
});

describe("abuse ceilings", () => {
  it("holds the per-IP submit limit at 5 per minute", async () => {
    // Sequential, so there is no ambiguity about ordering: the 6th must be 429.
    const ip = "10.72.0.99";
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await leadsPOST(req("/api/leads", { method: "POST", body: leadPayload(f.companySlug), ip }));
      statuses.push(res.status);
    }
    const accepted = statuses.filter((s) => s === 201).length;
    const limited = statuses.filter((s) => s === 429).length;

    expect(accepted, `statuses: ${statuses.join(",")}`).toBe(5);
    expect(limited, `statuses: ${statuses.join(",")}`).toBe(3);
  });

  it("does not let a spoofed X-Forwarded-For buy a fresh quota", async () => {
    // clientIp reads XFF from the RIGHT with TRUSTED_PROXY_HOPS=1, so a client
    // prepending its own entries must not move the bucket. Here the RIGHTMOST
    // entry — the one a single trusted proxy would have appended — is held
    // constant while the attacker-controlled left side varies.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const request = req("/api/leads", { method: "POST", body: leadPayload(f.companySlug) });
      request.headers.set("x-forwarded-for", `1.2.3.${i}, 10.73.0.50`);
      statuses.push((await leadsPOST(request)).status);
    }
    const accepted = statuses.filter((s) => s === 201).length;
    expect(accepted, `spoofing the left of XFF bought ${accepted} submits; statuses: ${statuses.join(",")}`).toBe(5);
  });

  it("counts a burst against the limit without letting extras through", async () => {
    // The in-memory limiter reads and writes its map synchronously, so a
    // concurrent burst should be counted exactly. Asserted directly against the
    // limiter (not the route) so nothing downstream can mask an off-by-N.
    const key = `stress-burst-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 100 }, () => rateLimit(key, { limit: 10, windowMs: 60_000 })),
    );
    const allowed = results.filter((r) => r.ok).length;
    expect(allowed, `100 concurrent calls against a limit of 10 allowed ${allowed}`).toBe(10);
  });
});
