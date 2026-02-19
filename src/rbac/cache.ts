import type { AgentAddress, PermissionAction, Role, RoleId, ToolKey } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import type { ChainDriver } from '../chain/driver.js';
import { getLogger } from '../logging.js';

const logger = getLogger('rbac:cache');

/**
 * Role with permissions stored in Map for O(1) lookups
 * Converted from domain Role (ReadonlyArray<Permission>) for fast permission checks
 */
export type RoleWithPermissions = Readonly<{
  roleId: RoleId;
  isActive: boolean;
  permissions: ReadonlyMap<ToolKey, ReadonlySet<PermissionAction>>;
}>;

/**
 * Convert domain Role to RoleWithPermissions with Map-based permissions
 * Domain Role has ReadonlyArray<Permission>; convert to Map<ToolKey, Set<PermissionAction>>
 * for O(1) permission lookups in the hot path (middleware).
 */
function convertToRoleWithPermissions(role: Role): RoleWithPermissions {
  const permissionsMap = new Map<ToolKey, Set<PermissionAction>>();

  for (const permission of role.permissions) {
    // Create Set of actions for this tool
    const actions = new Set(permission.actions);
    permissionsMap.set(permission.tool, actions);
  }

  return {
    roleId: role.id,
    isActive: role.isActive,
    permissions: permissionsMap,
  };
}

/**
 * Permission cache with TTL
 *
 * Cache hit: return cached role without chain read
 * Cache miss: read from chain with exponential backoff retry (3 attempts, 100ms base)
 * Chain error: return ServiceError(-32022) — fail closed, never fail open
 *
 * This ensures that when the blockchain is unreachable, the proxy denies access
 * rather than accidentally granting it.
 */
export class PermissionCache {
  private cache = new Map<
    AgentAddress,
    {
      role: RoleWithPermissions;
      expiresAt: number;
    }
  >();

  private ttlSeconds: number;
  private retryConfig = { maxAttempts: 3, baseDelayMs: 100 };

  constructor(ttlSeconds: number = 300) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get role for agent (cached or from chain)
   *
   * On cache hit: return cached role immediately (O(1))
   * On cache miss: read from RBAC contract via chain driver with exponential backoff retry
   * On chain failure: return ServiceError(-32022, 503) — fail closed
   *
   * @param agent Agent wallet address
   * @param chainDriver ChainDriver for blockchain reads
   * @returns Result with RoleWithPermissions or ServiceError
   */
  async get(
    agent: AgentAddress,
    chainDriver: ChainDriver
  ): Promise<Result<RoleWithPermissions, ServiceError>> {
    // Check cache first
    const cached = this.cache.get(agent);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug({ agent }, 'Permission cache hit');
      return { ok: true, value: cached.role };
    }

    logger.debug({ agent }, 'Permission cache miss, reading from chain');

    // Cache miss: read from chain with retry
    const result = await this.readFromChainWithRetry(agent, chainDriver);

    if (!result.ok) {
      // Chain error: return as-is (fail closed)
      return result;
    }

    // Success: cache the result with expiry timestamp
    const expiresAt = Date.now() + this.ttlSeconds * 1000;
    this.cache.set(agent, { role: result.value, expiresAt });

    logger.debug({ agent, expiresAt }, 'Permission cached');

    return { ok: true, value: result.value };
  }

  /**
   * Read role from chain with exponential backoff retry
   *
   * Attempts up to `maxAttempts` times with exponential backoff:
   * delay = baseDelayMs * 2^attempt * random()
   *
   * On success: return RoleWithPermissions
   * On all failures: return ServiceError(-32022, 503) — fail closed
   *
   * @private
   */
  private async readFromChainWithRetry(
    agent: AgentAddress,
    chainDriver: ChainDriver
  ): Promise<Result<RoleWithPermissions, ServiceError>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        logger.debug({ agent, attempt }, 'Attempting to read from chain');

        // Read role from RBAC contract via chain driver
        const domainRole = await chainDriver.getRoleForAgent(agent);

        // Convert domain role to cache-internal format with Map permissions
        const cacheRole = convertToRoleWithPermissions(domainRole);

        logger.debug({ agent, attempt }, 'Chain read succeeded');

        return { ok: true, value: cacheRole };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn({ agent, attempt, error: lastError.message }, 'Chain read attempt failed');

        // Sleep before next retry (skip sleep after final attempt)
        if (attempt < this.retryConfig.maxAttempts - 1) {
          const backoffMs = this.retryConfig.baseDelayMs * Math.pow(2, attempt) * Math.random();
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries exhausted: fail closed
    logger.error(
      { agent, attempts: this.retryConfig.maxAttempts, error: lastError?.message },
      'Chain read failed after all retries'
    );

    return {
      ok: false,
      error: new ServiceError(
        'RBAC lookup failed: blockchain unavailable',
        -32022, // SERVICE_UNAVAILABLE
        503,
        'service/unavailable',
        {
          reason: 'RBAC chain lookup failed',
          attempts: this.retryConfig.maxAttempts,
          lastError: lastError?.message || 'Unknown error',
        }
      ),
    };
  }

  /**
   * Invalidate single cache entry (for testing or emergency revocation)
   */
  invalidate(agent: AgentAddress): void {
    this.cache.delete(agent);
    logger.debug({ agent }, 'Permission cache invalidated');
  }

  /**
   * Clear entire cache (useful for testing or cache flush commands)
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info({ size }, 'Permission cache cleared');
  }

  /**
   * Get cache metrics for monitoring
   * Returns: size (number of cached agents) and TTL configuration
   */
  getMetrics(): { size: number; ttlSeconds: number } {
    return { size: this.cache.size, ttlSeconds: this.ttlSeconds };
  }
}
