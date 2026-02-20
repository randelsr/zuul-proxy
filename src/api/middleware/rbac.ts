import type { MiddlewareHandler, Context } from 'hono';
import { PermissionCache } from '../../rbac/index.js';
import { inferAction } from '../../proxy/action-mapper.js';
import { ToolRegistry } from '../../proxy/tool-registry.js';
import type { ChainDriver } from '../../chain/driver.js';
import type { AgentAddress, PermissionAction, ToolKey, SignedRequest } from '../../types.js';
import { getLogger } from '../../logging.js';

const logger = getLogger('middleware:rbac');

/**
 * RBAC middleware
 * Verifies agent has permission for (tool, action)
 *
 * On permission denied (403): return error with allowed_actions
 * On chain failure (503): return error (fail closed, never open)
 * On success: attach tool, action, role to context
 *
 * CRITICAL: Always use recovered address (from signature middleware), NOT claimed address
 */
export function rbacMiddleware(
  toolRegistry: ToolRegistry,
  permissionCache: PermissionCache,
  chainDriver: ChainDriver
): MiddlewareHandler {
  return async (context: Context, next: () => Promise<void>) => {
    const requestId = context.get('requestId') as string;
    const recoveredAddress = context.get('recoveredAddress') as AgentAddress | undefined;
    const signedRequest = context.get('signedRequest') as SignedRequest | undefined;

    if (!recoveredAddress) {
      logger.error({ requestId }, 'RBAC middleware: missing recovered address');
      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }

    if (!signedRequest) {
      logger.error({ requestId }, 'RBAC middleware: missing signed request');
      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }

    try {
      // Step 1: Infer action from HTTP method
      const actionResult = inferAction(signedRequest.method);

      if (!actionResult.ok) {
        logger.warn({ requestId, method: signedRequest.method }, 'Invalid HTTP method');
        context.status(400);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: actionResult.error.code,
            message: actionResult.error.message,
          },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/malformed',
          },
        });
      }

      const action: PermissionAction = actionResult.value;

      // Step 2: Extract tool from target URL
      const toolResult = toolRegistry.findTool(signedRequest.targetUrl);

      let toolKey: ToolKey;
      if (!toolResult.ok) {
        logger.warn({ requestId, targetUrl: signedRequest.targetUrl }, 'Unknown tool');

        // Set sentinel tool for audit middleware (agent has intent via signature)
        toolKey = 'unknown' as ToolKey;
        context.set('toolKey', toolKey);
        context.set('action', action);

        // Set flag to indicate unknown tool error
        context.set('unknownTool', {
          code: toolResult.error.code,
          message: toolResult.error.message,
          data: toolResult.error.data,
        });

        // Continue to audit middleware so authenticated request is logged
        logger.info(
          { requestId, agent: recoveredAddress, tool: toolKey, action },
          'Unknown tool detected (continuing for audit)'
        );
        return await next();
      }

      toolKey = toolResult.value.key;

      // Step 3: Check permission (with cache and chain lookup)
      const roleResult = await permissionCache.get(recoveredAddress, chainDriver);

      if (!roleResult.ok) {
        // Chain failure: fail closed (503, NOT 403)
        logger.error(
          { requestId, agent: recoveredAddress, error: roleResult.error.message },
          'RBAC check failed (chain unavailable)'
        );
        context.status(503);
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: roleResult.error.code,
            message: roleResult.error.message,
            data: roleResult.error.data,
          },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/unavailable',
          },
        });
      }

      // NOTE: PermissionCache converts domain Role (ReadonlyArray<Permission>)
      // to runtime RoleWithPermissions (Map<ToolKey, Set<PermissionAction>>) for O(1) lookups
      const role = roleResult.value;

      // Step 4: Attach tool and action to context IMMEDIATELY
      // This ensures audit middleware can capture ALL authenticated requests
      // including revocations, permission denials, and other authorized failures
      context.set('toolKey', toolKey);
      context.set('action', action);
      context.set('role', role);

      // Step 5: Check if agent is active
      // If revoked, set flag but DON'T return early - audit middleware must run
      if (!role.isActive) {
        logger.warn(
          { requestId, agent: recoveredAddress, roleId: role.roleId },
          'Agent is revoked (emergency)'
        );

        // Set revocation flag on context
        // This allows audit middleware to run BEFORE returning error
        context.set('agentRevoked', {
          code: -32012,
          message: 'Agent is revoked',
          data: { reason: 'emergency_revoke' },
        });

        // Continue to audit middleware so authenticated request is logged
        logger.info(
          { requestId, agent: recoveredAddress, tool: toolKey, action },
          'Agent revoked (continuing for audit)'
        );
        return await next();
      }

      // Step 6: Check if agent has permission for (tool, action)
      const toolPermissions = role.permissions.get(toolKey);

      if (!toolPermissions || !toolPermissions.has(action)) {
        logger.warn(
          {
            requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            allowedActions: toolPermissions ? Array.from(toolPermissions) : [],
          },
          'Permission denied'
        );

        // Set permission denied flag on context
        // This allows audit middleware to run BEFORE returning error
        context.set('permissionDenied', {
          code: -32011,
          message: `Permission denied: ${toolKey}.${action}`,
          allowedActions: toolPermissions ? Array.from(toolPermissions) : [],
        });
      }

      // Step 7: Continue to next middleware (even on permission denial)
      // This ensures audit middleware captures the denied request

      logger.info(
        { requestId, agent: recoveredAddress, tool: toolKey, action },
        'RBAC check passed'
      );

      return await next();
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'RBAC middleware error');

      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          agent: recoveredAddress,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }
  };
}
