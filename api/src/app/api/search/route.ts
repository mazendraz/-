import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { okCached } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import * as catalogSearchService from "@/lib/services/catalogSearch.service";

export const dynamic = "force-dynamic";

// This was the ONE public route in the codebase with no limit at all, and it is
// also the most expensive read the API serves: every request loads the whole
// active catalogue and scores it in JS (see catalogSearch.service), on a single
// PM2 fork, synchronously. The per-query cost is now bounded by
// MAX_QUERY_LENGTH, but the per-SECOND cost still has to be.
//
// 30/min is well above real use — a search box fires one request per debounced
// keystroke pause, and the clients cache — and far below what it takes to keep
// the event loop busy.
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

// GET /api/search?q=&limit= → { results: ApiCatalogSearchResult[] }
// Public, unauthenticated: the ONE global search behind the website and the
// mobile app, over Category + Company + Offering (products/services) together.
export const GET = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`search:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
  const results = await catalogSearchService.searchCatalog(q, limit);
  return okCached({ results });
});
