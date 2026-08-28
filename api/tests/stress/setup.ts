// Bootstrap for the concurrency/stress suite.
//
// Everything the integration suite does (local-DB safety guard, captcha off,
// maintenance forced off) applies here identically, so this file DELEGATES to it
// rather than restating it — one definition of "how a test run reaches a
// database", not two that can drift apart.
//
// On top of that it raises the two SITE-WIDE lead circuit breakers. Those caps
// (100 leads/min site-wide, 20/min per company — see app/api/leads/route.ts) are
// a real, deliberate feature, and one file here exercises them on purpose. But
// for every OTHER test the cap is not the thing under test: a 60-way concurrent
// submit is trying to find out whether the *de-duplication* holds, and a run
// that returns 429 from request 21 onward answers a different question. Raised
// here rather than per-file because the limits are read once at route-module
// import time, so a later assignment would have no effect.
//
// The per-IP limit (5/min) is deliberately NOT touched: tests that need more
// than five concurrent submits use distinct client IPs, which is also what the
// real scenario looks like (one account on several devices/networks, or a
// distributed retry storm).
process.env.LEADS_SITE_RATE_LIMIT = "100000";
process.env.LEADS_COMPANY_RATE_LIMIT = "100000";

// `await import`, NOT a static import: a static one is hoisted ABOVE the two
// assignments above, which is precisely the ordering trap the integration
// setup's own comments call out — the route modules would then read the
// shipped defaults and every concurrency test would be measuring the rate
// limiter instead of the thing it names.
await import("../integration/setup");

export {};
