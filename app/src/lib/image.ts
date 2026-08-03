import { apiUpload, isApiConfigured } from "./api";

/** Supabase Storage buckets the backend accepts (see admin/upload). */
export type UploadBucket = "logos" | "covers" | "gallery" | "projects";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — mirrors the backend limit
// Gallery-only (see upload.service.ts's ALLOWED_VIDEO_MIME / MAX_VIDEO_UPLOAD_BYTES).
// Bigger cap than images because a video is inherently heavier, and there is no
// server-side processing step for it (no ffmpeg in this repo) — it is stored
// exactly as uploaded.
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — mirrors the backend limit
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

/**
 * Upload an image, or (gallery only) a video, and return a URL to persist in
 * the catalog.
 *  • API mode: POST the file to /admin/upload — images are resized to WebP
 *    server-side; video is stored as uploaded. Returns a public URL, no
 *    base64 in localStorage.
 *  • Demo mode (no API): images fall back to a downscaled, compressed data URL
 *    so the offline admin still works. Video has no such fallback — a 50MB
 *    file as a base64 string would blow the localStorage quota — so it
 *    requires a live server.
 */
export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  maxDim = 1000,
  // Upload endpoint. Admin UIs use the default; the provider dashboard passes
  // "/provider/upload" (admin/upload is admin-only and would 403 for providers).
  endpoint: "/admin/upload" | "/provider/upload" = "/admin/upload",
): Promise<string> {
  const isVideo = VIDEO_MIME.has(file.type);
  if (!isVideo && !file.type.startsWith("image/")) {
    throw new Error("Please choose an image (or, for the gallery, an MP4/WebM/MOV video) file.");
  }

  if (isApiConfigured()) {
    const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
    if (file.size > maxBytes) {
      throw new Error(isVideo ? "Video must be 50MB or smaller." : "Image must be 5MB or smaller.");
    }
    const form = new FormData();
    form.append("file", file);
    form.append("bucket", bucket);
    const { url } = await apiUpload<{ url: string }>(endpoint, form);
    return url;
  }

  if (isVideo) throw new Error("Video upload requires a live server (not available in demo mode).");
  return fileToDataURL(file, maxDim);
}

/** Extension-based check (query string ignored) — used to render gallery
 *  items as <video> instead of <img>. Videos are stored as-is (no processing
 *  step), so the upload's own extension is a reliable signal. */
export function isVideoUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return /\.(mp4|webm|mov)$/i.test(path);
}

/**
 * Client-side image handling for the admin (no backend).
 * Reads an uploaded File, downscales it to a max dimension, and returns a
 * compressed JPEG data URL small enough to persist in localStorage.
 */
export async function fileToDataURL(file: File, maxDim = 1000, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image file");
  const raw = await readAsDataURL(file);
  return downscale(raw, maxDim, quality);
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Could not read file"));
    fr.readAsDataURL(file);
  });
}

function downscale(src: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(src); return; }
      // White matte so transparent logos read cleanly on white cards
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function isDataUrl(v: string): boolean {
  return typeof v === "string" && v.startsWith("data:");
}
