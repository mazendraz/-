import { apiUpload, isApiConfigured } from "./api";

/** Supabase Storage buckets the backend accepts (see admin/upload). */
export type UploadBucket = "logos" | "covers" | "gallery" | "projects";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — mirrors the backend limit

/**
 * Upload an image and return a URL to persist in the catalog.
 *  • API mode: POST the file to /admin/upload — the server resizes to WebP and
 *    stores it in Supabase, returning a public URL. No base64 in localStorage.
 *  • Demo mode (no API): fall back to a downscaled, compressed data URL so the
 *    offline admin still works (kept small to respect the localStorage quota).
 */
export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  maxDim = 1000,
  // Upload endpoint. Admin UIs use the default; the provider dashboard passes
  // "/provider/upload" (admin/upload is admin-only and would 403 for providers).
  endpoint: "/admin/upload" | "/provider/upload" = "/admin/upload",
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");

  if (isApiConfigured()) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image must be 5MB or smaller.");
    const form = new FormData();
    form.append("file", file);
    form.append("bucket", bucket);
    const { url } = await apiUpload<{ url: string }>(endpoint, form);
    return url;
  }

  return fileToDataURL(file, maxDim);
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
