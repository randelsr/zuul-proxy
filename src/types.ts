// ============================================================================
// BRANDED SCALAR TYPES — Enforce domain semantics at compile time
// ============================================================================

/**
 * Agent wallet address (EIP-191 format: 0x...)
 * Branded to prevent confusing agent addresses with other string addresses
 */
export type AgentAddress = string & { readonly _brand: 'AgentAddress' };

/**
 * Unique per-request value for replay attack prevention
 * UUID v4 format
 */
export type Nonce = string & { readonly _brand: 'Nonce' };

/**
 * Immutable audit entry identifier on blockchain
 * UUID v4 format
 */
export type AuditId = string & { readonly _brand: 'AuditId' };

/**
 * Environment variable name referencing an API key (e.g., "GITHUB_API_KEY")
 * Used to load keys from .env at startup
 */
export type KeyRef = string & { readonly _brand: 'KeyRef' };

/**
 * OPAQUE handle to an API key — never serializable, never logged
 * The actual key value is hidden behind this handle.
 * Can only be passed to KeyCustodyDriver.inject() or similar.
 */
export type ApiKeyHandle = string & { readonly _brand: 'ApiKeyHandle' };

/**
 * Tool identifier (e.g., "github", "slack", "openai")
 */
export type ToolKey = string & { readonly _brand: 'ToolKey' };

/**
 * Role identifier (e.g., "developer", "admin")
 */
export type RoleId = string & { readonly _brand: 'RoleId' };

/**
 * Request identifier for tracing (UUID v4)
 */
export type RequestId = string & { readonly _brand: 'RequestId' };

/**
 * Cryptographic hash (hex string, 0x-prefixed)
 */
export type Hash = string & { readonly _brand: 'Hash' };

/**
 * EIP-191 wallet signature (hex string, 0x-prefixed)
 */
export type Signature = string & { readonly _brand: 'Signature' };

/**
 * Blockchain transaction hash (hex string, 0x-prefixed)
 */
export type TransactionHash = string & { readonly _brand: 'TransactionHash' };

/**
 * Unix timestamp in seconds
 */
export type Timestamp = number & { readonly _brand: 'Timestamp' };

/**
 * EVM chain ID (e.g., 295 for Hedera testnet, 8453 for Base)
 */
export type ChainId = number & { readonly _brand: 'ChainId' };

/**
 * AES-256-GCM encrypted payload (base64 string)
 * OPAQUE — never serializable, never logged, never exposed to agents
 */
export type EncryptedPayload = string & { readonly _brand: 'EncryptedPayload' };

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
export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

/**
 * HTTP method
 */
export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ============================================================================
// DOMAIN ENTITIES (All Immutable)
// ============================================================================

/**
 * Agent: identified by wallet address, has a role, can be active or revoked
 */
export type Agent = Readonly<{
  address: AgentAddress;
  roleId: RoleId;
  status: 'active' | 'revoked';
  registeredAt: Timestamp;
}>;

/**
 * Role: collection of permissions
 */
export type Role = Readonly<{
  id: RoleId;
  name: string;
  permissions: ReadonlyArray<Permission>;
  isActive: boolean;
}>;

/**
 * Permission: grant of specific action(s) on a specific tool
 */
export type Permission = Readonly<{
  tool: ToolKey;
  actions: ReadonlyArray<PermissionAction>;
}>;

/**
 * Internal cache type for RBAC lookups
 * Converts domain Role (with ReadonlyArray<Permission>) to runtime Map for O(1) lookups
 * Used internally by PermissionCache; not exposed to middleware
 */
export type RoleWithPermissions = Readonly<{
  id: RoleId;
  name: string;
  permissions: ReadonlyMap<ToolKey, ReadonlySet<PermissionAction>>;
  isActive: boolean;
}>;

// ============================================================================
// AUDIT TYPES
// ============================================================================

/**
 * Audit payload — what gets encrypted and stored on-chain
 * Only visible to admin after decryption
 */
export type AuditPayload = Readonly<{
  agent: AgentAddress;
  tool: ToolKey;
  action: PermissionAction;
  endpoint: string; // e.g., "/repos/owner/repo/issues"
  status: 'success' | 'denied';
  errorType?: string; // e.g., "permission/no_action_access"
  latencyMs: number;
  requestHash: Hash;
  responseHash: Hash;
}>;

/**
 * Audit entry on blockchain
 * Public on-chain; decryption key held by admin
 */
export type AuditEntry = Readonly<{
  auditId: AuditId;
  timestamp: Timestamp; // Public: when did this happen
  encryptedPayload: EncryptedPayload; // Private: agent + tool + action + endpoint + latency + status
  payloadHash: Hash; // Public: SHA-256(plaintext payload) — proves integrity
  agentSignature: Signature; // Public: original X-Signature from request — proves agent intent
  proxySignature: Signature; // Public: proxy signs payloadHash — proves Zuul attestation
}>;

// ============================================================================
// GOVERNANCE METADATA (Injected into ALL Responses)
// ============================================================================

/**
 * Metadata about governance, audit, and request context
 * Injected into every response (success and error)
 * May be in response body (_governance field) or X-Governance header (for binary responses)
 */
export type GovernanceMetadata = Readonly<{
  requestId: RequestId;
  agent?: AgentAddress; // May be absent on early auth failures
  tool?: ToolKey; // Present if tool extraction succeeded
  action?: PermissionAction; // Present if action inference succeeded
  latencyMs?: number; // Time spent forwarding to upstream
  auditTx?: TransactionHash; // Blockchain tx hash (or undefined if audit still pending)
  chainId: ChainId;
  timestamp: Timestamp;
  errorType?: string; // Slash-notation: "auth/invalid_signature", "permission/no_tool_access"
}>;

// ============================================================================
// JSON-RPC 2.0 DISCRIMINATED UNIONS
// ============================================================================

/**
 * Success response (result present, error absent)
 */
export type JsonRpcSuccess<T> = Readonly<{
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
  _governance: GovernanceMetadata;
}>;

/**
 * Error response (error present, result absent)
 */
export type JsonRpcError = Readonly<{
  jsonrpc: '2.0';
  id: string | number | null;
  error: Readonly<{
    code: number;
    message: string;
    data?: Readonly<Record<string, unknown>>;
  }>;
  _governance: GovernanceMetadata;
}>;

/**
 * Union of success or error
 * Never use { result?: T; error?: E } — discriminate on jsonrpc + error field
 */
export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

// ============================================================================
// RESULT TYPE (for recoverable paths)
// ============================================================================

/**
 * Discriminated union for fallible operations
 * Use Result<T, E> instead of throwing for expected failures
 * Reserve `throw` for unrecoverable invariant violations
 */
export type Result<T, E extends Error = Error> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

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
} as const satisfies Record<PermissionAction, readonly HttpMethod[]>;

// ============================================================================
// INBOUND REQUEST SHAPES
// ============================================================================

/**
 * Raw signature headers from HTTP request
 * These are the 4 headers required for every /forward/* request
 */
export type RawSignatureHeaders = Readonly<{
  'x-agent-address': string;
  'x-signature': string;
  'x-nonce': string;
  'x-timestamp': string;
}>;

/**
 * Signed request after type validation and narrowing
 * Ready to pass to auth verification functions
 */
export type SignedRequest = Readonly<{
  agentAddress: AgentAddress;
  signature: Signature;
  nonce: Nonce;
  timestamp: Timestamp;
  method: HttpMethod;
  targetUrl: string;
}>;

/**
 * Inbound RPC request (POST /rpc)
 * Standard JSON-RPC 2.0 format
 */
export type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number | null;
}>;

// ============================================================================
// TOOLS LIST RESPONSE
// ============================================================================

/**
 * A tool available to the agent (filtered by permissions)
 * Sent in tools/list response
 */
export type ToolListItem = Readonly<{
  key: ToolKey;
  description: string;
  base_url: string;
  allowed_actions: ReadonlyArray<PermissionAction>;
}>;
