import type { AgentAddress, Nonce, PermissionAction, Timestamp } from '../types.js';

/**
 * Type guard: is this value a valid agent address (0x followed by 40 hex chars)?
 */
export function isAgentAddress(value: unknown): value is AgentAddress {
  if (typeof value !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Type guard: is this value a valid UUID v4 (nonce)?
 */
export function isNonce(value: unknown): value is Nonce {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Type guard: is this value a valid Unix timestamp (number, positive)?
 */
export function isTimestamp(value: unknown): value is Timestamp {
  if (typeof value !== 'number') return false;
  return value > 0 && Number.isInteger(value);
}

/**
 * Type guard: is this string a valid HTTP method?
 */
export function isHttpMethod(
  value: unknown
): value is 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  if (typeof value !== 'string') return false;
  return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value);
}

/**
 * Type guard: is this value a valid permission action?
 */
export function isPermissionAction(value: unknown): value is PermissionAction {
  if (typeof value !== 'string') return false;
  return ['read', 'create', 'update', 'delete'].includes(value);
}

/**
 * Type guard: are all 4 required signature headers present and non-empty?
 */
export function isRawSignatureHeaders(headers: Record<string, unknown>): headers is {
  'x-agent-address': string;
  'x-signature': string;
  'x-nonce': string;
  'x-timestamp': string;
} {
  return (
    typeof headers['x-agent-address'] === 'string' &&
    headers['x-agent-address'].length > 0 &&
    typeof headers['x-signature'] === 'string' &&
    headers['x-signature'].length > 0 &&
    typeof headers['x-nonce'] === 'string' &&
    headers['x-nonce'].length > 0 &&
    typeof headers['x-timestamp'] === 'string' &&
    headers['x-timestamp'].length > 0
  );
}
