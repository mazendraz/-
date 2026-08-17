import { apiGet } from "./api";

export interface FeaturedProject {
  title: string;
  img: string;
  company: string;
  category: string;
}

/** Homepage "Featured Projects" showcase — admin-curated, ACTIVE companies only. */
export function fetchFeaturedProjects(): Promise<FeaturedProject[]> {
  return apiGet<FeaturedProject[]>("/projects/featured");
}
