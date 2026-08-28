import { z } from "zod";

// PATCH /customer/notification-preferences body. Both fields optional (a
// partial update), same shape as updateAdminNotificationSettingsSchema —
// but a customer flips these from their own settings screen, not an admin
// panel, so it's its own schema rather than reused.
export const updateCustomerNotificationPreferencesSchema = z
  .object({
    marketingPushEnabled: z.boolean(),
    marketingEmailEnabled: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" });

export type UpdateCustomerNotificationPreferencesInput = z.infer<
  typeof updateCustomerNotificationPreferencesSchema
>;

// PATCH /customer/notifications/:id and POST /customer/notifications/read-all
// have no body — both act on path/auth alone — so no schema needed for those.
