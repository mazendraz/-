import { z } from "zod";
import { sanitizedOptionalText } from "@/lib/utils/sanitize";

/**
 * Review submission for the account-owned path (POST
 * /customer/leads/[id]/review). Same rating/text rules as the pre-account
 * submitReviewSchema — no ref/token here, since ownership is the signed-in
 * account itself, verified server-side against Lead.customerId.
 *
 * `.optional()` wraps sanitizedOptionalText here deliberately — despite its
 * name, that helper only accepts a PRESENT string (blank is fine, absent is
 * not: it has no `.optional()` of its own). Every existing caller sends the
 * key with an empty string, so this never surfaced before. A mobile client
 * omitting a field it has nothing to say is the more natural shape for new
 * API surface, so this route accepts both rather than propagating a trap
 * into a second file.
 */
export const customerReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: sanitizedOptionalText(2000).optional(),
});
