// Company project management (admin only).
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/utils/serialize";
import { NotFoundError } from "@/lib/utils/errors";
import type { ApiProject } from "@/lib/apiTypes";

export interface ProjectInput {
  title: string;
  img: string;
  description: string;
  year: string;
  sortOrder?: number;
}

/** Admin: add a project to a company. */
export async function add(
  companyId: string,
  input: ProjectInput,
): Promise<ApiProject> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new NotFoundError("Company");

  // Default sortOrder to the end of the list.
  const sortOrder =
    input.sortOrder ?? (await prisma.project.count({ where: { companyId } }));

  const project = await prisma.project.create({
    data: {
      companyId,
      title: input.title,
      img: input.img,
      description: input.description,
      year: input.year,
      sortOrder,
    },
  });
  return serializeProject(project);
}

/** Admin: remove a project from a company. */
export async function remove(
  companyId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true },
  });
  if (!project) throw new NotFoundError("Project");
  await prisma.project.delete({ where: { id: projectId } });
}
