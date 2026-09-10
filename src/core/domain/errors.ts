/**
 * DOMAIN COPILOT - TYPED DOMAIN ERRORS
 * Explicit error hierarchy mapped to stable API codes.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatus = 400;
}

export class IncompatibleFilterScopeError extends DomainError {
  readonly code = "INCOMPATIBLE_FILTER_SCOPE";
  readonly httpStatus = 400;
}

export class UnsupportedFileTypeError extends DomainError {
  readonly code = "UNSUPPORTED_FILE_TYPE";
  readonly httpStatus = 400;
}

export class FileSizeLimitExceededError extends DomainError {
  readonly code = "FILE_SIZE_LIMIT_EXCEEDED";
  readonly httpStatus = 400;
}

export class IngestionFailedError extends DomainError {
  readonly code = "INGESTION_FAILED";
  readonly httpStatus = 500;
}

export class LowEvidenceRefusalError extends DomainError {
  readonly code = "LOW_EVIDENCE_REFUSAL";
  readonly httpStatus = 200; // Expected business refusal, not an HTTP failure
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly httpStatus = 401;
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;
}

export class SideEffectBlockedError extends DomainError {
  readonly code = "SIDE_EFFECT_BLOCKED";
  readonly httpStatus = 403;
}

export class ApprovalRequiredError extends DomainError {
  readonly code = "APPROVAL_REQUIRED";
  readonly httpStatus = 202;
}

export class ProviderFailureError extends DomainError {
  readonly code = "AI_PROVIDER_FAILURE";
  readonly httpStatus = 502;
}

export class StepTimeoutError extends DomainError {
  readonly code = "STEP_TIMEOUT";
  readonly httpStatus = 504;
}
