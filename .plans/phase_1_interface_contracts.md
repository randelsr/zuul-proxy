# Phase 1: Interface Contracts

**Duration:** ~4-5 hours
**Depends on:** Phase 0 (project bootstrap complete)
**Deliverable:** All canonical domain types, error hierarchy, and driver interfaces
**Success Criteria:** `pnpm typecheck` passes; all types compile without errors

---

## Objective

Define the complete type system and interfaces that all subsequent modules will implement against. This is the "contract" layer — once these are locked, all implementations depend on them.

**Why first:** Changing these types later requires cascading changes across 10+ modules. Defining them correctly upfront prevents rework.

---

## Implementation Details

### 1. src/types.ts

**Purpose:** All canonical domain types, branded scalars, JSON-RPC shapes, Result type

```typescript
// ============================================================================
// BRANDED SCALAR TYPES — Enforce domain semantics at compile time
// ============================================================================

/**
 * Agent wallet address (EIP-191 format: 0x...)
 * Branded to prevent confusing agent addresses with other string addresses
 */
export type AgentAddress = string & { readonly _brand: 'AgentAddress' }

/**
 * Unique per-request value for replay attack prevention
 * UUID v4 format
 */
export type Nonce = string & { readonly _brand: 'Nonce' }

/**
 * Immutable audit entry identifier on blockchain
 * UUID v4 format
 */
export type AuditId = string & { readonly _brand: 'AuditId' }

/**
 * Environment variable name referencing an API key (e.g., "GITHUB_API_KEY")
 * Used to load keys from .env at startup
 */
export type KeyRef = string & { readonly _brand: 'KeyRef' }

/**
 * OPAQUE handle to an API key — never serializable, never logged
 * The actual key value is hidden behind this handle.
 * Can only be passed to KeyCustodyDriver.inject() or similar.
 */
export type ApiKeyHandle = string & { readonly _brand: 'ApiKeyHandle' }

/**
 * Tool identifier (e.g., "github", "slack", "openai")
 */
export type ToolKey = string & { readonly _brand: 'ToolKey' }

/**
 * Role identifier (e.g., "developer", "admin")
 */
export type RoleId = string & { readonly _brand: 'RoleId' }

/**
 * Request identifier for tracing (UUID v4)
 */
export type RequestId = string & { readonly _brand: 'RequestId' }

/**
 * Cryptographic hash (hex string, 0x-prefixed)
 */
export type Hash = string & { readonly _brand: 'Hash' }

/**
 * EIP-191 wallet signature (hex string, 0x-prefixed)
 */
export type Signature = string & { readonly _brand: 'Signature' }

/**
 * Blockchain transaction hash (hex string, 0x-prefixed)
 */
export type TransactionHash = string & { readonly _brand: 'TransactionHash' }

/**
 * Unix timestamp in seconds
 */
export type Timestamp = number & { readonly _brand: 'Timestamp' }

/**
 * EVM chain ID (e.g., 295 for Hedera testnet, 8453 for Base)
 */
export type ChainId = number & { readonly _brand: 'ChainId' }

/**
 * AES-256-GCM encrypted payload (base64 string)
 * OPAQUE — never serializable, never logged, never exposed to agents
 */
export type EncryptedPayload = string & { readonly _brand: 'EncryptedPayload' }

// ============================================================================
// PERMISSION ACTION TYPES
// ============================================================================

/**
 * RBAC permission action — inferred from HTTP method
 * - read: GET, HEAD
 * - create: POST
 * - update: PUT, PATCH
 * - delete: DELETE
 */
export type PermissionAction = 'read' | 'create' | 'update' | 'delete'

/**
 * HTTP method
 */
export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// ============================================================================
// DOMAIN ENTITIES (All Immutable)
// ============================================================================

/**
 * Agent: identified by wallet address, has a role, can be active or revoked
 */
export type Agent = Readonly<{
  address: AgentAddress
  roleId: RoleId
  status: 'active' | 'revoked'
  registeredAt: Timestamp
}>

/**
 * Role: collection of permissions
 */
export type Role = Readonly<{
  id: RoleId
  name: string
  permissions: ReadonlyArray<Permission>
  isActive: boolean
}>

/**
 * Permission: grant of specific action(s) on a specific tool
 */
export type Permission = Readonly<{
  tool: ToolKey
  actions: ReadonlyArray<PermissionAction>
}>

/**
 * Internal cache type for RBAC lookups
 * Converts domain Role (with ReadonlyArray<Permission>) to runtime Map for O(1) lookups
 * Used internally by PermissionCache; not exposed to middleware
 */
export type RoleWithPermissions = Readonly<{
  id: RoleId
  name: string
  permissions: ReadonlyMap<ToolKey, ReadonlySet<PermissionAction>>
  isActive: boolean
}>

// ============================================================================
// AUDIT TYPES
// ============================================================================

/**
 * Audit payload — what gets encrypted and stored on-chain
 * Only visible to admin after decryption
 */
export type AuditPayload = Readonly<{
  agent: AgentAddress
  tool: ToolKey
  action: PermissionAction
  endpoint: string // e.g., "/repos/owner/repo/issues"
  status: 'success' | 'denied'
  errorType?: string // e.g., "permission/no_action_access"
  latencyMs: number
  requestHash: Hash
  responseHash: Hash
}>

/**
 * Audit entry on blockchain
 * Public on-chain; decryption key held by admin
 */
export type AuditEntry = Readonly<{
  auditId: AuditId
  timestamp: Timestamp // Public: when did this happen
  encryptedPayload: EncryptedPayload // Private: agent + tool + action + endpoint + latency + status
  payloadHash: Hash // Public: SHA-256(plaintext payload) — proves integrity
  agentSignature: Signature // Public: original X-Signature from request — proves agent intent
  proxySignature: Signature // Public: proxy signs payloadHash — proves Zuul attestation
}>

// ============================================================================
// GOVERNANCE METADATA (Injected into ALL Responses)
// ============================================================================

/**
 * Metadata about governance, audit, and request context
 * Injected into every response (success and error)
 * May be in response body (_governance field) or X-Governance header (for binary responses)
 */
export type GovernanceMetadata = Readonly<{
  requestId: RequestId
  agent?: AgentAddress // May be absent on early auth failures
  tool?: ToolKey // Present if tool extraction succeeded
  action?: PermissionAction // Present if action inference succeeded
  latencyMs?: number // Time spent forwarding to upstream
  auditTx?: TransactionHash // Blockchain tx hash (or undefined if audit still pending)
  chainId: ChainId
  timestamp: Timestamp
  errorType?: string // Slash-notation: "auth/invalid_signature", "permission/no_tool_access"
}>

// ============================================================================
// JSON-RPC 2.0 DISCRIMINATED UNIONS
// ============================================================================

/**
 * Success response (result present, error absent)
 */
export type JsonRpcSuccess<T> = Readonly<{
  jsonrpc: '2.0'
  id: string | null
  result: T
  _governance: GovernanceMetadata
}>

/**
 * Error response (error present, result absent)
 */
export type JsonRpcError = Readonly<{
  jsonrpc: '2.0'
  id: string | null
  error: Readonly<{
    code: number
    message: string
    data?: Readonly<Record<string, unknown>>
  }>
  _governance: GovernanceMetadata
}>

/**
 * Union of success or error
 * Never use { result?: T; error?: E } — discriminate on jsonrpc + error field
 */
export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

// ============================================================================
// RESULT TYPE (for recoverable paths)
// ============================================================================

/**
 * Discriminated union for fallible operations
 * Use Result<T, E> instead of throwing for expected failures
 * Reserve `throw` for unrecoverable invariant violations
 */
export type Result<T, E extends ZuulError = ZuulError> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>

// ============================================================================
// ACTION MAPPING (Enforced exhaustive at compile time)
// ============================================================================

/**
 * Bidirectional mapping between PermissionAction and HttpMethod
 * Used to:
 *   1. Infer action from HTTP method (forward request handler)
 *   2. Validate action values (config loader)
 *   3. Type-check exhaustiveness
 *
 * Enforced with `satisfies` to preserve literal precision
 */
export const ACTION_TO_METHODS = {
  read: ['GET', 'HEAD'],
  create: ['POST'],
  update: ['PUT', 'PATCH'],
  delete: ['DELETE'],
} as const satisfies Record<PermissionAction, readonly HttpMethod[]>

// Reverse lookup: given HTTP method, find action
export type MethodToAction = {
  [Method in HttpMethod]: Extract<PermissionAction, keyof typeof ACTION_TO_METHODS>
}

// ============================================================================
// INBOUND REQUEST SHAPES
// ============================================================================

/**
 * Raw signature headers from HTTP request
 * These are the 4 headers required for every /forward/* request
 */
export type RawSignatureHeaders = Readonly<{
  'x-agent-address': string
  'x-signature': string
  'x-nonce': string
  'x-timestamp': string
}>

/**
 * Signed request after type validation and narrowing
 * Ready to pass to auth verification functions
 */
export type SignedRequest = Readonly<{
  agentAddress: AgentAddress
  signature: Signature
  nonce: Nonce
  timestamp: Timestamp
  method: HttpMethod
  targetUrl: string
}>

/**
 * Inbound RPC request (POST /rpc)
 * Standard JSON-RPC 2.0 format
 */
export type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0'
  method: string
  params?: unknown
  id: string | number | null
}>

// ============================================================================
// TOOLS LIST RESPONSE
// ============================================================================

/**
 * A tool available to the agent (filtered by permissions)
 * Sent in tools/list response
 */
export type ToolListItem = Readonly<{
  key: ToolKey
  description: string
  base_url: string
  allowed_actions: ReadonlyArray<PermissionAction>
}>

// ============================================================================
// TYPE GUARDS (Defined separately in guard module, exported here for convenience)
// ============================================================================

/**
 * Type guard signatures — actual implementations in guard module
 * These are declared here for reference; implementations in src/auth/guards.ts
 */
export interface TypeGuards {
  isAgentAddress(value: unknown): value is AgentAddress
  isPermissionAction(value: unknown): value is PermissionAction
  isHttpMethod(value: unknown): value is HttpMethod
  isSignedRequest(headers: unknown): headers is RawSignatureHeaders
  isNonce(value: unknown): value is Nonce
}
```

### 2. src/errors.ts

**Purpose:** ZuulError hierarchy and all error codes

```typescript
import { type PermissionAction, type ToolKey } from './types.js'

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base error class for all Zuul errors
 * Combines HTTP transport layer (httpStatus) and JSON-RPC semantics (code)
 */
export class ZuulError extends Error {
  readonly code: number // JSON-RPC error code
  readonly httpStatus: number // HTTP status
  readonly errorType: string // Slash-notation: "auth/invalid_signature"
  readonly data?: Readonly<Record<string, unknown>> // Contextual data

  constructor(
    message: string,
    code: number,
    httpStatus: number,
    errorType: string,
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
    this.errorType = errorType
    this.data = data
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      errorType: this.errorType,
      data: this.data,
    }
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
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, 401, errorType, data)
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
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, 403, errorType, data)
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
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, httpStatus, errorType, data)
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
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, httpStatus, errorType, data)
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
    data?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, 429, errorType, data)
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
    code: number
    httpStatus: number
    errorType: string
    message: string
  }
>

// ============================================================================
// ERROR FACTORIES
// ============================================================================

/**
 * Factory functions to simplify error creation with standard messages
 */

export function createAuthError(
  errorKey: keyof typeof ERRORS,
  data?: Readonly<Record<string, unknown>>,
): AuthError {
  const err = ERRORS[errorKey]
  if (err.httpStatus !== 401) throw new Error(`Not an auth error: ${errorKey}`)
  return new AuthError(err.message, err.code, err.errorType, data)
}

export function createPermissionError(
  errorKey: keyof typeof ERRORS,
  data?: Readonly<Record<string, unknown>>,
): PermissionError {
  const err = ERRORS[errorKey]
  if (err.httpStatus !== 403) throw new Error(`Not a permission error: ${errorKey}`)
  return new PermissionError(err.message, err.code, err.errorType, data)
}

export function createRequestError(
  errorKey: keyof typeof ERRORS,
  data?: Readonly<Record<string, unknown>>,
): RequestError {
  const err = ERRORS[errorKey]
  if (![400, 404].includes(err.httpStatus)) throw new Error(`Not a request error: ${errorKey}`)
  return new RequestError(err.message, err.code, err.httpStatus, err.errorType, data)
}

export function createServiceError(
  errorKey: keyof typeof ERRORS,
  data?: Readonly<Record<string, unknown>>,
): ServiceError {
  const err = ERRORS[errorKey]
  if (![502, 503, 504].includes(err.httpStatus))
    throw new Error(`Not a service error: ${errorKey}`)
  return new ServiceError(err.message, err.code, err.httpStatus, err.errorType, data)
}
```

### 3. src/chain/driver.ts

**Purpose:** ChainDriver interface for all blockchain interactions

```typescript
import type { Abi } from 'viem'
import type { ChainId, TransactionHash } from '../types.js'
import type { ServiceError } from '../errors.js'
import type { Result } from '../types.js'

/**
 * Abstraction for blockchain interactions
 * Implementations: local (in-memory), hedera (Hedera testnet), evm (Base, Arbitrum, Optimism)
 *
 * All methods use viem's Abi type for type-safe contract interaction
 * Never use hand-written ABI types
 */
export interface ChainDriver {
  /**
   * Read-only contract call (view function)
   * Returns the decoded return value
   *
   * Timeout: 30 seconds
   * Retry: exponential backoff (3 attempts, 100ms base, full jitter)
   *
   * On failure: return ServiceError with code -32022 (SERVICE_UNAVAILABLE)
   * This ensures fail-closed: RBAC denies access if chain is down
   */
  callContract<T>(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Result<T, ServiceError>>

  /**
   * State-mutating contract call (write function)
   * Returns the transaction hash
   *
   * Timeout: 60 seconds
   * Retry: exponential backoff (3 attempts, 100ms base, full jitter)
   *
   * On failure: return ServiceError with code -32021 (SERVICE_TIMEOUT) or -32022
   */
  writeContract(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Result<TransactionHash, ServiceError>>

  /**
   * Get the chain ID this driver is configured for
   */
  getChainId(): ChainId

  /**
   * Get the RPC URL (for informational purposes only)
   */
  getRpcUrl(): string
}
```

### 4. src/audit/driver.ts

**Purpose:** AuditStoreDriver interface for durable audit queue

```typescript
import type { AuditEntry } from '../types.js'

/**
 * Abstraction for durable audit log storage
 * Implementations: in-memory with retry queue (MVP)
 *
 * MVP: non-persistent in-memory queue with exponential backoff retry
 * Future: persistent queue (SQLite, Redis)
 */
export interface AuditStoreDriver {
  /**
   * Enqueue an audit entry for blockchain submission
   * Non-blocking: returns immediately
   * Entry is added to in-memory queue and flushed asynchronously
   *
   * If proxy crashes before flush, entry is lost (acknowledged MVP limitation)
   */
  enqueue(entry: AuditEntry): void

  /**
   * Flush all queued entries to blockchain
   * Called automatically on interval (1s) and graceful shutdown (SIGTERM)
   *
   * Retries on failure: exponential backoff (3 attempts, 100ms base, full jitter)
   * On ultimate failure: error surfaced to monitoring, proxy continues operating
   */
  flush(): Promise<void>

  /**
   * Get count of entries currently in queue (debugging)
   */
  pendingCount(): number
}
```

### 5. src/custody/driver.ts

**Purpose:** KeyCustodyDriver interface for API key storage

```typescript
import type { ApiKeyHandle, KeyRef, ToolKey } from '../types.js'
import type { ServiceError } from '../errors.js'
import type { Result } from '../types.js'

/**
 * Abstraction for API key storage and retrieval
 * Implementation: load from environment at startup, return opaque handles
 *
 * KEY INVARIANT: ApiKeyHandle is opaque. The actual key value is hidden.
 * This prevents accidental logging, serialization, or exposure to agents.
 */
export interface KeyCustodyDriver {
  /**
   * Get the opaque API key handle for a specific tool
   * The actual key is loaded from .env at startup using the KeyRef
   *
   * On success: return ApiKeyHandle (opaque, can only be passed to inject())
   * On failure (missing env var): return ServiceError
   *
   * Used internally by proxy to get keys for key injection
   */
  getKey(tool: ToolKey): Result<ApiKeyHandle, ServiceError>

  /**
   * Inject the actual API key into a request header
   * Takes the opaque handle from getKey() and returns the actual header value
   *
   * Only this method knows how to unwrap ApiKeyHandle
   * Everything else treats it as completely opaque
   */
  inject(handle: ApiKeyHandle): string
}
```

---

## Testing Phase 1

**File:** `tests/types/test_branded.ts`

```typescript
// Test branded type narrowing, type guards
// Verify that raw strings cannot be assigned to branded types (compile-time error)
// Verify type guards narrow correctly
// Verify ACTION_TO_METHODS exhaustiveness
```

**File:** `tests/errors/test_error_hierarchy.ts`

```typescript
// Test error factory functions
// Verify correct code/httpStatus/errorType mapping
// Verify error JSON serialization
// Verify error instanceof checks
```

---

## Acceptance Criteria

- ✅ All branded types defined and exported
- ✅ All domain entities immutable (Readonly<...>)
- ✅ JSON-RPC discriminated unions (never optional result + optional error)
- ✅ Result<T, E> type defined
- ✅ ACTION_TO_METHODS enforced exhaustive with `satisfies`
- ✅ All 15 error codes defined in ERRORS constant (PRD table is authoritative)
- ✅ Error subclasses (AuthError, PermissionError, RequestError, ServiceError, RateLimitError)
- ✅ ChainDriver, AuditStoreDriver, KeyCustodyDriver interfaces defined
- ✅ All interfaces documented with timeout, retry, error semantics
- ✅ `pnpm typecheck` passes
- ✅ Tests written and passing

---

## Commands

```bash
# Create files
touch src/types.ts src/errors.ts src/chain/driver.ts src/audit/driver.ts src/custody/driver.ts

# (Copy implementations from above)

# Verify
pnpm typecheck
pnpm lint
pnpm format:check

# Test (later, when testing framework is set up)
# pnpm test tests/types/ tests/errors/

# Commit
git add src/{types,errors}.ts src/{chain,audit,custody}/driver.ts tests/types/ tests/errors/
git commit -m "Phase 1: Interface contracts — branded types, domain entities, driver interfaces"
```

---

## What's NOT in Phase 1

- Implementation of any driver interface
- Type guard implementations (defer to Phase 4)
- Error handling middleware (defer to Phase 10)
- Configuration loading (defer to Phase 3)
- Logging setup (defer to Phase 3)
