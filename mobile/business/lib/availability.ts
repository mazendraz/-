import type { ApiAvailabilityPayload } from "@alassema/core";
import { apiDelete, apiGet, apiPatch, apiPost } from "@alassema/mobile-shared";

/** Not part of @alassema/core — api/src/lib/services/busyWindows.service.ts
 *  declares this locally, so it mirrors the shape here rather than reaching
 *  into a server-internal module. */
export interface ApiBusyWindow {
  id: string;
  companyId: string;
  startsAt: number;
  endsAt: number | null;
  note: string | null;
  createdByAdmin: boolean;
  createdAt: number;
}

export interface BusyWindowInput {
  startsAt: number;
  endsAt?: number | null;
  note?: string | null;
}

/** PATCH /provider/availability — the manual open/closed toggle. Immediate,
 *  no change-request gate (unlike most profile fields — providers already
 *  control this directly; see EDITABLE_FIELDS's own comment in
 *  changeRequests.service.ts on why). Current state is read from
 *  GET /provider/profile's `company.busy`/`busyUntil`/`busyNote`, not a
 *  separate GET here — there isn't one. */
export function setAvailability(payload: ApiAvailabilityPayload): Promise<void> {
  return apiPatch("/provider/availability", payload);
}

/** GET /provider/busy-windows — running + upcoming scheduled closures. */
export function fetchBusyWindows(): Promise<ApiBusyWindow[]> {
  return apiGet<ApiBusyWindow[]>("/provider/busy-windows");
}

/** POST /provider/busy-windows — an open-ended window (no `endsAt`) closes
 *  any existing open-ended one first, server-side; two would overlap every
 *  future window forever. */
export function createBusyWindow(input: BusyWindowInput): Promise<ApiBusyWindow> {
  return apiPost<ApiBusyWindow>("/provider/busy-windows", input);
}

export function deleteBusyWindow(id: string): Promise<void> {
  return apiDelete(`/provider/busy-windows/${id}`);
}
