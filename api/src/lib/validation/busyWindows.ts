// Zod schema for scheduled busy windows.
//
// Only the SHAPE is checked here. The rules that need to see other rows —
// overlap, and "at most one open-ended window" — live in busyWindows.service,
// because they are queries, not field validation.
import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";

export const busyWindowSchema = z.object({
  /** Epoch ms. */
  startsAt: z.number().int().positive(),
  /** Epoch ms, or null for an open-ended period. */
  endsAt: z.number().int().positive().nullish(),
  note: z.string().transform(stripHtml).pipe(z.string().max(200)).nullish(),
});

export type BusyWindowInput = z.infer<typeof busyWindowSchema>;
