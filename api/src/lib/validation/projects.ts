import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  img: z.string().url(),
  description: z
    .string()
    .default("")
    .transform(stripHtml)
    .pipe(z.string().max(2000)),
  year: z.string().trim().min(1).max(10),
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
