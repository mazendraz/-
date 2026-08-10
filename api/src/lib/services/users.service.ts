// Admin user-management (login accounts for ADMIN + PROVIDER). Mirrors the
// admin company/category services. Passwords are bcrypt-hashed via auth.ts and
// never returned. A safety guard prevents removing/demoting/deactivating the
// LAST active admin, so the site can't be locked out of its own dashboard.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import { hashPassword, verifyPasswordSafe } from "@/lib/auth";
import { isDerivedFromEmail } from "@/lib/validation/password";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/utils/errors";
import type { User } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation/users";
import type { ApiAdminUser, ApiPage, ApiUserRole } from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const userInclude = { company: { select: { name: true } } } as const;
type UserWithCompany = User & { company: { name: string } | null };

function serialize(u: UserWithCompany): ApiAdminUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    companyId: u.companyId,
    companyName: u.company?.name ?? null,
    isActive: u.isActive,
    createdAt: u.createdAt.getTime(),
  };
}

async function assertCompanyExists(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");
}

/** Throw if `excludingId` is the only remaining active admin. */
async function assertNotLastAdmin(excludingId: string): Promise<void> {
  const others = await prisma.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: excludingId } },
  });
  if (others === 0) {
    throw new ValidationError("Cannot remove, demote, or deactivate the last active admin");
  }
}

export interface AdminUserListQuery {
  page?: number;
  pageSize?: number;
  role?: ApiUserRole;
  search?: string; // matches name or email
}

function clampPaging(query: AdminUserListQuery): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

/** Admin: list accounts, filterable by role / search (name or email). */
export async function list(query: AdminUserListQuery): Promise<ApiPage<ApiAdminUser>> {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const { page, pageSize } = clampPaging(query);
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, pageSize } };
}

/** Admin: create an account. Email uniqueness is enforced by the DB (→ 409). */
export async function create(input: CreateUserInput): Promise<ApiAdminUser> {
  if (input.companyId) await assertCompanyExists(input.companyId);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      companyId: input.companyId,
    },
    include: userInclude,
  });
  return serialize(user);
}

/** Admin: partial update (rename, reset password, relink, change role/active). */
export async function update(id: string, input: UpdateUserInput): Promise<ApiAdminUser> {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw new NotFoundError("User");
  if (input.companyId) await assertCompanyExists(input.companyId);

  // Block any change that would strip the last active admin of access.
  const losingLastAdmin =
    existing.role === "ADMIN" &&
    ((input.role !== undefined && input.role !== "ADMIN") || input.isActive === false);
  if (losingLastAdmin) await assertNotLastAdmin(id);

  const data: Prisma.UserUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.companyId !== undefined) data.companyId = input.companyId; // null unlinks
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  const user = await prisma.user.update({
    where: { id },
    data,
    include: userInclude,
  });
  return serialize(user);
}

/**
 * Self-service password change — the caller changing their OWN password, proven
 * by supplying the current one.
 *
 * Why this exists: until the 2026-08-10 audit (finding M-07) the only way to set
 * a password was `PATCH /api/admin/users/:id`, which is admin-only. So an admin
 * necessarily knew every provider's password at the moment they set it, and the
 * provider had no way to change it afterwards — a password that is never a secret
 * between one person and the system is not really a credential.
 *
 * Takes the id rather than the AuthUser so it cannot be pointed at anyone else:
 * the route passes `user.id` from the session, never a body field.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, isActive: true },
  });
  // getAuthUser already rejected an inactive/absent user, so this is belt-and-
  // braces for a session that went stale mid-request.
  if (!existing || !existing.isActive) throw new UnauthorizedError();

  // verifyPasswordSafe, not verifyPassword: same constant-time-ish shape as login,
  // so this endpoint can't be used to distinguish states by timing either.
  if (!(await verifyPasswordSafe(currentPassword, existing.passwordHash))) {
    throw new UnauthorizedError("Your current password is incorrect");
  }

  // Checked here rather than in the schema because the schema has no email.
  if (isDerivedFromEmail(newPassword, existing.email)) {
    throw new ValidationError("Password is too weak", {
      newPassword: ["Don't build your password out of your email address."],
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

/** Admin: delete an account (guards the last active admin). */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw new NotFoundError("User");
  if (existing.role === "ADMIN") await assertNotLastAdmin(id);
  await prisma.user.delete({ where: { id } });
}
