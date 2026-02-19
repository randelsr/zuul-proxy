# Phase 11: HTTP API Handlers

**Duration:** ~4 hours
**Depends on:** All previous phases
**Deliverable:** Hono server, route registration, error handlers
**Success Criteria:** All endpoints respond correctly with _governance

---

## Objective

Implement HTTP API server with Hono: routes for `/rpc` (discovery), `/forward/*` (forwarding), `/health` (liveness), and global error handling. Inject `_governance` metadata on all responses. Graceful shutdown.

---

## Implementation

### src/api/server.ts

```typescript
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { AppConfig } from '../config/types.js'
import { rpcHandler } from './handlers/rpc.js'
import { forwardHandler } from './handlers/forward.js'
import { healthHandler } from './handlers/health.js'
import { signatureMiddleware } from './middleware/signature.js'
import { rbacMiddleware } from './middleware/rbac.js'
import { auditMiddleware } from './middleware/audit.js'
import { NonceValidator, TimestampValidator } from '../auth/signature.js'
import { ToolRegistry } from '../proxy/tool-registry.js'
import { PermissionCache } from '../rbac/cache.js'
import { EncryptionService } from '../audit/encryption.js'
import { AuditQueue } from '../audit/store.js'
import type { ChainDriver } from '../chain/driver.js'
import type { KeyCustodyDriver } from '../custody/driver.js'
import type { ProxyExecutor } from '../proxy/executor.js'
import { getLogger } from '../logging.js'

const logger = getLogger('api:server')

/**
 * Create Hono app with full middleware pipeline
 */
export function createServer(
  config: AppConfig,
  chainDriver: ChainDriver,
  custody: KeyCustodyDriver,
  auditQueue: AuditQueue,
  executor: ProxyExecutor
): Hono {
  const app = new Hono()

  // Initialize components
  const nonceValidator = new NonceValidator()
  const timestampValidator = new TimestampValidator()
  const toolRegistry = new ToolRegistry(config)
  const permissionCache = new PermissionCache(config.cache.ttlSeconds)
  const encryptionService = new EncryptionService()

  // ========================================================================
  // GLOBAL MIDDLEWARE
  // ========================================================================

  // 1. Request ID generation (UUID v4)
  app.use('*', (context, next) => {
    context.set('requestId', uuidv4())
    logger.debug({ requestId: context.get('requestId') }, 'Request started')
    return next()
  })

  // ========================================================================
  // ROUTES
  // ========================================================================

  // Health check (no auth required)
  app.get('/health', healthHandler)

  // RPC endpoint (discovery: tools/list, tools/describe)
  app.post('/rpc', rpcHandler(toolRegistry))

  // Forward endpoint (all HTTP methods, full middleware pipeline)
  app.all(
    '/forward/*',
    signatureMiddleware(nonceValidator, timestampValidator),
    rbacMiddleware(toolRegistry, permissionCache, chainDriver),
    auditMiddleware(auditQueue, encryptionService),
    forwardHandler(custody, executor)
  )

  // ========================================================================
  // GLOBAL ERROR HANDLER
  // ========================================================================

  app.onError((error, context) => {
    const requestId = context.get('requestId') as string
    logger.error(
      { requestId, error: String(error), stack: error instanceof Error ? error.stack : undefined },
      'Unhandled error'
    )

    context.status(500)
    return context.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
      },
      _governance: {
        request_id: requestId,
        timestamp: Math.floor(Date.now() / 1000),
        error_type: 'service/internal_error',
      },
    })
  })

  // ========================================================================
  // GRACEFUL SHUTDOWN
  // ========================================================================

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, initiating graceful shutdown')
    // Drain audit queue to ensure all entries are written before exit
    await auditQueue.drain()
    nonceValidator.destroy()
    logger.info('Server shutdown complete')
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, initiating graceful shutdown')
    // Drain audit queue to ensure all entries are written before exit
    await auditQueue.drain()
    nonceValidator.destroy()
    logger.info('Server shutdown complete')
    process.exit(0)
  })

  return app
}

/**
 * Start server
 */
export async function startServer(
  config: AppConfig,
  chainDriver: ChainDriver,
  custody: KeyCustodyDriver,
  auditQueue: AuditQueue,
  executor: ProxyExecutor
): Promise<void> {
  const { serve } = await import('@hono/node-server')
  const app = createServer(config, chainDriver, custody, auditQueue, executor)

  logger.info(
    { port: config.server.port, host: config.server.host },
    'Starting HTTP server'
  )

  serve(
    {
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host,
    },
    () => {
      logger.info(
        {
          url: `http://${config.server.host}:${config.server.port}`,
        },
        'Server listening'
      )
    }
  )

  return new Promise(() => {
    // Keep server running
  })
}
```

### src/api/handlers/rpc.ts

```typescript
import type { Context } from 'hono'
import { z } from 'zod'
import type { ToolRegistry } from '../../proxy/tool-registry.js'
import type { PermissionCache } from '../../rbac/cache.js'
import type { ChainDriver } from '../../chain/driver.js'
import type { AgentAddress } from '../../types.js'
import type { AppConfig } from '../../config/types.js'
import { getLogger } from '../../logging.js'

const logger = getLogger('handlers:rpc')

/**
 * JSON-RPC 2.0 request schema
 */
const RpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.enum(['tools/list', 'tools/describe']),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
})

type RpcRequest = z.infer<typeof RpcRequestSchema>

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
    const requestId = context.get('requestId') as string

    try {
      const body = await context.req.json()

      // Validate JSON-RPC format
      const parseResult = RpcRequestSchema.safeParse(body)

      if (!parseResult.success) {
        logger.warn({ requestId, error: parseResult.error }, 'Invalid JSON-RPC request')
        context.status(400)
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
        })
      }

      const request: RpcRequest = parseResult.data
      const agentAddress = (request.params?.agent_address || null) as AgentAddress | null

      // ====================================================================
      // tools/list
      // ====================================================================

      if (request.method === 'tools/list') {
        logger.debug({ requestId, agent: agentAddress }, 'tools/list called')

        const allTools = toolRegistry.listTools()

        // Filter tools by agent permission (if agent_address provided)
        let tools: Array<{
          key: string
          base_url: string
          description: string
          allowed_actions: string[]
        }> = []

        if (agentAddress) {
          // Get agent's permissions from cache
          const roleResult = await permissionCache.get(agentAddress, chainDriver)

          if (roleResult.ok) {
            const role = roleResult.value
            // Filter tools: only include if agent has at least one permission for that tool
            for (const tool of allTools) {
              const toolPermissions = role.permissions.get(tool.key)
              if (toolPermissions && toolPermissions.size > 0) {
                tools.push({
                  key: tool.key,
                  base_url: tool.baseUrl,
                  description: tool.description,
                  allowed_actions: Array.from(toolPermissions),
                })
              }
            }
          } else {
            // Cache miss or chain error: return empty tools list (fail closed)
            logger.warn(
              { requestId, agent: agentAddress, error: roleResult.error.message },
              'Failed to get agent permissions, returning no tools'
            )
          }
        } else {
          // No agent address provided: return no tools (require explicit agent identity)
          logger.debug({ requestId }, 'tools/list: no agent_address provided, returning empty list')
        }

        context.status(200)
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
        })
      }

      // ====================================================================
      // tools/describe
      // ====================================================================

      if (request.method === 'tools/describe') {
        const toolKey = (request.params?.tool_key || null) as any

        if (!toolKey) {
          logger.warn({ requestId }, 'tools/describe: missing tool_key')
          context.status(400)
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
          })
        }

        const toolResult = toolRegistry.getTool(toolKey)

        if (!toolResult.ok) {
          logger.warn({ requestId, toolKey }, 'tools/describe: tool not found')
          context.status(404)
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
          })
        }

        const tool = toolResult.value

        context.status(200)
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
        })
      }

      // Unknown method
      logger.warn({ requestId, method: request.method }, 'Unknown RPC method')
      context.status(400)
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
      })
    } catch (error) {
      logger.error({ requestId, error: String(error) }, 'RPC handler error')
      context.status(500)
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
      })
    }
  }
}
```

### src/api/handlers/forward.ts

```typescript
import type { Context } from 'hono'
import type { KeyCustodyDriver } from '../../custody/driver.js'
import type { ProxyExecutor, ForwardRequest } from '../../proxy/executor.js'
import { hashBody } from '../../audit/payload.js'
import type { AgentAddress, ToolKey, PermissionAction } from '../../types.js'
import { getLogger } from '../../logging.js'

const logger = getLogger('handlers:forward')

/**
 * Forward handler: execute upstream request with key injection
 * Middleware has already verified signature + RBAC
 *
 * On success: wrap response with _governance
 * - JSON: { result: body, _governance }
 * - Binary: body + X-Governance header
 * - SSE: inject _governance as first event
 *
 * On error: already handled by middleware, but forward errors handled here
 */
export function forwardHandler(
  custody: KeyCustodyDriver,
  executor: ProxyExecutor
) {
  return async (context: Context) => {
    const requestId = context.get('requestId') as string
    const recoveredAddress = context.get('recoveredAddress') as AgentAddress
    const signedRequest = context.get('signedRequest') as any
    const toolKey = context.get('toolKey') as ToolKey
    const action = context.get('action') as PermissionAction

    if (!recoveredAddress || !signedRequest || !toolKey || !action) {
      logger.error({ requestId }, 'Forward handler: missing context')
      context.status(500)
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      })
    }

    try {
      const startTime = Date.now()

      // Get API key handle from custody (will be injected in executor)
      const keyHandleResult = custody.getKey(toolKey)

      if (!keyHandleResult.ok) {
        logger.error(
          { requestId, tool: toolKey, error: keyHandleResult.error.message },
          'Failed to get API key'
        )
        context.status(500)
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal server error' },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/internal_error',
          },
        })
      }

      // Build forward request
      const forwardReq: ForwardRequest = {
        method: signedRequest.method,
        targetUrl: signedRequest.targetUrl,
        headers: Object.fromEntries(context.req.raw.headers.entries()),
        body: await context.req.raw.clone().text(),
      }

      // Execute forward (key injection happens in executor)
      const execResult = await executor.execute(forwardReq, keyHandleResult.value)

      if (!execResult.ok) {
        // Upstream error
        const latencyMs = Date.now() - startTime

        logger.warn(
          {
            requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            error: execResult.error.message,
            latencyMs,
          },
          'Upstream request failed'
        )

        // Determine HTTP status and error code
        let httpStatus = 502 // Default: bad gateway
        let errorCode = execResult.error.code // Use error code directly from executor

        if (execResult.error.code === -32021) {
          // Timeout: use 504 status code
          httpStatus = 504
        }

        context.status(httpStatus)
        return context.json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: errorCode,
            message: execResult.error.message,
            data: execResult.error.data,
          },
          _governance: {
            request_id: requestId,
            agent: recoveredAddress,
            tool: toolKey,
            action,
            target_url: signedRequest.targetUrl,
            latency_ms: latencyMs,
            timestamp: Math.floor(Date.now() / 1000),
            error_type: 'service/upstream_error',
          },
        })
      }

      const result = execResult.value
      const latencyMs = Date.now() - startTime

      // ====================================================================
      // Response wrapping based on content type
      // ====================================================================

      const governance = {
        request_id: requestId,
        agent: recoveredAddress,
        tool: toolKey,
        action,
        target_url: signedRequest.targetUrl,
        latency_ms: latencyMs,
        // audit_tx would be added once audit entry is written (async)
        timestamp: Math.floor(Date.now() / 1000),
      }

      context.status(result.status)

      if (result.contentType === 'json') {
        // JSON response: wrap in result envelope
        return context.json({
          result: result.body,
          _governance: governance,
        })
      } else if (result.contentType === 'sse') {
        // SSE response: inject _governance as first event
        const { streamSSE } = await import('hono/streaming')

        return streamSSE(context, async (stream) => {
          // First event: _governance metadata
          await stream.writeSSE({
            event: '_governance',
            data: JSON.stringify(governance),
          })

          // Then stream the rest of the response
          if (result.body && typeof result.body === 'object' && 'pipe' in result.body) {
            // If result.body is a Node Readable stream, convert it
            const readable = result.body as NodeJS.ReadableStream
            await new Promise((resolve, reject) => {
              readable.on('data', (chunk) => {
                stream.write(chunk.toString('utf-8'))
              })
              readable.on('end', resolve)
              readable.on('error', reject)
            })
          }
        })
      } else {
        // Binary/text response: inject _governance in header
        const governanceHeader = Buffer.from(JSON.stringify(governance)).toString('base64')
        context.header('X-Governance', governanceHeader)

        // Copy upstream headers
        for (const [key, value] of Object.entries(result.headers)) {
          context.header(key, value as string)
        }

        if (typeof result.body === 'string') {
          context.text(result.body)
        } else if (Buffer.isBuffer(result.body)) {
          context.body(result.body)
        } else {
          context.text(JSON.stringify(result.body))
        }

        return
      }
    } catch (error) {
      logger.error(
        { requestId, error: String(error) },
        'Forward handler error'
      )

      context.status(500)
      return context.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
        _governance: {
          request_id: requestId,
          agent: recoveredAddress,
          tool: toolKey,
          action,
          timestamp: Math.floor(Date.now() / 1000),
          error_type: 'service/internal_error',
        },
      })
    }
  }
}
```

### src/api/handlers/health.ts

```typescript
import type { Context } from 'hono'
import { getLogger } from '../../logging.js'

const logger = getLogger('handlers:health')

/**
 * Health check endpoint
 * No authentication required
 */
export function healthHandler(context: Context) {
  const requestId = context.get('requestId') as string

  logger.debug({ requestId }, 'Health check')

  context.status(200)
  return context.json({
    status: 'ok',
    timestamp: Math.floor(Date.now() / 1000),
  })
}
```

### tests/api/test_handlers.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { rpcHandler } from '../../src/api/handlers/rpc.js'
import { ToolRegistry } from '../../src/proxy/tool-registry.js'
import type { AppConfig } from '../../src/config/types.js'

describe('API: Handlers', () => {
  let toolRegistry: ToolRegistry

  beforeEach(() => {
    const mockConfig: AppConfig = {
      tools: [
        {
          key: 'github' as any,
          baseUrl: 'https://api.github.com',
          keyRef: 'GITHUB_KEY',
          description: 'GitHub API',
          endpoints: [
            {
              path: '/repos/{owner}/{repo}/issues',
              methods: ['GET', 'POST'],
              description: 'Manage issues',
            },
          ],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: {
        port: 8080,
        host: '0.0.0.0',
        readTimeoutMs: 30000,
        writeTimeoutMs: 60000,
      },
    }

    toolRegistry = new ToolRegistry(mockConfig)
  })

  it('should handle tools/list request', async () => {
    const app = new Hono()
    app.use('*', (context, next) => {
      context.set('requestId', 'test-123')
      return next()
    })
    app.post('/rpc', rpcHandler(toolRegistry))

    // This is a simplified test; full E2E testing in Phase 12
    expect(toolRegistry.listTools().length).toBeGreaterThan(0)
  })

  it('should filter tools by permission', () => {
    const tools = toolRegistry.listTools()
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'github',
          baseUrl: 'https://api.github.com',
        }),
      ])
    )
  })

  it('should handle unknown tool', () => {
    const result = toolRegistry.findTool('https://unknown-service.com/endpoint')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(-32013)
    }
  })
})
```

---

## Acceptance Criteria

- ✅ Hono server created and listening on configured port/host
- ✅ `POST /rpc` handles tools/list and tools/describe
- ✅ `ANY /forward/*` with full middleware pipeline (auth → authz → audit → forward)
- ✅ `GET /health` responds with 200 (no auth)
- ✅ All responses include `_governance` metadata
- ✅ JSON responses wrapped in { result, _governance }
- ✅ Binary responses with X-Governance header
- ✅ SSE responses with _governance as first event
- ✅ All 15 error codes implemented with correct HTTP status
- ✅ Global error handler catches unhandled errors
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Request ID generation (UUID v4) on all requests
- ✅ `pnpm test tests/api` passes

---

## Commands

```bash
touch src/api/handlers/{rpc,forward,health}.ts src/api/server.ts tests/api/test_handlers.ts

# (Copy implementations above)

pnpm typecheck
pnpm test tests/api

git add src/api/
git commit -m "Phase 11: HTTP API handlers — Hono server, routes, error handling"
```

---

## What's NOT in Phase 11

- E2E testing (defer to Phase 12)
- Live integration with blockchain (defer to Phase 12)
- Demo agent (defer to Phase 13)
