// Role gating + ownership checks. Wrap an authed handler to require a role:
//
//   withErrors(withAuth(withRole("ADMIN", async (req, ctx, user) => { ... })))
import { ForbiddenError } from "@/lib/utils/errors";
import type { UserRole } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/auth";
import type { AuthedHandler } from "@/lib/middleware/withAuth";

/** Require a specific role; 403 otherwise. */
export function withRole<Ctx>(
  role: UserRole,
  handler: AuthedHandler<Ctx>,
): AuthedHandler<Ctx> {
  return (request, context, user) => {
    if (user.role !== role) {
      throw new ForbiddenError(`Requires ${role} role`);
    }
    return handler(request, context, user);
  };
}

/**
 * Ownership guard for provider-scoped resources. Admins bypass; a provider may
 * only act on resources belonging to their own company. Throws 403 otherwise.
 */
export function assertOwnership(user: AuthUser, resourceCompanyId: string): void {
  if (user.role === "ADMIN") return;
  if (!user.companyId || user.companyId !== resourceCompanyId) {
    throw new ForbiddenError("You do not have access to this resource");
  }
}
