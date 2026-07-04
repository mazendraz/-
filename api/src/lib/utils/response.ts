// Response helpers producing the exact contract shapes the frontend client expects
// (see app/src/lib/api.ts): lists → ApiPage<T>, single items → RAW object (no
// envelope), errors → flat ApiErrorBody. All return a Web `Response` via NextResponse.
import { NextResponse } from "next/server";
import type { ApiErrorBody, ApiPage } from "@/lib/apiTypes";
import type { ErrorCode } from "@/lib/utils/errors";

// Cache-Control for public, unauthenticated catalog reads. Short enough that an
// admin edit shows up quickly (≤ max-age browser / ≤ s-maxage shared-cache), long
// enough to absorb almost all repeat traffic. `stale-while-revalidate` lets a CDN
// serve a slightly-stale copy instantly while it refreshes in the background.
//   • max-age=30    → browsers (works today, no CDN needed)
//   • s-maxage=60   → shared caches / CDN (Cloudflare, Vercel edge) when added
// Only ever apply to responses that are identical for every caller (no auth/PII).
export const PUBLIC_READ_CACHE =
  "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

/** Single item (or array literal) returned RAW, no envelope. */
export function ok<T>(data: T, status = 200, headers?: HeadersInit): NextResponse<T> {
  return NextResponse.json(data, { status, headers });
}

/**
 * Public cacheable read — same wire shape as ok(), plus a Cache-Control that lets
 * browsers/CDNs cache it briefly. Use ONLY on unauthenticated endpoints whose
 * response is the same for everyone (catalog, settings, featured). Never on
 * admin/provider/lead endpoints (those stay uncached by default).
 */
export function okCached<T>(data: T): NextResponse<T> {
  return ok(data, 200, { "Cache-Control": PUBLIC_READ_CACHE });
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated list → ApiPage<T> = { data, meta: { total, page, pageSize } }. */
export function page<T>(
  data: T[],
  meta: PageMeta,
  status = 200,
): NextResponse<ApiPage<T>> {
  return NextResponse.json({ data, meta }, { status });
}

/** Error → flat ApiErrorBody + matching HTTP status. */
export function fail(
  code: ErrorCode,
  message: string,
  status: number,
  details?: Record<string, string[]>,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = details
    ? { code, message, details }
    : { code, message };
  return NextResponse.json(body, { status });
}
