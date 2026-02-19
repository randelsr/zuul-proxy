import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rpcHandler } from '../../src/api/handlers/rpc.js';
import { healthHandler } from '../../src/api/handlers/health.js';
import { ToolRegistry } from '../../src/proxy/tool-registry.js';
import { PermissionCache } from '../../src/rbac/cache.js';
import type { AppConfig } from '../../src/config/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockChainDriver = any;

describe('API: Handlers', () => {
  let toolRegistry: ToolRegistry;
  let permissionCache: PermissionCache;
  let mockChainDriver: MockChainDriver;
  let mockConfig: AppConfig;

  beforeEach(() => {
    mockConfig = {
      tools: [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: 'slack' as any,
          baseUrl: 'https://slack.com/api',
          keyRef: 'SLACK_KEY',
          description: 'Slack API',
          endpoints: [
            {
              path: '/conversations.list',
              methods: ['GET'],
              description: 'List conversations',
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
    };

    toolRegistry = new ToolRegistry(mockConfig);
    permissionCache = new PermissionCache(300);

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
  });

  describe('healthHandler', () => {
    it('should return 200 with status ok', () => {
      const mockContext = {
        get: vi.fn().mockReturnValue('test-123'),
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      healthHandler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(200);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('rpcHandler', () => {
    it('should validate JSON-RPC request format', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({ jsonrpc: '1.0' }), // Invalid version
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(400);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32600,
            message: 'Invalid JSON-RPC request',
          }),
        })
      );
    });

    it('should handle tools/list with agent address', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {
              agent_address: '0x1234567890123456789012345678901234567890',
            },
            id: 'req-1',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(200);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          result: expect.objectContaining({
            tools: expect.any(Array),
          }),
        })
      );
    });

    it('should return empty tools list without agent address', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: 'req-1',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(200);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          result: {
            tools: [],
          },
        })
      );
    });

    it('should handle tools/describe with valid tool_key', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'tools/describe',
            params: {
              agent_address: '0x1234567890123456789012345678901234567890',
              tool_key: 'github',
            },
            id: 'req-2',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(200);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          result: expect.objectContaining({
            tool_key: 'github',
            base_url: 'https://api.github.com',
            description: 'GitHub API',
            paths: expect.any(Array),
          }),
        })
      );
    });

    it('should return error for unknown tool in tools/describe', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'tools/describe',
            params: {
              agent_address: '0x1234567890123456789012345678901234567890',
              tool_key: 'unknown-tool',
            },
            id: 'req-2',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(404);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32013,
            message: 'Unknown tool: unknown-tool',
          }),
        })
      );
    });

    it('should return error for missing tool_key in tools/describe', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'tools/describe',
            params: {
              agent_address: '0x1234567890123456789012345678901234567890',
            },
            id: 'req-2',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(400);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32600,
            message: 'Missing tool_key parameter',
          }),
        })
      );
    });

    it('should return error for unknown RPC method', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockResolvedValue({
            jsonrpc: '2.0',
            method: 'unknown/method',
            params: {},
            id: 'req-3',
          }),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(400);
      // Zod validates enum first, so invalid method returns -32600 (malformed) not -32601 (unknown method)
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32600,
          }),
        })
      );
    });

    it('should handle RPC handler errors gracefully', async () => {
      const contextStorage = new Map<string, unknown>();
      const mockContext = {
        get: vi.fn((key: string) => contextStorage.get(key)),
        set: vi.fn((key: string, value: unknown) => {
          contextStorage.set(key, value);
        }),
        req: {
          json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
        },
        status: vi.fn().mockReturnValue(undefined),
        json: vi.fn().mockReturnValue(undefined),
      };

      contextStorage.set('requestId', 'test-123');

      const handler = rpcHandler(toolRegistry, permissionCache, mockChainDriver, mockConfig);
      await handler(mockContext as MockChainDriver);

      expect(mockContext.status).toHaveBeenCalledWith(500);
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32603,
            message: 'Internal server error',
          }),
        })
      );
    });
  });

  describe('Tool registry integration', () => {
    it('should list all tools', () => {
      const tools = toolRegistry.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].key).toBe('github');
      expect(tools[1].key).toBe('slack');
    });

    it('should find tool by URL', () => {
      const result = toolRegistry.findTool('https://api.github.com/repos/owner/repo/issues');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe('github');
      }
    });

    it('should return error for unknown tool URL', () => {
      const result = toolRegistry.findTool('https://unknown-service.com/endpoint');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32013);
      }
    });

    it('should get tool by key', () => {
      const result = toolRegistry.getTool('github');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe('github');
        expect(result.value.baseUrl).toBe('https://api.github.com');
      }
    });
  });
});
