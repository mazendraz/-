import type { ApiAdminUser, ApiPage, ApiUserRole } from "@alassema/core";
import { apiDelete, apiGet, apiPatch, apiPost } from "@alassema/mobile-shared";

export interface AdminUserListQuery {
  page?: number;
  pageSize?: number;
  role?: ApiUserRole;
  search?: string;
}

export function fetchUsers(query: AdminUserListQuery = {}): Promise<ApiPage<ApiAdminUser>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.role) params.set("role", query.role);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiGet<ApiPage<ApiAdminUser>>(`/admin/users${qs ? `?${qs}` : ""}`);
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: ApiUserRole;
  companyId?: string | null;
}

/** POST /admin/users — defaults to PROVIDER role. 409 on a duplicate email. */
export function createUser(input: CreateUserInput): Promise<ApiAdminUser> {
  return apiPost<ApiAdminUser>("/admin/users", input);
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: ApiUserRole;
  companyId?: string | null;
  isActive?: boolean;
  desktopPermissions?: string[];
}

/** PATCH /admin/users/[id] — a genuine partial update (hand-written schema,
 *  no Zod `.default()` anywhere — unlike phase 10's company/category PUTs,
 *  omitting a field here really does leave it unchanged). Blocked
 *  server-side (409) if it would strip the last active admin's access;
 *  blocked client-side before that if the caller is deactivating/demoting
 *  themselves (the server has no such guard — see phase-11's own risk
 *  note). */
export function updateUser(id: string, input: UpdateUserInput): Promise<ApiAdminUser> {
  return apiPatch<ApiAdminUser>(`/admin/users/${id}`, input);
}

/** DELETE — same last-active-admin guard as updateUser. */
export function deleteUser(id: string): Promise<void> {
  return apiDelete<void>(`/admin/users/${id}`);
}
