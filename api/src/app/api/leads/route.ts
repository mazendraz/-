import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { createLeadSchema } from "@/lib/validation/leads";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// POST /api/leads → 201 + RAW ApiLead. Resolves the company by slug (must be ACTIVE).
export const POST = withErrors(async (request: NextRequest) => {
  const rl = rateLimit(`leads:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const raw = await request.json().catch(() => null);
  if (raw === null || typeof raw !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  // Honeypot: real clients never fill `website`; bots auto-fill every field.
  if (typeof (raw as { website?: unknown }).website === "string" &&
    (raw as { website: string }).website.trim() !== "") {
    throw new ValidationError("Submission rejected");
  }

  const payload = createLeadSchema.parse(raw);
  const lead = await leadsService.create(payload);
  return ok(lead, 201);
});
