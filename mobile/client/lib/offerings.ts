import type { ApiOffering } from "@alassema/core";

/** Split into services and products — the public profile lists them
 *  separately. Mobile counterpart of the website's offerings.ts splitByKind. */
export function splitByKind(offerings: ApiOffering[]): { services: ApiOffering[]; products: ApiOffering[] } {
  return {
    services: offerings.filter((o) => o.kind === "SERVICE"),
    products: offerings.filter((o) => o.kind === "PRODUCT"),
  };
}
