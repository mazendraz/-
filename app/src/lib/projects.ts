// Portfolio project management API calls.
//   Provider: build/edit/delete their OWN projects (submitted as PENDING).
//   Admin:    moderation queue + approve / reject / delete.
// Public display (company profile + homepage) only ever shows APPROVED projects;
// that filtering happens server-side.
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./api";
import type { Project, ProjectStatus } from "./data";

export interface ProjectInput {
  title: string;
  img: string;
  description: string;
  year: string;
}

export interface ModerationProject extends Project {
  companyId: string;
  companyName: string;
  companySlug: string;
}

// ── Provider (own company) ──────────────────────────────────────────────────
export function listMyProjects(): Promise<Project[]> {
  return apiGet<Project[]>("/provider/projects");
}
export function createMyProject(input: ProjectInput): Promise<Project> {
  return apiPost<Project>("/provider/projects", input);
}
export function updateMyProject(id: string, input: ProjectInput): Promise<Project> {
  return apiPut<Project>(`/provider/projects/${id}`, input);
}
export function deleteMyProject(id: string): Promise<void> {
  return apiDelete(`/provider/projects/${id}`);
}

// ── Admin moderation ────────────────────────────────────────────────────────
export interface ModerationProjectPage {
  data: ModerationProject[];
  meta: { total: number; page: number; pageSize: number };
}

/**
 * One page of the project moderation queue.
 *
 * Was an unbounded array: every pending project with its company joined, in a
 * single response. A PENDING project is invisible on the public profile and
 * surfaced nowhere else, so the queue was both the only view of the backlog and
 * the thing that got heavier with every submission nobody had reached yet.
 */
export function listModerationProjects(
  status: ProjectStatus = "PENDING",
  page = 1,
  pageSize = 50,
): Promise<ModerationProjectPage> {
  const sp = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  return apiGet<ModerationProjectPage>(`/admin/projects?${sp.toString()}`);
}
export function setProjectStatus(id: string, status: ProjectStatus): Promise<Project> {
  return apiPatch<Project>(`/admin/projects/${id}`, { status });
}
export function deleteProjectAdmin(id: string): Promise<void> {
  return apiDelete(`/admin/projects/${id}`);
}
