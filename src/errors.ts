// Errors module — no imports needed

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base error class for all Zuul errors
 * Combines HTTP transport layer (httpStatus) and JSON-RPC semantics (code)
 */
export class ZuulError extends Error {
  readonly code: number; // JSON-RPC error code
  readonly httpStatus: number; // HTTP status
  readonly errorType: string; // Slash-notation: "auth/invalid_signature"
  readonly data: Readonly<Record<string, unknown>> | undefined; // Contextual data

  constructor(
    message: string,
    code: number,
    httpStatus: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.errorType = errorType;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      errorType: this.errorType,
      data: this.data,
    };
  }
}

// ============================================================================
// ERROR SUBCLASSES
// ============================================================================

/**
 * Authentication failures: invalid signature, missing headers, nonce reuse, timestamp drift
 * HTTP 401, JSON-RPC codes -32001 to -32009
 */
export class AuthError extends ZuulError {
  constructor(
    message: string,
    code: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message, code, 401, errorType, data);
  }
}

/**
 * Authorization failures: no tool access, no action access, wallet revoked
 * HTTP 403, JSON-RPC codes -32010 to -32019
 */
export class PermissionError extends ZuulError {
  constructor(
    message: string,
    code: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message, code, 403, errorType, data);
  }
}

/**
 * Request errors: malformed, unknown tool
 * HTTP 400/404, JSON-RPC codes -32600, -32013
 */
export class RequestError extends ZuulError {
  constructor(
    message: string,
    code: number,
    httpStatus: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message, code, httpStatus, errorType, data);
  }
}

/**
 * Service errors: upstream error, timeout, unavailable
 * HTTP 502/503/504, JSON-RPC codes -32020 to -32029
 */
export class ServiceError extends ZuulError {
  constructor(
    message: string,
    code: number,
    httpStatus: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message, code, httpStatus, errorType, data);
  }
}

/**
 * Rate limiting errors
 * HTTP 429, JSON-RPC codes -32030 to -32039
 */
export class RateLimitError extends ZuulError {
  constructor(
    message: string,
    code: number,
    errorType: string,
    data: Readonly<Record<string, unknown>> | undefined = undefined
  ) {
    super(message, code, 429, errorType, data);
  }
}

// ============================================================================
// ERROR CODE CONSTANTS (Authoritative: from PRD error table)
// ============================================================================

export const ERRORS = {
  MISSING_SIGNATURE: {
    code: -32001,
    httpStatus: 401,
    errorType: 'auth/missing_signature',
    message: 'Missing signature',
  },
  INVALID_SIGNATURE: {
    code: -32002,
    httpStatus: 401,
    errorType: 'auth/invalid_signature',
    message: 'Invalid signature',
  },
  UNKNOWN_WALLET: {
    code: -32003,
    httpStatus: 401,
    errorType: 'auth/unknown_wallet',
    message: 'Wallet not registered',
  },
  INVALID_NONCE: {
    code: -32004,
    httpStatus: 401,
    errorType: 'auth/invalid_nonce',
    message: 'Invalid nonce',
  },
  TIMESTAMP_DRIFT: {
    code: -32005,
    httpStatus: 401,
    errorType: 'auth/timestamp_drift',
    message: 'Request timestamp outside ±5 min window',
  },
  NO_TOOL_ACCESS: {
    code: -32010,
    httpStatus: 403,
    errorType: 'permission/no_tool_access',
    message: 'Permission denied: no access to tool',
  },
  NO_ACTION_ACCESS: {
    code: -32011,
    httpStatus: 403,
    errorType: 'permission/no_action_access',
    message: 'Permission denied: action not allowed',
  },
  WALLET_REVOKED: {
    code: -32012,
    httpStatus: 403,
    errorType: 'permission/revoked',
    message: 'Wallet revoked',
  },
  UNKNOWN_TOOL: {
    code: -32013,
    httpStatus: 404,
    errorType: 'request/unknown_tool',
    message: 'Tool not found',
  },
  MALFORMED_REQUEST: {
    code: -32600,
    httpStatus: 400,
    errorType: 'request/malformed',
    message: 'Invalid request',
  },
  UPSTREAM_ERROR: {
    code: -32020,
    httpStatus: 502,
    errorType: 'service/upstream_error',
    message: 'Service error',
  },
  SERVICE_TIMEOUT: {
    code: -32021,
    httpStatus: 504,
    errorType: 'service/timeout',
    message: 'Service timeout',
  },
  SERVICE_UNAVAILABLE: {
    code: -32022,
    httpStatus: 503,
    errorType: 'service/unavailable',
    message: 'Service unavailable',
  },
  RATE_EXCEEDED: {
    code: -32030,
    httpStatus: 429,
    errorType: 'rate/exceeded',
    message: 'Rate limit exceeded',
  },
  INTERNAL_ERROR: {
    code: -32603,
    httpStatus: 500,
    errorType: 'internal/error',
    message: 'Internal error',
  },
} as const satisfies Record<
  string,
  {
    code: number;
    httpStatus: number;
    errorType: string;
    message: string;
  }
>;

// ============================================================================
// ERROR FACTORIES
// ============================================================================

/**
 * Factory functions to simplify error creation with standard messages
 */

export function createAuthError(
  errorKey: keyof typeof ERRORS,
  data: Readonly<Record<string, unknown>> | undefined = undefined
): AuthError {
  const err = ERRORS[errorKey];
  if (err.httpStatus !== 401) throw new Error(`Not an auth error: ${errorKey}`);
  return new AuthError(err.message, err.code, err.errorType, data);
}

export function createPermissionError(
  errorKey: keyof typeof ERRORS,
  data: Readonly<Record<string, unknown>> | undefined = undefined
): PermissionError {
  const err = ERRORS[errorKey];
  if (err.httpStatus !== 403) throw new Error(`Not a permission error: ${errorKey}`);
  return new PermissionError(err.message, err.code, err.errorType, data);
}

export function createRequestError(
  errorKey: keyof typeof ERRORS,
  data: Readonly<Record<string, unknown>> | undefined = undefined
): RequestError {
  const err = ERRORS[errorKey];
  if (![400, 404].includes(err.httpStatus)) throw new Error(`Not a request error: ${errorKey}`);
  return new RequestError(err.message, err.code, err.httpStatus, err.errorType, data);
}

export function createServiceError(
  errorKey: keyof typeof ERRORS,
  data: Readonly<Record<string, unknown>> | undefined = undefined
): ServiceError {
  const err = ERRORS[errorKey];
  if (![502, 503, 504].includes(err.httpStatus))
    throw new Error(`Not a service error: ${errorKey}`);
  return new ServiceError(err.message, err.code, err.httpStatus, err.errorType, data);
}

export function createRateLimitError(
  errorKey: keyof typeof ERRORS,
  data: Readonly<Record<string, unknown>> | undefined = undefined
): RateLimitError {
  const err = ERRORS[errorKey];
  if (err.httpStatus !== 429) throw new Error(`Not a rate limit error: ${errorKey}`);
  return new RateLimitError(err.message, err.code, err.errorType, data);
}
