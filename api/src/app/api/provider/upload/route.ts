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

// Which buckets a provider may target. Every field behind them is one a
// provider can already edit for their OWN company through the change-request
// queue (changeRequests.service.ts EDITABLE_FIELDS: logo, cover, gallery) or
// own outright (project.img) — so this grants no reach the account did not
// have, it only stores the bytes in the folder that matches the field.
const PROVIDER_BUCKETS = new Set(["projects", "gallery", "logos", "covers"]);

// The default is "projects" because that is what this route did unconditionally
// before, and mobile/business's uploadProjectImage still sends no bucket at all.
const DEFAULT_BUCKET = "projects";

// POST /api/provider/upload (multipart: file, bucket?) → { url }
//
// `bucket` used to be ignored and forced to "projects". That silently broke two
// things the product otherwise offers:
//   • the website's provider GalleryManager has always POSTed bucket="gallery"
//     here, so every provider gallery upload has been landing in the projects
//     folder instead;
//   • upload.service.ts allows video in the "gallery" bucket ONLY, so a provider
//     adding a clip to their gallery got "Video is only supported in the
//     gallery" — for an upload that was, in fact, for the gallery.
// Honouring a value from a fixed allowlist fixes both without widening what a
// provider can reach: an unknown bucket is still rejected, not passed through.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  const rl = await rateLimit(`upload:${user.id}`, UPLOAD_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many uploads. Try again in ${seconds}s.`);
  }

  const form = await request.formData();
  const file = form.get("file");
  const requested = String(form.get("bucket") ?? "") || DEFAULT_BUCKET;

  if (!(file instanceof File)) {
    throw new ValidationError("Missing file", {
      file: ["A file field is required (multipart/form-data)"],
    });
  }

  if (!PROVIDER_BUCKETS.has(requested)) {
    throw new ValidationError("Unknown bucket", {
      bucket: [`"${requested}" is not a bucket providers can upload to`],
    });
  }

  return ok(await uploadService.upload(file, requested));
});
