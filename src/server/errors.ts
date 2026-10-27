/**
 * Typed application errors. Services throw these; Server Actions and Route Handlers translate them
 * into safe user-facing messages / HTTP responses. Never put secrets or internal details in messages.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  constructor(message: string, opts: { status: number; code: string; fieldErrors?: FieldErrors }) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status;
    this.code = opts.code;
    this.fieldErrors = opts.fieldErrors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, { status: 401, code: "UNAUTHENTICATED" });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, { status: 403, code: "FORBIDDEN" });
  }
}

/** Also used instead of 403 when revealing existence of a record would leak information. */
export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super(message, { status: 404, code: "NOT_FOUND" });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please correct the highlighted fields.", fieldErrors?: FieldErrors) {
    super(message, { status: 422, code: "VALIDATION_FAILED", fieldErrors });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, { status: 422, code: "BUSINESS_RULE" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "This record was changed by someone else. Reload and try again.") {
    super(message, { status: 409, code: "CONFLICT" });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = "Too many attempts. Please wait and try again.") {
    super(message, { status: 429, code: "RATE_LIMITED" });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Postgres unique violation detection (works for node-postgres and neon errors, including wrapped causes). */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const err = cur as { code?: string; constraint?: string; cause?: unknown };
    if (err.code === "23505") return constraint ? err.constraint === constraint : true;
    cur = err.cause;
  }
  return false;
}
