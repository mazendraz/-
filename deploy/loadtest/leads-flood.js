// Al Assema — abuse rehearsal for the public lead-submit pipeline.
//
// Proves the defenses built into POST /api/leads actually hold under a flood:
//   • the IP-INDEPENDENT site-wide circuit breaker trips (429s appear),
//   • the app NEVER returns 5xx under abuse (it sheds load cleanly),
//   • the readiness probe stays healthy throughout.
//
// ⚠️ Run against STAGING ONLY — this writes many junk leads and trips the breakers.
// Never point BASE_URL at production.
//
// Usage:
//   k6 run -e BASE_URL=https://staging.example.com -e COMPANY_SLUG=<a-real-slug> deploy/loadtest/leads-flood.js
//
// Install k6: https://k6.io/docs/get-started/installation/
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COMPANY_SLUG = __ENV.COMPANY_SLUG || "seed-company";

const accepted = new Counter("leads_accepted_201");
const throttled = new Counter("leads_throttled_429");
const serverErrors = new Counter("server_5xx");

export const options = {
  scenarios: {
    // 50 requests/sec for 1 minute — well above the site-wide cap (default 100/min)
    // so the breaker must engage partway through.
    flood: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    // The whole point: abuse produces 429s, never 500s.
    server_5xx: ["count==0"],
    leads_throttled_429: ["count>0"],
  },
};

// Verify the app is healthy BEFORE the flood, so a failure during the run is
// attributable to load, not a pre-existing outage.
export function setup() {
  const r = http.get(`${BASE}/api/ready`);
  check(r, { "ready before flood": (res) => res.status === 200 });
}

function leadBody(i) {
  return JSON.stringify({
    companySlug: COMPANY_SLUG,
    companyName: "Load Test",
    service: "Load test service",
    name: "Load Tester",
    phone: "01012345678",
    district: "Test District",
    budget: "1000",
    description: `Automated abuse rehearsal — please ignore (#${i}).`,
  });
}

export default function () {
  // Rotate a fake client IP so we bypass the PER-IP limit and specifically exercise
  // the IP-independent site-wide/per-company circuit breakers.
  const ip = `203.0.113.${Math.floor(Math.random() * 255)}`;
  const res = http.post(`${BASE}/api/leads`, leadBody(__ITER), {
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
  });

  if (res.status === 201) accepted.add(1);
  else if (res.status === 429) throttled.add(1);
  else if (res.status >= 500) serverErrors.add(1);

  check(res, { "never a 5xx under abuse": (r) => r.status < 500 });
}

// Confirm the app is STILL healthy after being hammered (no cascading failure).
export function teardown() {
  const r = http.get(`${BASE}/api/ready`);
  check(r, { "ready after flood": (res) => res.status === 200 });
}
