// Zod schemas for admin user-management endpoints (ApiAdminUser* in apiTypes.ts).
// createUserSchema covers POST /admin/users; updateUserSchema is the partial for
// PATCH /admin/users/:id. Passwords are validated here but hashed in the service.
import { z } from "zod";
// One shared rule (min length + common-password rejection) so this endpoint,
// self-service password change, and create-admin.ts cannot drift apart.
import { passwordSchema as password } from "@/lib/validation/password";

const role = z.enum(["ADMIN", "PROVIDER"]);
// A uuid (link to a company) or null (unlink). Optional = "leave unchanged".
const companyId = z.string().uuid().nullable();

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
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
