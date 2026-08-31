import type { ApiProject } from "@alassema/core";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "@alassema/mobile-shared";

export interface ProjectInput {
  title: string;
  img: string;
  description: string;
  year: string;
}

/** GET /provider/projects — every one of the company's own projects,
 *  any status (PENDING included — this is the provider's own view, not the
 *  public profile, which only ever shows APPROVED). */
export function fetchProjects(): Promise<ApiProject[]> {
  return apiGet<ApiProject[]>("/provider/projects");
}

/** POST /provider/projects — always created PENDING; an admin approves it
 *  (phase 9's moderation queue) before it appears on the public profile. */
export function createProject(input: ProjectInput): Promise<ApiProject> {
  return apiPost<ApiProject>("/provider/projects", input);
}

/** PUT /provider/projects/[id] — editing an already-approved project sends
 *  it back to PENDING (server-enforced; not a client-side rule to duplicate). */
export function updateProject(id: string, input: ProjectInput): Promise<ApiProject> {
  return apiPut<ApiProject>(`/provider/projects/${id}`, input);
}

export function deleteProject(id: string): Promise<void> {
  return apiDelete(`/provider/projects/${id}`);
}

/** POST /provider/upload (multipart) → { url }. Forced to the "projects"
 *  Storage bucket server-side regardless of anything sent here. */
export async function uploadProjectImage(file: { uri: string; name: string; type: string }): Promise<string> {
  const formData = new FormData();
  // React Native's FormData accepts this {uri,name,type} shape directly —
  // it is not a real Blob/File on native, but RN's fetch polyfill knows how
  // to read a local file uri from it. On web (this app also runs there for
  // the Playwright render sweep) `file.uri` is already a blob: URL from
  // expo-image-picker, which fetch can append the same way.
  formData.append("file", file as unknown as Blob);
  const { url } = await apiUpload<{ url: string }>("/provider/upload", formData);
  return url;
}
