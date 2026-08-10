import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { adminOnly } from "@/lib/middleware/guards";
import { rateLimit } from "@/lib/middleware/rateLimit";
import * as uploadService from "@/lib/services/upload.service";

export const dynamic = "force-dynamic";

// Keyed by USER — see the note in provider/upload/route.ts for why, and for what
// this limit exists to stop (audit finding M-05).
//
// Higher than the provider ceiling because the admin path is the one that fills a
// company gallery, and the gallery cap is 60 images in a single editing session
// (validation/companies.ts). A limit that a legitimate bulk edit trips is a limit
// that gets raised until it means nothing.
const UPLOAD_RATE_LIMIT = { limit: 120, windowMs: 15 * 60_000 };

// POST /api/admin/upload (multipart: file, bucket) → { url }
export const POST = adminOnly(async (request: NextRequest, _ctx, user) => {
  const rl = await rateLimit(`upload:${user.id}`, UPLOAD_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many uploads. Try again in ${seconds}s.`);
  }

  const form = await request.formData();
  const file = form.get("file");
  const bucket = String(form.get("bucket") ?? "");

  if (!(file instanceof File)) {
    throw new ValidationError("Missing file", {
      file: ["A file field is required (multipart/form-data)"],
    });
  }

  return ok(await uploadService.upload(file, bucket));
});
