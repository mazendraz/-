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
      void captureException(error, { route: req?.url, source: "withErrors" });
      return fail("INTERNAL_ERROR", "Something went wrong", 500);
    }
  };
}
