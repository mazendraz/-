// Company project management + the public homepage featured showcase.
// Moderation: provider-submitted projects are PENDING until an admin APPROVES
// them; only APPROVED projects appear publicly.
import { prisma } from "@/lib/prisma";
import { CompanyStatus, ProjectStatus } from "@/generated/prisma/enums";
import { serializeProjectAdmin } from "@/lib/utils/serialize";
import { NotFoundError } from "@/lib/utils/errors";
import { notifyAdmins as pushAdmins } from "@/lib/services/push.service";
import { notifyAdminsProjectSubmitted } from "@/lib/services/notifications.service";
import type { ApiFeaturedProject, ApiProject, ApiProjectStatus } from "@/lib/apiTypes";

/**
 * Alert admins that a project needs review — Web Push (instant device alert) plus
 * email. Fire-and-forget and fail-open: never blocks or fails the submission.
 */
async function notifyAdminsPendingProject(project: ApiProject, companyId: string): Promise<void> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name ?? "A provider";

    void pushAdmins({
      title: "New project for review",
      body: `${companyName}: “${project.title}” needs approval`,
      url: "/admin",
      tag: `project-${project.id}`,
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { email: true },
    });
    void notifyAdminsProjectSubmitted({
      projectTitle: project.title,
      companyName,
      adminEmails: admins.map((a) => a.email),
    });
  } catch (err) {
    console.error("[notify] pending-project admin alert failed:", err);
  }
}

const MAX_FEATURED = 6;

/**
 * Public: curated projects for the homepage showcase — featured + APPROVED
 * projects of ACTIVE companies only, flattened with company name + category.
 */
export async function listFeatured(): Promise<ApiFeaturedProject[]> {
  const rows = await prisma.project.findMany({
    where: { featured: true, status: ProjectStatus.APPROVED, company: { status: CompanyStatus.ACTIVE } },
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

/** Admin: add a project to a company — published (APPROVED) immediately. */
export async function add(
  companyId: string,
  input: ProjectInput,
): Promise<ApiProject> {
  return createForCompany(companyId, input, ProjectStatus.APPROVED);
}

/**
 * Create a project for a company at the given moderation status.
 * Providers call this via the provider route with PENDING (the default).
 */
export async function createForCompany(
  companyId: string,
  input: ProjectInput,
  status: ProjectStatus = ProjectStatus.PENDING,
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
      status,
    },
  });
  const serialized = serializeProjectAdmin(project);
  // A provider submission lands as PENDING — alert admins it needs review.
  if (status === ProjectStatus.PENDING) void notifyAdminsPendingProject(serialized, companyId);
  return serialized;
}

/**
 * Provider: update one of their own projects. Editing sends it back to PENDING so
 * changed content can't go live without re-approval. Scoped to companyId.
 */
export async function updateForCompany(
  companyId: string,
  projectId: string,
  input: ProjectInput,
): Promise<ApiProject> {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Project");
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      title: input.title,
      img: input.img,
      description: input.description,
      year: input.year,
      status: ProjectStatus.PENDING,
    },
  });
  const serialized = serializeProjectAdmin(project);
  // The edit re-enters the moderation queue — alert admins it needs review again.
  void notifyAdminsPendingProject(serialized, companyId);
  return serialized;
}

/** Provider/admin: all projects for a company (any status), newest first. */
export async function listByCompany(companyId: string): Promise<ApiProject[]> {
  const rows = await prisma.project.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeProjectAdmin);
}

export interface ModerationProject extends ApiProject {
  companyId: string;
  companyName: string;
  companySlug: string;
}

/** Admin: projects for the moderation queue (defaults to PENDING), with company info. */
export async function listForModeration(
  status: ProjectStatus = ProjectStatus.PENDING,
): Promise<ModerationProject[]> {
  const rows = await prisma.project.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((r) => ({
    ...serializeProjectAdmin(r),
    companyId: r.company.id,
    companyName: r.company.name,
    companySlug: r.company.slug,
  }));
}

/** Admin: set a project's moderation status (approve / reject). */
export async function setStatus(
  projectId: string,
  status: ApiProjectStatus,
): Promise<ApiProject> {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Project");
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { status: status as ProjectStatus },
  });
  return serializeProjectAdmin(project);
}

/** Admin or owning provider: remove a project. Scoped to companyId. */
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

/** Admin: remove any project by id (moderation override, not company-scoped). */
export async function removeById(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new NotFoundError("Project");
  await prisma.project.delete({ where: { id: projectId } });
}
