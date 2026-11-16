/**
 * Transport-agnostic error taxonomy. The domain and application layers throw these;
 * only the presentation layer decides which HTTP status each `kind` maps to.
 */
export const DomainErrorKind = {
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  BUSINESS_RULE: 'BUSINESS_RULE',
  CONCURRENCY: 'CONCURRENCY',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type DomainErrorKind =
  (typeof DomainErrorKind)[keyof typeof DomainErrorKind];

export interface DomainErrorOptions {
  /** Stable, machine-readable code clients can branch on, e.g. FEE_CLEARANCE_NOT_MET. */
  code?: string;
  /** Safe, non-sensitive context returned to the client. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  readonly details?: Record<string, unknown>;
  private readonly customCode?: string;

  protected constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.customCode = options.code;
    this.details = options.details;
  }

  get code(): string {
    return this.customCode ?? this.kind;
  }
}

export class NotFoundError extends DomainError {
  readonly kind = DomainErrorKind.NOT_FOUND;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

export class ConflictError extends DomainError {
  readonly kind = DomainErrorKind.CONFLICT;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

export class ValidationError extends DomainError {
  readonly kind = DomainErrorKind.VALIDATION;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

export class UnauthenticatedError extends DomainError {
  readonly kind = DomainErrorKind.UNAUTHENTICATED;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

export class ForbiddenError extends DomainError {
  readonly kind = DomainErrorKind.FORBIDDEN;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

/** A valid request that violates a business rule (BR-xx), e.g. clearance not met. */
export class BusinessRuleViolationError extends DomainError {
  readonly kind = DomainErrorKind.BUSINESS_RULE;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

/** Optimistic-locking failure: the aggregate changed since it was read. */
export class ConcurrencyError extends DomainError {
  readonly kind = DomainErrorKind.CONCURRENCY;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}

export class ServiceUnavailableError extends DomainError {
  readonly kind = DomainErrorKind.UNAVAILABLE;
  constructor(message: string, options?: DomainErrorOptions) {
    super(message, options);
  }
}
