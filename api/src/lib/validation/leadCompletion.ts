// Zod schemas for the service-completion + final-price-verification endpoints.
// completeLeadSchema validates POST /provider/leads/:id/complete;
// verifyLeadSchema validates POST /leads/verify.
import { z } from "zod";
import { sanitizedText, sanitizedOptionalText } from "@/lib/utils/sanitize";
import { moneyEgp } from "@/lib/validation/shared";

const additionalWork = z.object({
  description: sanitizedText(1, 2000),
  amount: moneyEgp,
});

// Provider: mark a lead completed with the final amount (+ optional additional
// work). additionalWork is null, not omitted, when there was none — matches the
// mockup's explicit Yes/No choice rather than treating "no additional work" as
// "the provider forgot to say".
export const completeLeadSchema = z.object({
  providerAmount: moneyEgp,
  additionalWork: additionalWork.nullable(),
  // .optional(): the frontend omits the key entirely (not "") when there's
  // nothing to send, so sanitizedOptionalText alone (which still requires the
  // key present) would 400 on the common no-notes case.
  notes: sanitizedOptionalText(2000).optional(),
  // Supabase Storage URLs from POST /provider/upload ("projects" bucket) — not
  // re-validated as URLs here, upload is the only thing that can produce them.
  attachments: z.array(z.string().trim().min(1).max(2000)).max(5).optional(),
});

export type CompleteLeadInput = z.infer<typeof completeLeadSchema>;

// Public: the client confirms or disputes the provider's reported amount.
// Same ref + (token | phone) trust model as trackLeadSchema / submitReviewSchema
// (validation/leads.ts, validation/reviews.ts) — at least one secret required.
// clientAmount is required exactly when decision is "discrepancy": a confirmed
// amount is always the provider's own reported total, never client-supplied.
export const verifyLeadSchema = z
  .object({
    ref: z.string().trim().min(1),
    token: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    decision: z.enum(["confirmed", "discrepancy"]),
    // Bounded, unlike before: this value is CLIENT-supplied on a dispute and
    // flows straight into the commission ledger (finance.recognizeCommission),
    // so an unbounded integer let a customer write an arbitrary figure into
    // Al Asima's revenue numbers — or overflow int4 and 500 the endpoint.
    clientAmount: moneyEgp.optional(),
    // .optional() — same reason as completeLeadSchema.notes above.
    note: sanitizedOptionalText(2000).optional(),
  })
  .refine((o) => Boolean(o.token) || Boolean(o.phone), {
    message: "A tracking token or phone number is required",
  })
  .refine((o) => o.decision !== "discrepancy" || o.clientAmount != null, {
    message: "clientAmount is required when reporting a different amount",
    path: ["clientAmount"],
  });

export type VerifyLeadInput = z.infer<typeof verifyLeadSchema>;

// Account-owned counterpart of verifyLeadSchema — POST /customer/leads/:id/verify.
// No ref/token/phone: withCustomerAuth's session plus the route's own
// Lead.customerId === customer.id check IS the credential (see that route's
// comment on why the token-gated path is structurally unreachable from an
// account-owned request — GET /customer/leads never returns trackingToken).
export const verifyOwnedLeadSchema = z
  .object({
    decision: z.enum(["confirmed", "discrepancy"]),
    // Bounded for the same reason as verifyLeadSchema.clientAmount above.
    clientAmount: moneyEgp.optional(),
    note: sanitizedOptionalText(2000).optional(),
  })
  .refine((o) => o.decision !== "discrepancy" || o.clientAmount != null, {
    message: "clientAmount is required when reporting a different amount",
    path: ["clientAmount"],
  });

export type VerifyOwnedLeadInput = z.infer<typeof verifyOwnedLeadSchema>;
