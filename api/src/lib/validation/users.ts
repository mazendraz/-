// Zod schemas for admin user-management endpoints (ApiAdminUser* in apiTypes.ts).
// createUserSchema covers POST /admin/users; updateUserSchema is the partial for
// PATCH /admin/users/:id. Passwords are validated here but hashed in the service.
import { z } from "zod";
// One shared rule (min length + common-password rejection) so this endpoint,
// self-service password change, and create-admin.ts cannot drift apart.
import { passwordSchema as password } from "@/lib/validation/password";
import { DESKTOP_PERMISSIONS } from "@/lib/middleware/withPermission";

const role = z.enum(["ADMIN", "PROVIDER"]);
// A uuid (link to a company) or null (unlink). Optional = "leave unchanged".
const companyId = z.string().uuid().nullable();
// Business Control Center access grants — see withPermission.ts. Validated
// against the closed set here (not a DB enum, so adding a module later needs
// no migration, but a typo in a grant must still 400, not silently no-op).
const desktopPermissions = z.array(z.enum(DESKTOP_PERMISSIONS)).max(DESKTOP_PERMISSIONS.length);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password,
  role: role.default("PROVIDER"),
  companyId: companyId.optional().default(null),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    password: password.optional(),
    role: role.optional(),
    companyId: companyId.optional(),
    isActive: z.boolean().optional(),
    desktopPermissions: desktopPermissions.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
