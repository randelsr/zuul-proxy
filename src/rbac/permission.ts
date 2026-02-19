import type { HttpMethod, PermissionAction } from '../types.js';
import { RequestError } from '../errors.js';
import type { Result } from '../types.js';

/**
 * Infer RBAC action from HTTP method
 * GET/HEAD → read, POST → create, PUT/PATCH → update, DELETE → delete
 *
 * Uses exhaustive pattern matching to prevent bugs if PermissionAction changes.
 * Returns RequestError for unknown methods (unreachable with proper types, but defensive).
 */
export function inferAction(method: HttpMethod): Result<PermissionAction, RequestError> {
  switch (method) {
    case 'GET':
    case 'HEAD':
      return { ok: true, value: 'read' };
    case 'POST':
      return { ok: true, value: 'create' };
    case 'PUT':
    case 'PATCH':
      return { ok: true, value: 'update' };
    case 'DELETE':
      return { ok: true, value: 'delete' };
    default:
      // Exhaustive check: if a new HttpMethod is added, this will fail to compile
      const _exhaustive: never = method;
      return {
        ok: false,
        error: new RequestError(
          `Unknown HTTP method: ${_exhaustive}`,
          -32600, // INVALID_REQUEST
          400,
          'request/malformed'
        ),
      };
  }
}

/**
 * Reverse mapping: action → supported HTTP methods
 *
 * Uses `satisfies` to enforce compile-time exhaustiveness:
 * if a new PermissionAction is added, this object will fail to compile
 * until it's included here.
 */
export const ACTION_TO_METHODS = {
  read: ['GET', 'HEAD'] as const,
  create: ['POST'] as const,
  update: ['PUT', 'PATCH'] as const,
  delete: ['DELETE'] as const,
} as const satisfies Record<PermissionAction, readonly HttpMethod[]>;
