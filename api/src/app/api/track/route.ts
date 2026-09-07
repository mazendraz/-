import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { trackEventSchema } from "@/lib/validation/siteEvents";
import { recordEvent } from "@/lib/services/siteEvents.service";

export const dynamic = "force-dynamic";

// Generous next to the lead submit's 5/min, because a normal visit legitimately
// fires one of these per page it opens — but still a ceiling, so a script can't
// sit on this endpoint and write rows until the disk fills.
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

// POST /api/track → 202, always.
//
// Public and unauthenticated on purpose: the entire point is to count the
// visitors who never sign in, and those are exactly the ones dropping out.
//
// It answers 202 for EVERY outcome — accepted, rate-limited, malformed. The
// caller is a fire-and-forget beacon that cannot react to a failure anyway,
// and a 4xx here would only paint red errors in the visitor's console on a
// page that is working perfectly. Nothing on the site depends on the response.
export const POST = withErrors(withMaintenance(async (request: NextRequest) => {
  const accepted = { accepted: true } as const;

  const rl = await rateLimit(`track:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) return ok(accepted, 202); // silently dropped

  // 1KB is far above any legitimate event and far below anything worth parsing
  // from a hostile client. readJsonObject THROWS on a malformed or oversized
  // body, which withErrors would turn into a 400/413 — caught here instead so
  // the "always 202" promise above holds for every input, not just valid JSON.
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 1024);
  } catch {
    return ok(accepted, 202);
  }

  const parsed = trackEventSchema.safeParse(body);
  if (!parsed.success) return ok(accepted, 202);

  await recordEvent(parsed.data);
  return ok(accepted, 202);
}));
