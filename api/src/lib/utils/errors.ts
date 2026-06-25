// Custom error hierarchy. Routes throw these; `withErrors` serializes them into a
// flat ApiErrorBody with the matching HTTP status (see ./withErrors.ts).

/** Standard error codes returned to the client (matches backend-plan §4). */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
    // Keep a clean stack across the custom subclasses.
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    details?: Record<string, string[]>,
  ) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super("RATE_LIMITED", message, 429);
  }
}
