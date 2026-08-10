import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { providerOnly } from "@/lib/middleware/guards";
import { rateLimit } from "@/lib/middleware/rateLimit";
import * as uploadService from "@/lib/services/upload.service";

export const dynamic = "force-dynamic";

// Keyed by USER, not IP: a provider's whole office is one NAT address, so an
// IP-keyed limit would throttle colleagues who share it. Nothing behind auth was
// rate-limited at all before the 2026-08-10 audit (finding M-05) — a provider
// account could loop uploads until either the PM2 instance hit its 1GB restart
// threshold on concurrent sharp decodes, or the Storage bill did the work instead.
//
// 60 per 15 minutes is far above real use (a portfolio shoot is a handful of
// photos) and far below what abuse needs. The window must stay under
// MAX_TRACKED_WINDOW_MS (1h) or the sweeper would forget entries mid-window.
const UPLOAD_RATE_LIMIT = { limit: 60, windowMs: 15 * 60_000 };

// POST /api/provider/upload (multipart: file) → { url }
// Providers can upload images for their portfolio projects only; the bucket is
// forced to "projects" regardless of any client-supplied value.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  const rl = await rateLimit(`upload:${user.id}`, UPLOAD_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many uploads. Try again in ${seconds}s.`);
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    throw new ValidationError("Missing file", {
      file: ["A file field is required (multipart/form-data)"],
    });
  }

  return ok(await uploadService.upload(file, "projects"));
});
