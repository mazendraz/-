import { apiUpload } from "@alassema/mobile-shared";

/** POST /admin/upload (multipart: file, bucket) → { url }. `bucket` must be
 *  one of "logos" | "covers" | "gallery" | "projects" (upload.service.ts's
 *  UPLOAD_BUCKETS) — the server 400s on anything else. Video is accepted
 *  only in "gallery". */
export type UploadBucket = "logos" | "covers" | "gallery" | "projects";

export async function uploadAdminImage(
  bucket: UploadBucket,
  file: { uri: string; name: string; type: string },
): Promise<string> {
  const formData = new FormData();
  // Same {uri,name,type} shape RN's fetch polyfill (native) and expo-image-
  // picker's blob: URL (web) both accept — see lib/projects.ts's identical
  // uploadProjectImage for the full explanation.
  formData.append("file", file as unknown as Blob);
  formData.append("bucket", bucket);
  const { url } = await apiUpload<{ url: string }>("/admin/upload", formData);
  return url;
}
