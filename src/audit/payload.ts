import type {
  AgentAddress,
  Hash,
  ToolKey,
  PermissionAction,
  AuditId,
  Timestamp,
} from '../types.js';
import { createHash, randomBytes } from 'crypto';

/**
 * Audit payload: immutable record of request + decision
 * All fields except IDs are hashed for privacy
 */
export type AuditPayload = Readonly<{
  id: AuditId;
  timestamp: Timestamp;
  agent: AgentAddress;
  tool: ToolKey;
  action: PermissionAction;
  endpoint: string;
  method: string;
  status: number;
  errorType: string | undefined;
  latencyMs: number;
  requestHash: Hash; // Hash of full request body
  responseHash: Hash; // Hash of full response body
}>;

/**
 * Build audit payload from request context
 * @param agent Agent address (recovered signer, NOT claimed)
 * @param tool Tool key extracted from target URL
 * @param action Permission action inferred from HTTP method
 * @param endpoint Target URL
 * @param method HTTP method
 * @param status HTTP status code of response (200, 403, 503, etc.)
 * @param errorType If response is error, the error_type (e.g., "auth/invalid_signature")
 * @param latencyMs Elapsed time from request start to response
 * @param requestHash SHA-256 hash of request body
 * @param responseHash SHA-256 hash of response body
 * @returns AuditPayload
 */
export function buildAuditPayload(
  agent: AgentAddress,
  tool: ToolKey,
  action: PermissionAction,
  endpoint: string,
  method: string,
  status: number,
  errorType: string | undefined,
  latencyMs: number,
  requestHash: Hash,
  responseHash: Hash
): AuditPayload {
  // Use cryptographically secure random bytes for auditId (32 bytes = 256 bits)
  const id = `0x${randomBytes(32).toString('hex')}` as AuditId;
  const timestamp = Math.floor(Date.now() / 1000) as Timestamp;

  return {
    id,
    timestamp,
    agent,
    tool,
    action,
    endpoint,
    method,
    status,
    errorType,
    latencyMs,
    requestHash,
    responseHash,
  };
}

/**
 * Compute SHA-256 hash of audit payload (deterministic)
 * Hash all fields except signatures for verification
 * @param payload AuditPayload
 * @returns SHA-256 hash as hex string
 */
export function hashPayload(payload: AuditPayload): Hash {
  const canonical = JSON.stringify({
    id: payload.id,
    timestamp: payload.timestamp,
    agent: payload.agent,
    tool: payload.tool,
    action: payload.action,
    endpoint: payload.endpoint,
    method: payload.method,
    status: payload.status,
    errorType: payload.errorType,
    latencyMs: payload.latencyMs,
    requestHash: payload.requestHash,
    responseHash: payload.responseHash,
  });

  const hash = createHash('sha256');
  hash.update(canonical);
  return `0x${hash.digest('hex')}` as unknown as Hash;
}

/**
 * Compute SHA-256 hash of request/response body (for privacy)
 * Bodies are never stored; only hashes are written to blockchain
 * @param body Unknown body (JSON, binary, text)
 * @returns SHA-256 hash as hex string
 */
export function hashBody(body: unknown): Hash {
  let serialized: string;

  if (body === null || body === undefined) {
    serialized = '';
  } else if (typeof body === 'string') {
    serialized = body;
  } else if (Buffer.isBuffer(body)) {
    const hash = createHash('sha256');
    hash.update(body as Uint8Array);
    return `0x${hash.digest('hex')}` as unknown as Hash;
  } else {
    try {
      serialized = JSON.stringify(body);
    } catch {
      serialized = String(body);
    }
  }

  const hash = createHash('sha256');
  hash.update(serialized);
  return `0x${hash.digest('hex')}` as unknown as Hash;
}
