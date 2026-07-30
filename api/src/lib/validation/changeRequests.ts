// Zod schemas for the change-request endpoints.
//
// NOTE: these validate the SHAPE of a request. They deliberately do NOT decide
// which fields a provider may edit — that is EDITABLE_FIELDS in
// changeRequests.service.ts, enforced at both submit and approve time. Keeping
// the allowlist in one place means there is exactly one thing to audit.
import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";

const CHANGE_ENTITIES = ["COMPANY", "OFFERING", "OFFERING_TIER", "BUNDLE_RULE"] as const;
const CHANGE_OPERATIONS = ["PUBLISH", "UPDATE", "DELETE"] as const;
const CHANGE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

const note = z.string().transform(stripHtml).pipe(z.string().max(1000));

export const submitChangeRequestSchema = z.object({
  entity: z.enum(CHANGE_ENTITIES),
  entityId: z.string().min(1).max(64),
  operation: z.enum(CHANGE_OPERATIONS).optional(),
  // Values stay `unknown` here: they are field values for an arbitrary entity, so
  // per-field typing belongs to the entity's own schema. What matters at this
  // boundary is that it is a flat object and not, say, an array or null.
  changes: z.record(z.string(), z.unknown()).refine(
    (o) => Object.keys(o).length > 0,
    "At least one change is required",
  ),
  note: note.optional(),
});

export type SubmitChangeRequestInput = z.infer<typeof submitChangeRequestSchema>;

export const reviewChangeRequestSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    reviewNote: note.optional(),
    /** Partial approval — apply only these fields. Omit to apply all of them. */
    fields: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((o) => !(o.action === "reject" && o.fields?.length), {
    message: "`fields` only applies to approvals",
    path: ["fields"],
  });

export type ReviewChangeRequestInput = z.infer<typeof reviewChangeRequestSchema>;

export const changeRequestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  entity: z.enum(CHANGE_ENTITIES).optional(),
  status: z.enum(CHANGE_STATUSES).optional(),
  companyId: z.string().min(1).max(64).optional(),
});
