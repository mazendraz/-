// Zod schemas for admin user-management endpoints (ApiAdminUser* in apiTypes.ts).
// createUserSchema covers POST /admin/users; updateUserSchema is the partial for
// PATCH /admin/users/:id. Passwords are validated here but hashed in the service.
import { z } from "zod";

// Min 8 chars matches create-admin.ts and bcrypt's practical input ceiling (72).
const password = z.string().min(8).max(72);
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
