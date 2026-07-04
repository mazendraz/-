// Admin user-management client (login accounts for ADMIN + PROVIDER). Unlike the
// catalog/leads, accounts exist ONLY on the server — there is no localStorage
// demo analog — so every call here requires a live API + admin session. The
// Team tab in AdminDashboard guards on canManageUsers() before rendering.
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

export type Role = "ADMIN" | "PROVIDER";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  isActive: boolean;
  createdAt: number; // epoch ms
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  companyId?: string | null;
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: Role;
  companyId?: string | null;
  isActive?: boolean;
}

/** Accounts can only be managed by an admin against the live API. */
export function canManageUsers(): boolean {
  return isApiConfigured() && isAuthenticated() && getCurrentUser()?.role === "ADMIN";
}

export async function listUsers(): Promise<AdminUser[]> {
  const res = await apiGet<{ data: AdminUser[] }>("/admin/users?pageSize=200");
  return res.data;
}

export function createUser(input: CreateUserInput): Promise<AdminUser> {
  return apiPost<AdminUser>("/admin/users", input);
}

export function updateUser(id: string, input: UpdateUserInput): Promise<AdminUser> {
  return apiPatch<AdminUser>(`/admin/users/${id}`, input);
}

export function deleteUser(id: string): Promise<void> {
  return apiDelete(`/admin/users/${id}`);
}

export type UsersStatus = "idle" | "loading" | "ready" | "error";

/** Reactive user list with load status. `reload` re-fetches after a write. */
export function useAdminUsers(): {
  users: AdminUser[];
  status: UsersStatus;
  reload: () => Promise<void>;
} {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<UsersStatus>("idle");

  const reload = useCallback(async () => {
    if (!canManageUsers()) {
      setStatus("idle");
      return;
    }
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      setUsers(await listUsers());
      setStatus("ready");
    } catch (err) {
      console.error("Load users failed:", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { users, status, reload };
}
