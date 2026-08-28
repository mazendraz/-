// Central error wrapper for route handlers. Catches AppError, ZodError, and known
// Prisma errors and serializes them to a flat ApiErrorBody. Unknown errors become a
// generic 500 INTERNAL_ERROR — internal details are never leaked to the client.
import { ZodError } from "zod";
import { AppError } from "@/lib/utils/errors";
import { fail } from "@/lib/utils/response";
import { captureException } from "@/lib/observability/report";

// Next.js route handlers: (request, context) => Response | Promise<Response>.
type RouteHandler<Args extends unknown[]> = (
  ...args: Args
) => Response | Promise<Response>;

/** Flatten a ZodError into ApiErrorBody.details (Record<field, messages[]>). */
function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Query-string parameters that must never leave this process in a log line or a
 * Sentry event.
 *
 * `token` is the one that matters: /api/leads/track takes a lead's
 * trackingToken in the QUERY STRING (see that route), and that token is a
 * bearer credential for the request, its chat thread, its one-time review and
 * its final-price verification. Reporting the raw URL on a 500 handed a live
 * customer credential to a third-party service that retains and indexes it,
 * plus the server's own log — the exact exposure customerGuard.ts moved the
 * chat token into a header to avoid.
 *
 * `phone` is PII and also the legacy lookup secret (/api/waitlist/track).
 * `ref` and `id` are the other half of both pairs; on their own they are not
 * credentials, but a log line naming both halves of a lookup is worth not
 * writing.
 */
const REDACTED_PARAMS = new Set(["token", "phone", "ref", "id"]);

/**
 * A request URL safe to log and report: path preserved in full, sensitive query
 * values replaced. Exported for testing.
 *
 * Keeps the parameter NAMES — knowing a 500 happened on
 * `/api/leads/track?ref=[redacted]&token=[redacted]` is what makes the report
 * useful, and it costs nothing.
 */
export function safeRoute(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Not absolute (or not a URL at all) — a relative path has no query
    // component we can parse, so drop everything from the first `?` rather
    // than reporting an unredacted string.
    return rawUrl.split("?")[0];
  }
  for (const key of [...url.searchParams.keys()]) {
    if (REDACTED_PARAMS.has(key.toLowerCase())) url.searchParams.set(key, "[redacted]");
  }
  // Origin dropped as well: it is the same host on every event and adds
  // nothing, while a query string is easier to miss inside a full URL.
  return `${url.pathname}${url.search}`;
}

/** Structural check for a Prisma known-request error without importing the class. */
function prismaErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
  ) {
    return (error as { code: string }).code;
  }
  return null;
}

export function withErrors<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AppError) {
        return fail(error.code, error.message, error.statusCode, error.details);
      }

      if (error instanceof ZodError) {
        return fail(
          "VALIDATION_ERROR",
          "Validation failed",
          400,
          zodDetails(error),
        );
      }

      const pcode = prismaErrorCode(error);
      if (pcode === "P2025") {
        return fail("NOT_FOUND", "Resource not found", 404);
      }
      if (pcode === "P2002") {
        return fail("CONFLICT", "A record with this value already exists", 409);
      }

      // Unknown — log + report (Sentry when SENTRY_DSN is set), return generic 500.
      // Fire-and-forget so reporting never delays or fails the response.
      const req = args[0] as { url?: string } | undefined;
      void captureException(error, { route: safeRoute(req?.url), source: "withErrors" });
      return fail("INTERNAL_ERROR", "Something went wrong", 500);
    }
  };
}
