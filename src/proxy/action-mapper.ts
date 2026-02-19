import type { HttpMethod, PermissionAction } from '../types.js';
import { RequestError, ERRORS } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('proxy:action-mapper');

/**
 * Infer RBAC permission action from HTTP method
 * GET/HEAD → read
 * POST → create
 * PUT/PATCH → update
 * DELETE → delete
 *
 * @param method HTTP method
 * @returns PermissionAction or RequestError
 */
export function inferAction(method: HttpMethod): Result<PermissionAction, RequestError> {
  switch (method) {
    case 'GET':
    case 'HEAD':
      logger.debug({ method }, 'Inferred action: read');
      return { ok: true, value: 'read' };

    case 'POST':
      logger.debug({ method }, 'Inferred action: create');
      return { ok: true, value: 'create' };

    case 'PUT':
    case 'PATCH':
      logger.debug({ method }, 'Inferred action: update');
      return { ok: true, value: 'update' };

    case 'DELETE':
      logger.debug({ method }, 'Inferred action: delete');
      return { ok: true, value: 'delete' };

    default: {
      // Exhaustiveness check: if all cases are handled, this never executes
      // If it does, TypeScript should flag a missing case
      logger.error({ method }, 'Unknown HTTP method');
      return {
        ok: false,
        error: new RequestError(
          `Unknown HTTP method: ${String(method)}`,
          ERRORS.MALFORMED_REQUEST.code,
          ERRORS.MALFORMED_REQUEST.httpStatus,
          ERRORS.MALFORMED_REQUEST.errorType
        ),
      };
    }
  }
}
