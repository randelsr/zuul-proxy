import type { Context } from 'hono';
import { z } from 'zod';
import type { ToolRegistry } from '../../proxy/tool-registry.js';
import type { PermissionCache } from '../../rbac/cache.js';
import type { ChainDriver } from '../../chain/driver.js';
import type { AgentAddress } from '../../types.js';
import type { AppConfig } from '../../config/types.js';
import { getLogger } from '../../logging.js';

const logger = getLogger('handlers:rpc');

/**
 * JSON-RPC 2.0 request schema
 */
const RpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.enum(['tools/list', 'tools/describe']),
  params: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
});

type RpcRequest = z.infer<typeof RpcRequestSchema>;

/**
 * RPC handler: tools/list, tools/describe
 * No signature verification required (agent_address used to filter results)
 * tools/list filters by agent permissions from PermissionCache
 */
export function rpcHandler(
  toolRegistry: ToolRegistry,
  permissionCache: PermissionCache,
  chainDriver: ChainDriver,
  config: AppConfig
) {
  return async (context: Context) => {
    const requestId = context.get('requestId') as string;

    try {
      const body = await context.req.json();

      // Validate JSON-RPC format
      const parseResult = RpcRequestSchema.safeParse(body);

      if (!parseResult.success) {
        logger.warn({ requestId, error: parseResult.error }, 'Invalid JSON-RPC request');
        context.status(400);
        return context.json({
          jsonrpc: '2.0',
          id: body.id || null,
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC request',
          },
          _governance: {
            request_id: requestId,
            chain_id: config.chain.chainId,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'request/malformed',
          },
        });
      }

      const request: RpcRequest = parseResult.data;
      const agentAddress = (request.params?.agent_address || null) as AgentAddress | null;

      // ====================================================================
      // tools/list
      // ====================================================================

      if (request.method === 'tools/list') {
        logger.debug({ requestId, agent: agentAddress }, 'tools/list called');

        const allTools = toolRegistry.listTools();

        // Filter tools by agent permission (if agent_address provided)
        let tools: Array<{
          key: string;
          base_url: string;
          description: string;
          allowed_actions: string[];
        }> = [];

        if (agentAddress) {
          // Get agent's permissions from cache
          const roleResult = await permissionCache.get(agentAddress, chainDriver);

          if (roleResult.ok) {
            const role = roleResult.value;

            // Check if agent is revoked (emergency revoke)
            if (!role.isActive) {
              logger.warn(
                { requestId, agent: agentAddress, roleId: role.roleId },
                'Agent is revoked, returning no tools'
              );
              // Return empty tools list for revoked agents (fail closed)
            } else {
              // Agent is active: filter tools by permission
              // Filter tools: only include if agent has at least one permission for that tool
              for (const tool of allTools) {
                const toolPermissions = role.permissions.get(tool.key);
                if (toolPermissions && toolPermissions.size > 0) {
                  tools.push({
                    key: tool.key,
                    base_url: tool.baseUrl,
                    description: tool.description,
                    allowed_actions: Array.from(toolPermissions),
                  });
                }
              }
            }
          } else {
            // Cache miss or chain error: return empty tools list (fail closed)
            logger.warn(
              { requestId, agent: agentAddress, error: roleResult.error.message },
              'Failed to get agent permissions, returning no tools'
            );
          }
        } else {
          // No agent address provided: return no tools (require explicit agent identity)
          logger.debug(
            { requestId },
            'tools/list: no agent_address provided, returning empty list'
          );
        }

        context.status(200);
        return context.json({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools },
          _governance: {
            request_id: requestId,
            agent: agentAddress,
            chain_id: config.chain.chainId,
            timestamp: Math.floor(Date.now() / 1000),
          },
        });
      }

      // ====================================================================
      // tools/describe
      // ====================================================================

      if (request.method === 'tools/describe') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolKey = (request.params?.tool_key || null) as any;

        if (!toolKey) {
          logger.warn({ requestId }, 'tools/describe: missing tool_key');
          context.status(400);
          return context.json({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32600,
              message: 'Missing tool_key parameter',
            },
            _governance: {
              request_id: requestId,
              agent: agentAddress,
              chain_id: config.chain.chainId,
              timestamp: Math.floor(Date.now() / 1000),
              error_type: 'request/malformed',
            },
          });
        }

        const toolResult = toolRegistry.getTool(toolKey);

        if (!toolResult.ok) {
          logger.warn({ requestId, toolKey }, 'tools/describe: tool not found');
          context.status(404);
          return context.json({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32013,
              message: `Unknown tool: ${toolKey}`,
            },
            _governance: {
              request_id: requestId,
              agent: agentAddress,
              tool: toolKey,
              chain_id: config.chain.chainId,
              timestamp: Math.floor(Date.now() / 1000),
              error_type: 'request/unknown_tool',
            },
          });
        }

        const tool = toolResult.value;

        context.status(200);
        return context.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tool_key: tool.key,
            base_url: tool.baseUrl,
            description: tool.description,
            paths: tool.endpoints.map((endpoint) => ({
              path: endpoint.path,
              methods: endpoint.methods,
              description: endpoint.description,
            })),
          },
          _governance: {
            request_id: requestId,
            agent: agentAddress,
            tool: tool.key,
            timestamp: Math.floor(Date.now() / 1000),
          },
        });
      }

      // Unknown method
      logger.warn({ requestId, method: request.method }, 'Unknown RPC method');
      context.status(400);
      return context.json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Unknown method: ${request.method}`,
        },
        _governance: {
          request_id: requestId,
          agent: agentAddress,
          chain_id: config.chain.chainId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'request/unknown_method',
        },
      });
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'RPC handler error');
      context.status(500);
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        _governance: {
          request_id: requestId,
          chain_id: config.chain.chainId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      });
    }
  };
}
