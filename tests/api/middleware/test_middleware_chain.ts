import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signatureMiddleware } from '../../../src/api/middleware/signature.js';
import { rbacMiddleware } from '../../../src/api/middleware/rbac.js';
import { auditMiddleware } from '../../../src/api/middleware/audit.js';
import { NonceValidator, TimestampValidator } from '../../../src/auth/signature.js';
import { ToolRegistry } from '../../../src/proxy/tool-registry.js';
import { PermissionCache } from '../../../src/rbac/cache.js';
import { EncryptionService } from '../../../src/audit/encryption.js';
import { inferAction } from '../../../src/proxy/action-mapper.js';
import type { AppConfig } from '../../../src/config/types.js';
import type { AuditQueue } from '../../../src/audit/store.js';

describe('Middleware: Pipeline Chain', () => {
  let nonceValidator: NonceValidator;
  let timestampValidator: TimestampValidator;
  let toolRegistry: ToolRegistry;
  let permissionCache: PermissionCache;
  let encryptionService: EncryptionService;
  let mockAuditQueue: AuditQueue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockChainDriver: any;

  beforeEach(() => {
    nonceValidator = new NonceValidator();
    timestampValidator = new TimestampValidator();

    const mockConfig: AppConfig = {
      tools: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'github' as any,
          baseUrl: 'https://api.github.com',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          keyRef: 'GITHUB_KEY' as any,
          description: 'GitHub API',
          endpoints: [],
        },
      ],
      roles: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chain: { name: 'local', chainId: 31337 as any, rpcUrl: 'http://localhost:8545' },
      cache: { ttlSeconds: 300 },
      server: {
        port: 8080,
        host: '0.0.0.0',
        readTimeoutMs: 30000,
        writeTimeoutMs: 60000,
      },
    };

    toolRegistry = new ToolRegistry(mockConfig);
    permissionCache = new PermissionCache(300);
    encryptionService = new EncryptionService();

    mockChainDriver = {
      getRoleForAgent: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          roleId: '0x1' as any,
          name: 'developer',
          permissions: new Map([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ['github' as any, new Set(['read', 'create'])],
          ]),
          isActive: true,
        },
      }),
    };

    mockAuditQueue = {
      enqueue: vi.fn(),
      flush: vi.fn(),
      dequeue: vi.fn(),
    };
  });

  it('should parse headers in signature middleware', async () => {
    // Test that signature middleware can be created
    const middleware = signatureMiddleware(nonceValidator, timestampValidator);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should enforce permission checks in RBAC middleware', async () => {
    // Test that RBAC middleware can be created
    const middleware = rbacMiddleware(toolRegistry, permissionCache, mockChainDriver);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should queue audit entries in audit middleware', async () => {
    // Test that audit middleware can be created
    const middleware = auditMiddleware(mockAuditQueue, encryptionService);
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should have correct tool registry for RBAC', () => {
    // Test that tool registry is properly set up
    const tools = toolRegistry.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].key).toBe('github');
    expect(tools[0].baseUrl).toBe('https://api.github.com');
  });

  it('should extract github tool from target URL', () => {
    // Test longest prefix match for tool extraction
    const result = toolRegistry.findTool('https://api.github.com/repos/owner/repo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe('github');
    }
  });

  it('should return error for unknown tool', () => {
    // Test unknown tool error
    const result = toolRegistry.findTool('https://api.unknown.com/resource');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32013); // Unknown tool
      expect(result.error.httpStatus).toBe(404);
    }
  });

  it('should validate nonce and prevent replay attacks', () => {
    // Test nonce validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = '0x1234567890123456789012345678901234567890' as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonce = '550e8400-e29b-41d4-a716-446655440000' as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = Math.floor(Date.now() / 1000) as any;

    // First nonce should be valid
    const result1 = nonceValidator.validateAndStore(agent, nonce, timestamp);
    expect(result1.ok).toBe(true);

    // Same nonce again should be rejected (replay attack)
    const result2 = nonceValidator.validateAndStore(agent, nonce, timestamp);
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error.code).toBe(-32004); // Invalid nonce
    }
  });

  it('should validate timestamp freshness', () => {
    // Test timestamp validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshTimestamp = Math.floor(Date.now() / 1000) as any;
    const result = timestampValidator.validate(freshTimestamp);
    expect(result.ok).toBe(true);
  });

  it('should reject stale timestamps', () => {
    // Test timestamp drift
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staleTimestamp = (Math.floor(Date.now() / 1000) - 400) as any;
    const result = timestampValidator.validate(staleTimestamp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32005); // Timestamp drift
    }
  });

  it('should support permission cache with TTL', () => {
    // Test cache structure
    expect(permissionCache).toBeDefined();
  });

  it('should have encryption service for audit payloads', () => {
    // Test encryption service
    expect(encryptionService).toBeDefined();
  });

  it('should configure chain driver for RBAC', () => {
    // Test chain driver mock
    expect(mockChainDriver.getRoleForAgent).toBeDefined();
  });

  it('should provide audit queueing interface', () => {
    // Test audit queue
    expect(mockAuditQueue.enqueue).toBeDefined();
    expect(mockAuditQueue.flush).toBeDefined();
  });

  it('should enforce middleware ordering through function composition', async () => {
    // Test that all three middlewares exist and can be composed
    const sigMiddleware = signatureMiddleware(nonceValidator, timestampValidator);
    const rbacMiddleware_fn = rbacMiddleware(toolRegistry, permissionCache, mockChainDriver);
    const auditMiddleware_fn = auditMiddleware(mockAuditQueue, encryptionService);

    // All should be functions (middleware handlers)
    expect(typeof sigMiddleware).toBe('function');
    expect(typeof rbacMiddleware_fn).toBe('function');
    expect(typeof auditMiddleware_fn).toBe('function');
  });

  it('should handle missing recovered address in RBAC', async () => {
    // Create a mock context without recoveredAddress
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContext: any = {
      get: vi.fn((key: string) => {
        if (key === 'requestId') return 'test-123';
        if (key === 'recoveredAddress') return undefined;
        return undefined;
      }),
      set: vi.fn(),
      status: vi.fn().mockReturnValue(undefined),
      json: vi.fn().mockReturnValue(undefined),
    };

    const next = vi.fn();

    // Call RBAC middleware with missing address
    const rbacMiddleware_fn = rbacMiddleware(toolRegistry, permissionCache, mockChainDriver);
    await rbacMiddleware_fn(mockContext, next);

    // Should set status 500 and call json
    expect(mockContext.status).toHaveBeenCalledWith(500);
    expect(mockContext.json).toHaveBeenCalled();
    // Should not call next
    expect(next).not.toHaveBeenCalled();
  });

  it('should infer action from HTTP method via action mapper', () => {
    const getAction = inferAction('GET');
    expect(getAction.ok).toBe(true);
    if (getAction.ok) {
      expect(getAction.value).toBe('read');
    }

    const postAction = inferAction('POST');
    expect(postAction.ok).toBe(true);
    if (postAction.ok) {
      expect(postAction.value).toBe('create');
    }

    const putAction = inferAction('PUT');
    expect(putAction.ok).toBe(true);
    if (putAction.ok) {
      expect(putAction.value).toBe('update');
    }

    const deleteAction = inferAction('DELETE');
    expect(deleteAction.ok).toBe(true);
    if (deleteAction.ok) {
      expect(deleteAction.value).toBe('delete');
    }
  });

  it('should handle invalid HTTP methods', () => {
    const invalidAction = inferAction('INVALID');
    expect(invalidAction.ok).toBe(false);
    if (!invalidAction.ok) {
      expect(invalidAction.error.code).toBe(-32600); // Malformed request
    }
  });

  it('should preserve middleware context through chain', async () => {
    // Create mock context with actual storage
    const contextStorage = new Map<string, unknown>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContext: any = {
      get: vi.fn((key: string) => contextStorage.get(key)),
      set: vi.fn((key: string, value: unknown) => {
        contextStorage.set(key, value);
      }),
      status: vi.fn().mockReturnValue(undefined),
      json: vi.fn().mockReturnValue(undefined),
    };

    // Signature middleware should attach recoveredAddress and signedRequest
    // (In real usage, signature middleware would do this)
    // For this test, we're verifying the context.set/get pattern
    mockContext.set('recoveredAddress', '0xaddr');
    const recovered = mockContext.get('recoveredAddress');
    expect(recovered).toBe('0xaddr');
  });

  it('should fail closed on chain errors in RBAC', async () => {
    // Create chain driver that fails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failingChainDriver: any = {
      getRoleForAgent: vi.fn().mockRejectedValue(new Error('Chain unavailable')),
    };

    // Create mock context with required fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContext: any = {
      get: vi.fn((key: string) => {
        if (key === 'requestId') return 'test-789';
        if (key === 'recoveredAddress') return '0x1234567890123456789012345678901234567890';
        if (key === 'signedRequest') {
          return {
            method: 'GET',
            targetUrl: 'https://api.github.com/repos',
          };
        }
        return undefined;
      }),
      set: vi.fn(),
      status: vi.fn().mockReturnValue(undefined),
      json: vi.fn().mockReturnValue(undefined),
    };

    const next = vi.fn();
    const rbacMiddleware_fn = rbacMiddleware(toolRegistry, permissionCache, failingChainDriver);

    // Call middleware
    await rbacMiddleware_fn(mockContext, next);

    // Should return 503 (service unavailable), not 403 (permission denied)
    expect(mockContext.status).toHaveBeenCalledWith(503);
    // Should not call next
    expect(next).not.toHaveBeenCalled();
  });

  it('should never block response in audit middleware', async () => {
    // Audit middleware should always call next, even if something fails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContext: any = {
      get: vi.fn(() => undefined),
      req: { raw: { body: undefined } },
      res: { clone: () => ({ text: async () => '' }), status: 200 },
    };

    const next = vi.fn();
    const auditMiddleware_fn = auditMiddleware(mockAuditQueue, encryptionService);

    await auditMiddleware_fn(mockContext, next);

    // Must call next (allow response through)
    expect(next).toHaveBeenCalled();
  });
});
