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

// ── Video container sniffing ─────────────────────────────────────────────────
//
// An image can lie about its type and be caught anyway, because sharp DECODES it
// and re-encodes to WebP — a file that isn't an image simply fails. Video has no
// such step (no ffmpeg in this repo), so it was stored byte-for-byte using the
// Content-Type the CLIENT put on the multipart part. That is not validation; it
// is a label. Anything at all could be uploaded as `video/mp4` and served back
// from a public bucket under that type.
//
// So the bytes decide. Both accepted families announce themselves in their first
// few bytes, which is enough to tell a real container from a renamed one.

/**
 * ISO Base Media File Format brands we accept. The brand sits at bytes 8..12,
 * right after the `ftyp` box type. `qt  ` is QuickTime; the rest are the MP4
 * family that real cameras, phones and editors emit.
 */
const ISO_MP4_BRANDS = new Set([
  "isom", "iso2", "iso4", "iso5", "iso6", "avc1", "mp41", "mp42",
  "mmp4", "M4V ", "M4VP", "dash", "msnv", "MSNV", "f4v ", "3gp4", "3gp5",
]);

/**
 * The real container type of `buf`, or null when it is not a video we accept.
 *
 * Deliberately returns the type it FOUND rather than comparing against what the
 * client claimed. A phone that uploads a genuine WebM while labelling it
 * `video/mp4` is a mislabelled real video, not an attack — storing it correctly
 * is better than rejecting it. Only "these bytes are not a supported video at
 * all" is a rejection.
 */
export function sniffVideoMime(buf: Buffer): string | null {
  // ISO BMFF: [4-byte size][`ftyp`][4-byte major brand]
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (ISO_MP4_BRANDS.has(brand)) return "video/mp4";
    return null; // an ISO container, but not a family we serve
  }

  // EBML (WebM and Matroska share it). The DocType string appears in the header
  // element within the first few dozen bytes; Matroska is NOT accepted, because
  // browsers will not play it from a <video> tag and it would be a silent
  // upload-succeeds-playback-fails.
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    const header = buf.toString("latin1", 0, Math.min(buf.length, 512));
    if (header.includes("webm")) return "video/webm";
    return null;
  }

  return null;
}

/**
 * Video has no processing step: nothing in this repo can transcode/resize it
 * (no ffmpeg). Stored exactly as uploaded — see MAX_VIDEO_UPLOAD_BYTES for why
 * that makes the size cap matter more here than for images.
 *
 * The stored content type comes from sniffVideoMime, NOT from the caller, so the
 * bucket can never serve a file under a type its bytes contradict.
 */
export async function passthroughVideo(input: Buffer): Promise<ProcessedImage> {
  const sniffed = sniffVideoMime(input);
  if (!sniffed) {
    throw new ValidationError("Unsupported or corrupted video", {
      file: ["The file is not a valid MP4, WebM or MOV video"],
    });
  }
  return { buffer: input, contentType: sniffed, ext: ALLOWED_VIDEO_MIME[sniffed] };
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

  // The declared type only chooses WHICH validator runs. Both then decide from
  // the bytes: sharp by decoding the image, sniffVideoMime by reading the
  // container signature. Neither trusts the label it was routed by, so a
  // mislabelled file is caught by whichever path it is sent down.
  const processed = file.type in ALLOWED_VIDEO_MIME
    ? await passthroughVideo(input)
    : await processImage(input);

  const url = await uploadToStorage(bucket, processed);
  return { url };
}
