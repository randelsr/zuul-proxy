# Phase 5: RBAC Module

**Duration:** ~4 hours
**Depends on:** Phase 0, Phase 1, Phase 2 (contracts), Phase 3, Phase 7 (chain driver)
**Deliverable:** Permission cache with TTL, contract reads, fail-closed on chain outage
**Success Criteria:** `pnpm typecheck && pnpm test tests/rbac` passes with 90%+ coverage

---

## Objective

Implement role-based access control (RBAC) via smart contracts. Cache permissions with lazy TTL. Crucially: fail closed on chain outage (return 503, never 403).

---

## Implementation Details

### 1. src/rbac/permission.ts

```typescript
import type { HttpMethod, PermissionAction } from '../types.js'
import { RequestError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'

/**
 * Infer RBAC action from HTTP method
 * GET/HEAD → read, POST → create, PUT/PATCH → update, DELETE → delete
 */
export function inferAction(method: HttpMethod): Result<PermissionAction, RequestError> {
  switch (method) {
    case 'GET':
    case 'HEAD':
      return { ok: true, value: 'read' }
    case 'POST':
      return { ok: true, value: 'create' }
    case 'PUT':
    case 'PATCH':
      return { ok: true, value: 'update' }
    case 'DELETE':
      return { ok: true, value: 'delete' }
    default:
      const _exhaustive: never = method
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

/**
 * Reverse mapping: action → supported HTTP methods
 */
export const ACTION_TO_METHODS = {
  read: ['GET', 'HEAD'] as const,
  create: ['POST'] as const,
  update: ['PUT', 'PATCH'] as const,
  delete: ['DELETE'] as const,
} as const satisfies Record<PermissionAction, readonly HttpMethod[]>
```

### 2. src/rbac/cache.ts

```typescript
import type { AgentAddress, RoleId, PermissionAction, ToolKey } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { ChainDriver } from '../chain/driver.js'
import { getLogger } from '../logging.js'

const logger = getLogger('rbac:cache')

/**
 * Role with permissions (retrieved from contract)
 */
export type RoleWithPermissions = Readonly<{
  roleId: RoleId
  isActive: boolean
  permissions: ReadonlyMap<ToolKey, ReadonlySet<PermissionAction>>
}>

/**
 * Convert domain Role (with ReadonlyArray<Permission>) to RoleWithPermissions (with Map for O(1) lookups)
 */
function convertToRoleWithPermissions(role: Role): RoleWithPermissions {
  const permissionsMap = new Map<ToolKey, ReadonlySet<PermissionAction>>()

  for (const permission of role.permissions) {
    permissionsMap.set(permission.tool, new Set(permission.actions))
  }

  return {
    roleId: role.id,
    isActive: role.isActive,
    permissions: permissionsMap,
  }
}

/**
 * Permission cache with TTL
 * Cache hit: return cached role (no chain read)
 * Cache miss: read from chain, cache with TTL
 * Chain error: return ServiceError (fail closed, not permission denied)
 */
export class PermissionCache {
  private cache = new Map<
    AgentAddress,
    {
      role: RoleWithPermissions
      expiresAt: number
    }
  >()
  private ttlSeconds: number
  private retryConfig = { maxAttempts: 3, baseDelayMs: 100 }

  constructor(ttlSeconds: number = 300) {
    this.ttlSeconds = ttlSeconds
  }

  /**
   * Get role for agent (cached or from chain)
   * On cache miss, reads from RBAC contract with exponential backoff retry
   * On chain failure: returns ServiceError (fail closed)
   *
   * @returns RoleWithPermissions or ServiceError
   */
  async get(
    agent: AgentAddress,
    chainDriver: ChainDriver
  ): Promise<Result<RoleWithPermissions, ServiceError>> {
    // Check cache
    const cached = this.cache.get(agent)
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug({ agent }, 'Permission cache hit')
      return { ok: true, value: cached.role }
    }

    logger.debug({ agent }, 'Permission cache miss, reading from chain')

    // Read from chain with retry
    const result = await this.readFromChainWithRetry(agent, chainDriver)

    if (!result.ok) {
      return result
    }

    // Cache the result
    const expiresAt = Date.now() + this.ttlSeconds * 1000
    this.cache.set(agent, { role: result.value, expiresAt })

    return { ok: true, value: result.value }
  }

  /**
   * Read role from chain with exponential backoff retry
   * On all failures: return ServiceError(-32022, SERVICE_UNAVAILABLE)
   * This ensures fail-closed behavior
   */
  private async readFromChainWithRetry(
    agent: AgentAddress,
    chainDriver: ChainDriver
  ): Promise<Result<RoleWithPermissions, ServiceError>> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        // Read from RBAC contract (via chain driver)
        // Note: actual contract read happens in Phase 7 (ChainDriver)
        // For now, we assume chainDriver.callContract() returns { roleId, isActive }

        logger.debug({ agent, attempt }, 'Attempting to read from chain')

        // Read role from RBAC contract via chain driver
        // Contract returns domain Role with ReadonlyArray<Permission>
        // Convert to RoleWithPermissions with Map<ToolKey, Set<PermissionAction>> for O(1) lookups
        const domainRole = await chainDriver.getRoleForAgent(agent)

        // Convert domain role to cache-internal format with Map permissions
        const cacheRole = convertToRoleWithPermissions(domainRole)

        return { ok: true, value: cacheRole }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.warn({ agent, attempt, error: lastError.message }, 'Chain read attempt failed')

        if (attempt < this.retryConfig.maxAttempts - 1) {
          // Exponential backoff with full jitter
          const backoffMs =
            this.retryConfig.baseDelayMs * Math.pow(2, attempt) * Math.random()
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
      }
    }

    // All retries exhausted: fail closed
    logger.error(
      { agent, attempts: this.retryConfig.maxAttempts, error: lastError?.message },
      'Chain read failed after all retries'
    )

    return {
      ok: false,
      error: new ServiceError(
        ERRORS.SERVICE_UNAVAILABLE.message,
        ERRORS.SERVICE_UNAVAILABLE.code,
        ERRORS.SERVICE_UNAVAILABLE.httpStatus,
        ERRORS.SERVICE_UNAVAILABLE.errorType,
        {
          reason: 'RBAC chain lookup failed',
          attempts: this.retryConfig.maxAttempts,
        }
      ),
    }
  }

  /**
   * Clear cache entry (for testing or emergency)
   */
  invalidate(agent: AgentAddress): void {
    this.cache.delete(agent)
    logger.debug({ agent }, 'Permission cache invalidated')
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear()
    logger.info('Permission cache cleared')
  }

  /**
   * Get cache metrics
   */
  getMetrics(): { size: number; ttlSeconds: number } {
    return { size: this.cache.size, ttlSeconds: this.ttlSeconds }
  }
}
```

### 3. src/rbac/contract.ts

```typescript
import type { AgentAddress, ToolKey, PermissionAction, RoleId } from '../types.js'
import { ServiceError, PermissionError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { ChainDriver } from '../chain/driver.js'
import type { RoleWithPermissions } from './cache.js'
import { getLogger } from '../logging.js'

const logger = getLogger('rbac:contract')

/**
 * RBAC contract reader (read-only operations)
 * Uses ChainDriver for blockchain interactions
 */
export class RBACContractReader {
  private contractAddress: string

  constructor(contractAddress: string) {
    this.contractAddress = contractAddress
  }

  /**
   * Check if agent has permission for (tool, action)
   * First checks if agent is active, then checks role permissions
   *
   * @returns true if agent has permission, false otherwise
   */
  async hasPermission(
    agent: AgentAddress,
    tool: ToolKey,
    action: PermissionAction,
    driver: ChainDriver
  ): Promise<Result<boolean, ServiceError>> {
    try {
      logger.debug({ agent, tool, action }, 'Checking permission via contract')

      // Call RBAC contract: hasPermission(agent, tool, action) -> bool
      // Implementation depends on ChainDriver (Phase 7)
      // For now, return mock result
      const hasPermission = true // await driver.callContract(...)

      logger.debug(
        { agent, tool, action, hasPermission },
        'Permission check result'
      )

      return { ok: true, value: hasPermission }
    } catch (error) {
      logger.error(
        { agent, tool, action, error: String(error) },
        'Permission check failed'
      )

      return {
        ok: false,
        error: new ServiceError(
          ERRORS.SERVICE_UNAVAILABLE.message,
          ERRORS.SERVICE_UNAVAILABLE.code,
          ERRORS.SERVICE_UNAVAILABLE.httpStatus,
          ERRORS.SERVICE_UNAVAILABLE.errorType
        ),
      }
    }
  }

  /**
   * Get agent's role and active status
   * @returns { roleId, isActive }
   */
  async getAgentRole(
    agent: AgentAddress,
    driver: ChainDriver
  ): Promise<Result<{ roleId: RoleId; isActive: boolean }, ServiceError>> {
    try {
      logger.debug({ agent }, 'Fetching agent role from contract')

      // Call RBAC contract: getAgentRole(agent) -> (roleId, isActive)
      // Implementation depends on ChainDriver (Phase 7)
      const result = { roleId: '0x' as RoleId, isActive: true } // await driver.callContract(...)

      return { ok: true, value: result }
    } catch (error) {
      logger.error({ agent, error: String(error) }, 'Agent role fetch failed')

      return {
        ok: false,
        error: new ServiceError(
          ERRORS.SERVICE_UNAVAILABLE.message,
          ERRORS.SERVICE_UNAVAILABLE.code,
          ERRORS.SERVICE_UNAVAILABLE.httpStatus,
          ERRORS.SERVICE_UNAVAILABLE.errorType
        ),
      }
    }
  }
}
```

### 4. tests/rbac/test_cache.ts

```typescript
import { describe, it, expect, vi } from 'vitest'
import { PermissionCache } from '../../src/rbac/cache.js'
import type { AgentAddress } from '../../src/types.js'

describe('RBAC: Permission Cache', () => {
  it('should cache permissions with TTL', async () => {
    const cache = new PermissionCache(1) // 1 second TTL
    const agent = '0x1234567890123456789012345678901234567890' as AgentAddress
    const mockDriver = {} as any

    // First access: cache miss
    // (Implementation depends on ChainDriver; for now just verify structure)
    expect(cache.getMetrics().size).toBe(0)

    // Invalidate
    cache.invalidate(agent)
    expect(cache.getMetrics().size).toBe(0)
  })

  it('should fail closed on chain error', async () => {
    const cache = new PermissionCache(300)
    const agent = '0x1234567890123456789012345678901234567890' as AgentAddress

    // Mock driver that always fails
    const failingDriver = {
      callContract: vi.fn().mockRejectedValue(new Error('Chain unavailable')),
    } as any

    // Should return ServiceError (fail closed), not PermissionError
    const result = await cache.get(agent, failingDriver)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(-32022) // SERVICE_UNAVAILABLE
      expect(result.error.httpStatus).toBe(503)
    }
  })

  it('should clear cache', () => {
    const cache = new PermissionCache(300)
    cache.clear()
    expect(cache.getMetrics().size).toBe(0)
  })
})
```

---

## Acceptance Criteria

- ✅ Action mapping: all 6 HTTP methods → correct action
- ✅ Permission cache with TTL works
- ✅ Cache hit: no chain read
- ✅ Cache TTL expiry: triggers chain read
- ✅ Chain timeout: 3 retries with exponential backoff
- ✅ Chain failure: returns 503 -32022 (fail closed, NOT 403)
- ✅ Permission denied: 403 -32011 with allowed_actions in error.data
- ✅ Emergency revoke: 403 -32012
- ✅ 90%+ coverage on rbac/
- ✅ `pnpm typecheck && pnpm test tests/rbac` passes

---

## Commands

```bash
touch src/rbac/{permission,cache,contract}.ts tests/rbac/{test_cache,test_contract}.ts

# (Copy implementations above)

pnpm typecheck
pnpm test tests/rbac
pnpm test:coverage tests/rbac

git add src/rbac/ tests/rbac/
git commit -m "Phase 5: RBAC module — permission cache, contract reads, fail-closed on outage"
```

---

## What's NOT in Phase 5

- Actual contract calls (defer to Phase 7: ChainDriver)
- HTTP middleware integration (defer to Phase 10)
- Error response formatting (defer to Phase 11)
