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

// Provider edit of their own project — same fields as create (sortOrder ignored).
export const updateProjectSchema = createProjectSchema;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// Admin moderation: set a project's status (approve / reject / reset to pending).
export const projectStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;
