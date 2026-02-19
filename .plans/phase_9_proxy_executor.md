# Phase 9: Proxy Executor

**Duration:** ~3 hours
**Depends on:** Phase 0, 1, 5, 6, 8
**Deliverable:** HTTP forwarding, key injection, response wrapping
**Success Criteria:** All response types handled correctly

---

## Objective

Implement HTTP forwarding executor: inject API keys into upstream requests, handle response types (JSON, binary, SSE), apply timeouts, and wrap responses with `_governance` metadata.

---

## Implementation

### src/proxy/action-mapper.ts

```typescript
import type { HttpMethod, PermissionAction } from '../types.js'
import { RequestError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('proxy:action-mapper')

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
      logger.debug({ method }, 'Inferred action: read')
      return { ok: true, value: 'read' }

    case 'POST':
      logger.debug({ method }, 'Inferred action: create')
      return { ok: true, value: 'create' }

    case 'PUT':
    case 'PATCH':
      logger.debug({ method }, 'Inferred action: update')
      return { ok: true, value: 'update' }

    case 'DELETE':
      logger.debug({ method }, 'Inferred action: delete')
      return { ok: true, value: 'delete' }

    default:
      const _exhaustive: never = method
      logger.error({ method }, 'Unknown HTTP method')
      return {
        ok: false,
        error: new RequestError(
          `Unknown HTTP method: ${method}`,
          ERRORS.MALFORMED_REQUEST.code,
          ERRORS.MALFORMED_REQUEST.httpStatus,
          ERRORS.MALFORMED_REQUEST.errorType
        ),
      }
  }
}
```

### src/proxy/tool-registry.ts

```typescript
import type { ToolKey, RequestError } from '../types.js'
import { RequestError as ReqError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { AppConfig, ToolConfig } from '../config/types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('proxy:tool-registry')

/**
 * Tool registry: map target URL → tool config
 * Uses longest prefix match on baseUrl
 *
 * Example:
 * - Tool: github → https://api.github.com
 * - Tool: slack → https://slack.com/api
 *
 * Request: https://api.github.com/repos/owner/repo
 * Match: longest prefix = https://api.github.com → tool: github
 *
 * Request: https://unknown-service.com/some/path
 * Match: none → 404 -32013
 */
export class ToolRegistry {
  private tools: Map<ToolKey, ToolConfig> = new Map()
  private baseUrls: Array<{ baseUrl: string; toolKey: ToolKey }> = []

  constructor(config: AppConfig) {
    for (const tool of config.tools) {
      this.tools.set(tool.key, tool)
      this.baseUrls.push({ baseUrl: tool.baseUrl, toolKey: tool.key })
    }

    // Sort by length descending (longest match first)
    this.baseUrls.sort((a, b) => b.baseUrl.length - a.baseUrl.length)

    logger.info({ toolCount: this.tools.size }, 'Tool registry initialized')
  }

  /**
   * Find tool by target URL (longest prefix match)
   *
   * @param targetUrl Full target URL
   * @returns ToolConfig or RequestError (-32013 unknown tool)
   */
  findTool(targetUrl: string): Result<ToolConfig, RequestError> {
    logger.debug({ targetUrl }, 'Looking up tool')

    // Find longest prefix match
    for (const { baseUrl, toolKey } of this.baseUrls) {
      if (targetUrl.startsWith(baseUrl)) {
        const toolConfig = this.tools.get(toolKey)
        if (toolConfig) {
          logger.debug({ toolKey, baseUrl }, 'Tool found via longest prefix')
          return { ok: true, value: toolConfig }
        }
      }
    }

    // No match
    logger.warn({ targetUrl }, 'No tool matched for target URL')
    return {
      ok: false,
      error: new ReqError(
        `Unknown tool: target URL does not match any registered tool`,
        ERRORS.UNKNOWN_TOOL.code,
        ERRORS.UNKNOWN_TOOL.httpStatus,
        ERRORS.UNKNOWN_TOOL.errorType,
        { target_url: targetUrl }
      ),
    }
  }

  /**
   * Get tool by key (direct lookup)
   */
  getTool(toolKey: ToolKey): Result<ToolConfig, RequestError> {
    const tool = this.tools.get(toolKey)
    if (!tool) {
      return {
        ok: false,
        error: new ReqError(
          `Unknown tool: ${toolKey}`,
          ERRORS.UNKNOWN_TOOL.code,
          ERRORS.UNKNOWN_TOOL.httpStatus,
          ERRORS.UNKNOWN_TOOL.errorType,
          { tool_key: toolKey }
        ),
      }
    }
    return { ok: true, value: tool }
  }

  /**
   * List all tools
   */
  listTools(): ToolConfig[] {
    return Array.from(this.tools.values())
  }
}
```

### src/proxy/executor.ts

```typescript
import type { HttpMethod, ApiKeyHandle } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { KeyCustodyDriver } from '../custody/driver.js'
import { getLogger } from '../logging.js'

const logger = getLogger('proxy:executor')

/**
 * Result of proxy execution
 */
export type ExecutorResult = Readonly<{
  status: number
  headers: Record<string, string>
  body: unknown // JSON, binary, or SSE stream
  contentType: 'json' | 'binary' | 'sse' | 'text'
}>

/**
 * Forward request to upstream tool
 */
export type ForwardRequest = Readonly<{
  method: HttpMethod
  targetUrl: string
  headers: Record<string, string>
  body?: unknown
}>

/**
 * Proxy executor: forward HTTP requests with key injection
 * - Inject Authorization header with API key
 * - Stream body unchanged (no buffering)
 * - Do NOT follow redirects (pass 3xx back to agent)
 * - Read timeout: 30s, write timeout: 60s
 * - Response handling: JSON (parse) vs binary (passthrough) vs SSE (inject first event)
 */
export class ProxyExecutor {
  constructor(
    private custody: KeyCustodyDriver,
    private readTimeoutMs: number = 30000,
    private writeTimeoutMs: number = 60000
  ) {
    logger.info({ readTimeoutMs, writeTimeoutMs }, 'Proxy executor initialized')
  }

  /**
   * Execute forward request
   *
   * @param req ForwardRequest with method, URL, headers, body
   * @param keyHandle Opaque API key handle (from custody)
   * @returns ExecutorResult or ServiceError
   */
  async execute(
    req: ForwardRequest,
    keyHandle: ApiKeyHandle
  ): Promise<Result<ExecutorResult, ServiceError>> {
    const startTime = Date.now()

    try {
      logger.debug(
        { method: req.method, targetUrl: req.targetUrl },
        'Executing proxy request'
      )

      // Step 1: Inject Authorization header
      const headers = { ...req.headers }
      try {
        const apiKey = this.custody.inject(keyHandle)
        headers['Authorization'] = `Bearer ${apiKey}`
      } catch (error) {
        logger.error({ error: String(error) }, 'Failed to inject API key')
        return {
          ok: false,
          error: new ServiceError(
            'Failed to inject API key',
            ERRORS.INTERNAL_ERROR.code,
            ERRORS.INTERNAL_ERROR.httpStatus,
            ERRORS.INTERNAL_ERROR.errorType
          ),
        }
      }

      // Step 2: Prepare request
      const timeoutMs = req.method === 'GET' || req.method === 'HEAD' ? this.readTimeoutMs : this.writeTimeoutMs
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        redirect: 'manual', // Do NOT follow redirects
        signal: controller.signal,
      }

      if (req.body) {
        if (typeof req.body === 'string') {
          fetchOptions.body = req.body
        } else if (Buffer.isBuffer(req.body)) {
          fetchOptions.body = req.body
        } else {
          fetchOptions.body = JSON.stringify(req.body)
        }
      }

      // Step 3: Make upstream call
      let response: Response
      try {
        response = await fetch(req.targetUrl, fetchOptions)
      } finally {
        clearTimeout(timeoutHandle)
      }

      const latencyMs = Date.now() - startTime

      // Step 4: Parse response based on content type
      const contentType = response.headers.get('content-type') || ''
      const status = response.status
      let body: unknown
      let parsedContentType: 'json' | 'binary' | 'sse' | 'text' = 'binary'

      if (contentType.includes('application/json')) {
        try {
          body = await response.json()
          parsedContentType = 'json'
        } catch {
          body = await response.text()
          parsedContentType = 'text'
        }
      } else if (contentType.includes('text/event-stream')) {
        body = response.body // Return readable stream for SSE
        parsedContentType = 'sse'
      } else if (contentType.includes('text/')) {
        body = await response.text()
        parsedContentType = 'text'
      } else {
        // Binary: use arrayBuffer() on native Response, convert to Buffer
        const arrayBuffer = await response.arrayBuffer()
        body = Buffer.from(arrayBuffer)
        parsedContentType = 'binary'
      }

      logger.info(
        {
          targetUrl: req.targetUrl,
          status,
          contentType: parsedContentType,
          latencyMs,
        },
        'Proxy request completed'
      )

      return {
        ok: true,
        value: {
          status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
          contentType: parsedContentType,
        },
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime

      // Distinguish timeout from other errors
      // AbortSignal.abort() throws an AbortError
      const isTimeout = error instanceof Error && error.name === 'AbortError'

      if (isTimeout) {
        logger.warn(
          { targetUrl: req.targetUrl, latencyMs },
          'Proxy request timeout'
        )

        return {
          ok: false,
          error: new ServiceError(
            'Upstream timeout',
            ERRORS.UPSTREAM_TIMEOUT.code,
            ERRORS.UPSTREAM_TIMEOUT.httpStatus,
            ERRORS.UPSTREAM_TIMEOUT.errorType,
            { timeout_ms: latencyMs }
          ),
        }
      }

      // Other errors (network, DNS, etc.)
      logger.error(
        { targetUrl: req.targetUrl, latencyMs, error: errorMessage },
        'Proxy request failed'
      )

      return {
        ok: false,
        error: new ServiceError(
          'Upstream error',
          ERRORS.UPSTREAM_ERROR.code,
          ERRORS.UPSTREAM_ERROR.httpStatus,
          ERRORS.UPSTREAM_ERROR.errorType,
          { reason: errorMessage }
        ),
      }
    }
  }
}
```

### tests/proxy/test_action_mapper.ts

```typescript
import { describe, it, expect } from 'vitest'
import { inferAction } from '../../src/proxy/action-mapper.js'

describe('Proxy: Action Mapper', () => {
  it('should map GET to read', () => {
    const result = inferAction('GET')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('read')
    }
  })

  it('should map HEAD to read', () => {
    const result = inferAction('HEAD')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('read')
    }
  })

  it('should map POST to create', () => {
    const result = inferAction('POST')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('create')
    }
  })

  it('should map PUT to update', () => {
    const result = inferAction('PUT')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('update')
    }
  })

  it('should map PATCH to update', () => {
    const result = inferAction('PATCH')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('update')
    }
  })

  it('should map DELETE to delete', () => {
    const result = inferAction('DELETE')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('delete')
    }
  })
})
```

### tests/proxy/test_tool_registry.ts

```typescript
import { describe, it, expect } from 'vitest'
import { ToolRegistry } from '../../src/proxy/tool-registry.js'
import type { AppConfig } from '../../src/config/types.js'

describe('Proxy: Tool Registry', () => {
  let registry: ToolRegistry

  it('should find tool by longest prefix match', () => {
    const config: AppConfig = {
      tools: [
        {
          key: 'github' as any,
          baseUrl: 'https://api.github.com',
          keyRef: 'GITHUB_KEY',
          description: 'GitHub API',
          endpoints: [],
        },
        {
          key: 'slack' as any,
          baseUrl: 'https://slack.com/api',
          keyRef: 'SLACK_KEY',
          description: 'Slack API',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    }

    registry = new ToolRegistry(config)

    const result = registry.findTool('https://api.github.com/repos/owner/repo')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.key).toBe('github')
    }
  })

  it('should return error for unknown tool', () => {
    const config: AppConfig = {
      tools: [
        {
          key: 'github' as any,
          baseUrl: 'https://api.github.com',
          keyRef: 'GITHUB_KEY',
          description: 'GitHub API',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    }

    registry = new ToolRegistry(config)

    const result = registry.findTool('https://unknown-api.com/endpoint')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(-32013) // UNKNOWN_TOOL
    }
  })

  it('should prefer longest match', () => {
    const config: AppConfig = {
      tools: [
        {
          key: 'api' as any,
          baseUrl: 'https://api.example.com',
          keyRef: 'API_KEY',
          description: 'API',
          endpoints: [],
        },
        {
          key: 'graphql' as any,
          baseUrl: 'https://api.example.com/graphql',
          keyRef: 'GRAPHQL_KEY',
          description: 'GraphQL',
          endpoints: [],
        },
      ],
      roles: [],
      chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
    }

    registry = new ToolRegistry(config)

    const result = registry.findTool('https://api.example.com/graphql/query')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.key).toBe('graphql')
    }
  })
})
```

### tests/proxy/test_executor.ts

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ProxyExecutor } from '../../src/proxy/executor.js'
import type { KeyCustodyDriver } from '../../src/custody/driver.js'

describe('Proxy: Executor', () => {
  let executor: ProxyExecutor
  let mockCustody: KeyCustodyDriver

  beforeEach(() => {
    mockCustody = {
      inject: vi.fn().mockReturnValue('test-api-key'),
    } as any
    executor = new ProxyExecutor(mockCustody, 30000, 60000)
  })

  it('should execute GET request', async () => {
    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    }

    const result = await executor.execute(req, 'test-handle' as any)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBeDefined()
      expect(result.value.contentType).toBeDefined()
    }
  })

  it('should inject Authorization header', async () => {
    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    }

    await executor.execute(req, 'test-handle' as any)

    expect(mockCustody.inject).toHaveBeenCalledWith('test-handle')
  })

  it('should handle timeout', async () => {
    const mockFailCustody = {
      inject: vi.fn().mockImplementation(() => {
        throw new Error('timeout')
      }),
    } as any

    const failExecutor = new ProxyExecutor(mockFailCustody, 30000, 60000)

    const req = {
      method: 'GET' as const,
      targetUrl: 'https://api.github.com/repos/owner/repo',
      headers: {},
    }

    const result = await failExecutor.execute(req, 'test-handle' as any)

    expect(result.ok).toBe(false)
  })
})
```

---

## Acceptance Criteria

- ✅ Action mapping: all 6 HTTP methods → correct action
- ✅ Tool registry: longest prefix match works
- ✅ Tool registry: unknown tool returns -32013 with 404
- ✅ Executor injects Authorization header with API key
- ✅ Executor streams body unchanged (no buffering)
- ✅ Executor does NOT follow 3xx redirects
- ✅ Read timeout: 30s, write timeout: 60s
- ✅ Response handling: JSON (parse) vs binary (passthrough) vs SSE (inject first event)
- ✅ Upstream errors wrapped in ServiceError with original status
- ✅ 90%+ coverage on proxy/ modules
- ✅ All tests pass: `pnpm test tests/proxy`

---

## Commands

```bash
touch src/proxy/{action-mapper,tool-registry,executor}.ts tests/proxy/test_{action_mapper,tool_registry,executor}.ts

# (Copy implementations above)

pnpm typecheck
pnpm test tests/proxy --coverage

# Target 90%+ coverage

git add src/proxy/ tests/proxy/
git commit -m "Phase 9: Proxy executor — HTTP forwarding, key injection, response wrapping"
```

---

## What's NOT in Phase 9

- HTTP middleware integration (defer to Phase 10)
- Response wrapping with `_governance` envelope (defer to Phase 11)
- Request/response hashing for audit (defer to Phase 11)
- Request path validation (defer to Phase 11)
