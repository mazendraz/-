import { z } from "zod";
import { customerPasswordSchema, passwordSchema } from "@/lib/validation/password";

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

// Customer sign-in through Google. The ID token is the ENTIRE input — no email,
// no name, no id. Anything the client could send alongside it would be a claim we
// would then have to decide whether to trust; taking only the token means every
// field about this person comes from Google's signature instead.
//
// The 4096 ceiling is a sanity bound on a JWT, not a spec limit: a Google ID
// token runs ~1KB, and the value's real validation is the signature check.
export const googleSignInSchema = z.object({
  idToken: z.string().trim().min(1, "Missing Google token.").max(4096),
});

export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

// ── Apple sign-in ───────────────────────────────────────────────────────────
// Three fields where Google needs one, because Apple hands the client things it
// never puts in the token:
//
//   identityToken — the JWT. Same 4096 sanity bound as Google, same reason: the
//                   real validation is the signature, not the length.
//   rawNonce      — the un-hashed nonce the client generated before calling
//                   Apple. appleIdentity.service requires it whenever the token
//                   carries a nonce claim, which binds this token to this
//                   request. Not a secret and not stored.
//   fullName      — present ONLY on a genuine first authorization; Apple never
//                   sends it again, and it is not in the token at all, so it
//                   cannot be verified. Untrusted decoration for the profile,
//                   never read by an authorization decision. Capped at the
//                   column width rather than rejected when long, because a long
//                   name is a bad label, not an attack.
//   authorizationCode
//                 — Apple's one-time code, handed to the client alongside the
//                   identity token. NOT used to authenticate this request: the
//                   identity token alone decides who is signing in. It is traded
//                   server-side for a refresh token whose only purpose is
//                   revoking this app's access when the account is deleted
//                   (guideline 5.1.1(v) — see appleServerAuth.service). Optional
//                   so a client that omits it still signs in normally, just
//                   without a revocable token on file.
export const appleSignInSchema = z.object({
  identityToken: z.string().trim().min(1, "Missing Apple token.").max(4096),
  rawNonce: z.string().trim().min(1).max(256).optional(),
  fullName: z.string().trim().max(80).optional(),
  authorizationCode: z.string().trim().min(1).max(1024).optional(),
});

export type AppleSignInInput = z.infer<typeof appleSignInSchema>;

// ── Customer password auth ──────────────────────────────────────────────────

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email(),
  // Lighter than staff's passwordSchema — see customerPasswordSchema's own
  // comment for why, and customerPassword.service.ts's isDerivedFromEmail
  // check for the one rule beyond length that still applies here.
  password: customerPasswordSchema,
});

export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Not passwordSchema — same reasoning as loginSchema above: this password is
  // being CHECKED, not set. Enforcing strength here would reject an older
  // password before the compare and leak the policy to anyone with a login form.
  password: z.string().min(1),
});

export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(256),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1).max(256),
  // The new password being SET — customerPasswordSchema, unlike loginSchema's
  // plain string above, applies the same (customer) strength bar registration
  // uses. This route is customer-only (see auth/customer/reset-password) —
  // staff password resets go through a different flow entirely.
  password: customerPasswordSchema,
});

/**
 * Optional device descriptor sent by a MOBILE client at sign-in.
 *
 * Its presence is the signal that this client wants a long-lived session — the
 * website omits it and gets only the httpOnly cookie, which is strictly safer
 * for a browser than a refresh token in localStorage.
 *
 * The fields are display labels for a "your devices" screen. Untrusted, never
 * read by any authorization decision, and truncated before storage.
 */
export const deviceSchema = z.object({
  deviceName: z.string().trim().max(80).optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1).max(256),
});

// Attaching past requests to the signed-in account. The batch is capped because
// the legitimate caller is a device handing over its own local history — a few
// dozen at the very outside — while an uncapped array is a way to test a
// thousand reference numbers in one request that only counts as one against the
// rate limit.
export const claimLeadsSchema = z.object({
  claims: z
    .array(
      // No `phone`: the legacy phone-tail fallback is not accepted in a BATCH,
      // for the same reason /api/chat/summaries does not take it — see
      // LeadClaim in middleware/customerGuard.ts.
      z.object({
        refNumber: z.string().trim().min(1).max(64),
        token: z.string().trim().max(128).optional(),
      }),
    )
    .min(1)
    .max(50),
});
