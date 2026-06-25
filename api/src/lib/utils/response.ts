// Response helpers producing the exact contract shapes the frontend client expects
// (see app/src/lib/api.ts): lists → ApiPage<T>, single items → RAW object (no
// envelope), errors → flat ApiErrorBody. All return a Web `Response` via NextResponse.
import { NextResponse } from "next/server";
import type { ApiErrorBody, ApiPage } from "@/lib/apiTypes";
import type { ErrorCode } from "@/lib/utils/errors";

/** Single item (or array literal) returned RAW, no envelope. */
export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
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
