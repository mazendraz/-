import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { ValidationError } from "@/lib/utils/errors";
import { adminOnly } from "@/lib/middleware/guards";
import * as uploadService from "@/lib/services/upload.service";

export const dynamic = "force-dynamic";

// POST /api/admin/upload (multipart: file, bucket) → { url }
export const POST = adminOnly(async (request: NextRequest) => {
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
