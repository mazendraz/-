import { apiUpload } from "@alassema/mobile-shared";
import type { UploadBucket } from "./adminUpload";

/**
 * POST /provider/upload (multipart: file, bucket) → { url } — the provider
 * twin of lib/adminUpload.ts's uploadAdminImage.
 *
 * Two endpoints rather than one because /admin/upload 403s for a provider
 * account; the bucket allowlist on the provider side is the same four names
 * (route.ts PROVIDER_BUCKETS), and video is still accepted only in "gallery".
 */
export async function uploadProviderMedia(
  bucket: UploadBucket,
  file: { uri: string; name: string; type: string },
): Promise<string> {
  const formData = new FormData();
  // The {uri,name,type} shape RN's fetch polyfill reads directly on native,
  // and a blob: URL from expo-image-picker on web — see lib/projects.ts's
  // uploadProjectImage for the full explanation.
  formData.append("file", file as unknown as Blob);
  formData.append("bucket", bucket);
  const { url } = await apiUpload<{ url: string }>("/provider/upload", formData);
  return url;
}
