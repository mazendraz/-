-- Session revocation floor.
--
-- The access token in this system is a stateless JWT: fast to verify, and
-- impossible to recall once signed. `isActive` was the only lever that could end
-- a session before its own expiry, and it is all-or-nothing — it disables the
-- whole account. Everything in between was unenforceable:
--
--   * "Sign out everywhere" (POST /customer/sessions) revoked CustomerSession
--     rows, i.e. REFRESH tokens. Every access token already in circulation kept
--     working.
--   * A customer password reset revoked the same rows, with the same gap — and a
--     password reset is precisely the moment someone is saying "assume this
--     account is compromised".
--   * PATCH /api/auth/password (staff) revoked nothing at all, by documented
--     design, because there was no denylist to write to.
--
-- These columns are that denylist, in its cheapest possible form: one timestamp
-- per account. A token whose `iat` predates it is refused on the very next
-- request, the same way an inactive account already is — no extra query, since
-- both getAuthUser and getCustomerUser already re-read the row per request.
--
-- Deliberately NULLABLE with no default. NULL means "no floor", which is the
-- state every existing row starts in, so applying this migration signs nobody
-- out and invalidates no token that is currently working. The floor only ever
-- appears on an account where someone has since asked for it.
--
-- Single-device revocation is NOT handled here — bumping this would sign out
-- every device, not the one being removed. That case is covered by the `sid`
-- claim carried on tokens minted for a device session (see lib/auth.ts).

-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "tokensValidFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokensValidFrom" TIMESTAMP(3);
