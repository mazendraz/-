// Company project management (admin only) + the public homepage featured showcase.
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { serializeProject } from "@/lib/utils/serialize";
import { NotFoundError } from "@/lib/utils/errors";
import type { ApiFeaturedProject, ApiProject } from "@/lib/apiTypes";

const MAX_FEATURED = 6;

/**
 * Public: curated projects for the homepage showcase — featured projects of
 * ACTIVE companies only, flattened with the owning company name + category label.
 */
export async function listFeatured(): Promise<ApiFeaturedProject[]> {
  const rows = await prisma.project.findMany({
    where: { featured: true, company: { status: CompanyStatus.ACTIVE } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: MAX_FEATURED,
    select: {
      title: true,
      img: true,
      company: { select: { name: true, category: { select: { label: true } } } },
    },
  });
  return rows.map((r) => ({
    title: r.title,
    img: r.img,
    company: r.company.name,
    category: r.company.category.label,
  }));
}

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
