// Image upload to Supabase Storage (admin only). Validates → resizes/compresses
// with sharp → uploads → returns a public URL.
//
// Buckets (create once in Supabase, PUBLIC read + admin/service-role write):
//   logos · covers · gallery · projects
// The admin UI stores the returned URL in logo / cover / gallery[] / project.img.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

// Video: gallery only (see validate()). Bigger cap than images — a short clip
// is inherently heavier than a photo — and no processing library exists in
// this repo for video, so unlike images these are stored exactly as uploaded
// (see passthroughVideo()). Keep deploy/Caddyfile's request_body max_size and
// this cap in sync — Caddy rejects oversized bodies before they reach here.
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

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

/**
 * Video has no processing step: nothing in this repo can transcode/resize it
 * (no ffmpeg). Stored exactly as uploaded — see MAX_VIDEO_UPLOAD_BYTES for why
 * that makes the size cap matter more here than for images.
 */
export async function passthroughVideo(input: Buffer, mimeType: string): Promise<ProcessedImage> {
  return { buffer: input, contentType: mimeType, ext: ALLOWED_VIDEO_MIME[mimeType] };
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

  if (file.type in ALLOWED_VIDEO_MIME) {
    // Video is a gallery-only feature — a company's logo/cover/project photo
    // has no reason to be a video, and keeping the restriction narrow limits
    // where the bigger size cap below applies.
    if (bucket !== "gallery") {
      throw new ValidationError("Video is only supported in the gallery", {
        file: ["Video uploads are only accepted for the gallery"],
      });
    }
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new ValidationError("File too large", {
        file: ["Video must be 50MB or smaller"],
      });
    }
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError("File too large", {
      file: ["Image must be 5MB or smaller"],
    });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new ValidationError("Unsupported file type", {
      file: ["Must be a JPEG, PNG, WebP, AVIF image, or an MP4/WebM/MOV video"],
    });
  }
}

// Write to the VPS filesystem (served as static files by Caddy). Used when
// STORAGE_DRIVER=local — this is what keeps images on Hostinger so the server's
// own backup covers them.
async function uploadToLocalDisk(
  bucket: UploadBucket,
  image: ProcessedImage,
): Promise<string> {
  const uploadsDir = process.env.UPLOADS_DIR;
  const baseUrl = process.env.PUBLIC_UPLOADS_BASE_URL;
  if (!uploadsDir || !baseUrl) {
    throw new Error(
      "Local storage not configured: set UPLOADS_DIR and PUBLIC_UPLOADS_BASE_URL",
    );
  }
  const filename = `${randomUUID()}.${image.ext}`;
  const dir = join(uploadsDir, bucket);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), image.buffer);
  return `${baseUrl.replace(/\/$/, "")}/${bucket}/${filename}`;
}

async function uploadToSupabase(
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

// STORAGE_DRIVER=local → VPS filesystem; anything else (default) → Supabase.
// Switchable per-environment via env, so we can cut over (and keep Supabase as a
// fallback during migration) without a code change.
async function uploadToStorage(
  bucket: UploadBucket,
  image: ProcessedImage,
): Promise<string> {
  if (process.env.STORAGE_DRIVER === "local") {
    return uploadToLocalDisk(bucket, image);
  }
  return uploadToSupabase(bucket, image);
}

/** Admin: validate, process, and upload an image or (gallery-only) video. Returns its public URL. */
export async function upload(
  file: File,
  bucket: string,
): Promise<UploadResult> {
  validate(file, bucket);
  const input = Buffer.from(await file.arrayBuffer());
  const processed = file.type in ALLOWED_VIDEO_MIME
    ? await passthroughVideo(input, file.type)
    : await processImage(input);
  const url = await uploadToStorage(bucket, processed);
  return { url };
}
