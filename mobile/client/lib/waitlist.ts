import type { ApiWaitlistEntry } from "@alassema/core";
import { apiGet } from "./api";

/** This account's own waitlist joins — merged into the Requests tab, same
 *  idea as the website's MyRequests.tsx combining leads and waitlist entries. */
export function fetchMyWaitlistEntries(): Promise<ApiWaitlistEntry[]> {
  return apiGet<ApiWaitlistEntry[]>("/customer/waitlist");
}
