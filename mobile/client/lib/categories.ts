import type { ApiCategory } from "@alassema/core";
import { apiGet } from "./api";

/** Active categories with live company counts — for Home and Services. */
export function fetchCategories(): Promise<ApiCategory[]> {
  return apiGet<ApiCategory[]>("/categories");
}
