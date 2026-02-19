import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionCache } from '../../src/rbac/cache.js';
import type { AgentAddress, Role, RoleId, ToolKey } from '../../src/types.js';
import type { ChainDriver } from '../../src/chain/driver.js';
import { ServiceError } from '../../src/errors.js';

/**
 * Create a mock ChainDriver for testing
 */
function createMockChainDriver(): ChainDriver {
  return {
    callContract: vi.fn().mockRejectedValue(new Error('Not implemented')),
    writeContract: vi.fn().mockRejectedValue(new Error('Not implemented')),
    getChainId: () => 31337,
    getRpcUrl: () => 'http://localhost:8545',
    getRoleForAgent: vi.fn().mockResolvedValue({
      id: ('0x' + '0'.repeat(64)) as RoleId,
      name: 'Default Role',
      permissions: [],
      isActive: true,
    } as Role),
  };
}

/**
 * Create a sample role for testing
 */
function createMockRole(overrides?: Partial<Role>): Role {
  return {
    id: ('0x' + '1'.repeat(64)) as RoleId,
    name: 'Developer',
    permissions: [
      {
        tool: 'github' as unknown as ToolKey,
        actions: ['read', 'create'] as const,
      },
      {
        tool: 'slack' as unknown as ToolKey,
        actions: ['read'] as const,
      },
    ],
    isActive: true,
    ...overrides,
  };
}

describe('RBAC: Permission Cache', () => {
  let cache: PermissionCache;
  let mockDriver: ChainDriver;
  const testAgent = ('0x' + '1'.repeat(40)) as AgentAddress;

  beforeEach(() => {
    cache = new PermissionCache(300); // 5-minute TTL
    mockDriver = createMockChainDriver();
  });

  describe('cache hit/miss', () => {
    it('should return role on cache miss (first access)', async () => {
      const mockRole = createMockRole();
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValueOnce(mockRole);

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roleId).toBe(mockRole.id);
        expect(result.value.isActive).toBe(true);
      }
      expect(cache.getMetrics().size).toBe(1);
    });

    it('should return cached role on cache hit (no chain call)', async () => {
      const mockRole = createMockRole();
      const mockGetRole = vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      // First call: cache miss
      const result1 = await cache.get(testAgent, mockDriver);
      expect(result1.ok).toBe(true);
      expect(mockGetRole).toHaveBeenCalledTimes(1);

      // Second call: cache hit (no new chain call)
      const result2 = await cache.get(testAgent, mockDriver);
      expect(result2.ok).toBe(true);
      expect(mockGetRole).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should re-read from chain when cache expires', async () => {
      const cache = new PermissionCache(1); // 1-second TTL
      const mockRole = createMockRole();
      const mockGetRole = vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      // First call: cache miss
      const result1 = await cache.get(testAgent, mockDriver);
      expect(result1.ok).toBe(true);
      expect(mockGetRole).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call: TTL expired, should re-read
      const result2 = await cache.get(testAgent, mockDriver);
      expect(result2.ok).toBe(true);
      expect(mockGetRole).toHaveBeenCalledTimes(2); // Called again after expiry
    });
  });

  describe('retry logic (exponential backoff)', () => {
    it('should retry 3 times on chain error', async () => {
      const mockGetRole = vi
        .spyOn(mockDriver, 'getRoleForAgent')
        .mockRejectedValue(new Error('Chain unavailable'));

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32022); // SERVICE_UNAVAILABLE
        expect(result.error.httpStatus).toBe(503);
        expect(mockGetRole).toHaveBeenCalledTimes(3); // 3 attempts
      }
    });

    it('should return ServiceError (fail-closed), never permission denied', async () => {
      vi.spyOn(mockDriver, 'getRoleForAgent').mockRejectedValue(new Error('Network timeout'));

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error instanceof ServiceError).toBe(true);
        expect(result.error.code).toBe(-32022);
        expect(result.error.httpStatus).toBe(503);
      }
    });

    it('should succeed if chain recovers on retry', async () => {
      const mockRole = createMockRole();
      let callCount = 0;
      const mockGetRole = vi.spyOn(mockDriver, 'getRoleForAgent').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary error');
        }
        return mockRole;
      });

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(true); // Succeeds on second attempt
      if (result.ok) {
        expect(result.value.roleId).toBe(mockRole.id);
      }
      expect(mockGetRole).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache invalidation', () => {
    it('should remove entry from cache on invalidate', async () => {
      const mockRole = createMockRole();
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      // Populate cache
      await cache.get(testAgent, mockDriver);
      expect(cache.getMetrics().size).toBe(1);

      // Invalidate
      cache.invalidate(testAgent);
      expect(cache.getMetrics().size).toBe(0);
    });

    it('should clear entire cache on clear()', async () => {
      const agent1 = ('0x' + '1'.repeat(40)) as AgentAddress;
      const agent2 = ('0x' + '2'.repeat(40)) as AgentAddress;
      const mockRole = createMockRole();

      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      // Populate with 2 agents
      await cache.get(agent1, mockDriver);
      await cache.get(agent2, mockDriver);
      expect(cache.getMetrics().size).toBe(2);

      // Clear all
      cache.clear();
      expect(cache.getMetrics().size).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should report correct cache metrics', async () => {
      const mockRole = createMockRole();
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      expect(cache.getMetrics().size).toBe(0);
      expect(cache.getMetrics().ttlSeconds).toBe(300);

      await cache.get(testAgent, mockDriver);

      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(1);
      expect(metrics.ttlSeconds).toBe(300);
    });
  });

  describe('permission lookup (O(1) via Map)', () => {
    it('should support O(1) permission lookups via Map', async () => {
      const mockRole = createMockRole();
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValue(mockRole);

      const result = await cache.get(testAgent, mockDriver);

      if (result.ok) {
        // Verify Map structure
        expect(result.value.permissions instanceof Map).toBe(true);
        const githubPerms = result.value.permissions.get('github' as unknown as ToolKey);
        expect(githubPerms).toBeDefined();
        expect(githubPerms?.has('read')).toBe(true);
        expect(githubPerms?.has('create')).toBe(true);

        const slackPerms = result.value.permissions.get('slack' as unknown as ToolKey);
        expect(slackPerms).toBeDefined();
        expect(slackPerms?.has('read')).toBe(true);
      }
    });
  });

  describe('inactive agent handling', () => {
    it('should return inactive flag correctly', async () => {
      const inactiveRole = createMockRole({ isActive: false });
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValueOnce(inactiveRole);

      const result = await cache.get(testAgent, mockDriver);

      if (result.ok) {
        expect(result.value.isActive).toBe(false);
      }
    });

    it('should preserve role data through cache', async () => {
      const testRole = createMockRole({
        id: ('0xcustom' + '0'.repeat(58)) as RoleId,
        name: 'Custom Role',
      });
      vi.spyOn(mockDriver, 'getRoleForAgent').mockResolvedValueOnce(testRole);

      const result = await cache.get(testAgent, mockDriver);

      if (result.ok) {
        expect(result.value.roleId).toBe(testRole.id);
      }
    });
  });

  describe('error details and context', () => {
    it('should include contextual error data on chain failure', async () => {
      vi.spyOn(mockDriver, 'getRoleForAgent').mockRejectedValue(new Error('RPC timeout'));

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.data?.lastError).toBe('RPC timeout');
        expect(result.error.data?.attempts).toBe(3);
        expect(result.error.data?.reason).toBe('RBAC chain lookup failed');
      }
    });

    it('should track attempt count in error data', async () => {
      vi.spyOn(mockDriver, 'getRoleForAgent').mockRejectedValue(new Error('Network error'));

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.data?.attempts).toBe(3);
      }
    });

    it('should maintain fail-closed semantics with ServiceError', async () => {
      vi.spyOn(mockDriver, 'getRoleForAgent').mockRejectedValue(new Error('Chain down'));

      const result = await cache.get(testAgent, mockDriver);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Must be ServiceError (503), never PermissionError (403)
        expect(result.error.httpStatus).toBe(503);
        expect(result.error.code).toBe(-32022);
        expect(result.error.errorType).toBe('service/unavailable');
      }
    });
  });
});
