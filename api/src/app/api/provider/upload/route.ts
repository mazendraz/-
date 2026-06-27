import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { ValidationError } from "@/lib/utils/errors";
import { providerOnly } from "@/lib/middleware/guards";
import * as uploadService from "@/lib/services/upload.service";

export const dynamic = "force-dynamic";

// POST /api/provider/upload (multipart: file) → { url }
// Providers can upload images for their portfolio projects only; the bucket is
// forced to "projects" regardless of any client-supplied value.
export const POST = providerOnly(async (request: NextRequest) => {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    throw new ValidationError("Missing file", {
      file: ["A file field is required (multipart/form-data)"],
    });
  }

  return ok(await uploadService.upload(file, "projects"));
});
