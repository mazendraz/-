// Image upload to Supabase Storage (admin only). Validates → resizes/compresses
// with sharp → uploads → returns a public URL.
//
// Buckets (create once in Supabase, PUBLIC read + admin/service-role write):
//   logos · covers · gallery · projects
// The admin UI stores the returned URL in logo / cover / gallery[] / project.img.
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ValidationError } from "@/lib/utils/errors";

export const UPLOAD_BUCKETS = ["logos", "covers", "gallery", "projects"] as const;
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 1200; // px, longest side
// Reject decompression/pixel bombs: a small file can declare an enormous canvas
// that would blow up memory when decoded. 50MP comfortably covers real photos.
const MAX_INPUT_PIXELS = 50_000_000;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export interface UploadResult {
  url: string;
}

export function isUploadBucket(value: string): value is UploadBucket {
  return (UPLOAD_BUCKETS as readonly string[]).includes(value);
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * Resize (longest side ≤ 1200px, never upscaling) and re-encode to WebP.
 * Pure function of its input — unit-testable without Supabase.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // honor EXIF orientation
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    return { buffer, contentType: "image/webp", ext: "webp" };
  } catch {
    // Corrupt, non-image, or over the pixel cap — a client error, not a 500.
    throw new ValidationError("Could not process image", {
      file: ["The file is not a valid image or is too large to process"],
    });
  }
}

function validate(file: File, bucket: string): asserts bucket is UploadBucket {
  if (!isUploadBucket(bucket)) {
    throw new ValidationError("Invalid upload bucket", {
      bucket: [`Must be one of: ${UPLOAD_BUCKETS.join(", ")}`],
    });
  }
  if (file.size === 0) {
    throw new ValidationError("Empty file", { file: ["File is empty"] });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError("File too large", {
      file: ["Image must be 5MB or smaller"],
    });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new ValidationError("Unsupported file type", {
      file: ["Must be a JPEG, PNG, WebP, or AVIF image"],
    });
  }
}

async function uploadToStorage(
  bucket: UploadBucket,
  image: ProcessedImage,
): Promise<string> {
  const path = `${randomUUID()}.${image.ext}`;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, image.buffer, {
      contentType: image.contentType,
      upsert: false,
    });
  if (error) {
    throw new ValidationError("Upload failed", { file: [error.message] });
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Admin: validate, process, and upload an image. Returns its public URL. */
export async function upload(
  file: File,
  bucket: string,
): Promise<UploadResult> {
  validate(file, bucket);
  const input = Buffer.from(await file.arrayBuffer());
  const processed = await processImage(input);
  const url = await uploadToStorage(bucket, processed);
  return { url };
}
