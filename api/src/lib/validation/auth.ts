import { z } from "zod";
import { passwordSchema } from "@/lib/validation/password";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Deliberately NOT passwordSchema. This is the password being CHECKED, not one
  // being set — applying the strength rule here would reject an existing weak
  // password before it ever reached the compare, which both breaks login for
  // anyone predating the rule and tells an attacker the policy for free.
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
  })
  .refine((o) => o.currentPassword !== o.newPassword, {
    message: "The new password must be different from the current one.",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
