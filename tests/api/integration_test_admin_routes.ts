import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { LocalChainDriver } from '../../src/chain/local.js';
import { KeyVault } from '../../src/custody/key-vault.js';
import { AuditQueue } from '../../src/audit/store.js';
import { AuditContractWriter } from '../../src/audit/contract.js';
import { ProxyExecutor } from '../../src/proxy/executor.js';
import type { AppConfig } from '../../src/config/types.js';
import type { AgentAddress } from '../../src/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppType = any;

/**
 * Integration Tests for Admin Routes
 *
 * NOTE: These tests use localhost mock client and LocalChainDriver
 * No external blockchain required
 */
describe.skip('Integration: Admin Routes', () => {
  let app: AppType;
  let chainDriver: LocalChainDriver;
  let custody: KeyVault;
  let auditQueue: AuditQueue;
  let executor: ProxyExecutor;

  const testAgentAddress = ('0x' + '1'.repeat(40)) as AgentAddress;

  const mockConfig: AppConfig = {
    tools: [
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        key: 'test-api' as any,
        baseUrl: 'http://localhost:9999',
        keyRef: 'TEST_API_KEY',
        description: 'Test API',
        endpoints: [
          {
            path: '/endpoint',
            methods: ['GET', 'POST'],
            description: 'Test endpoint',
          },
        ],
      },
    ],
    roles: [],
    chain: {
      name: 'local' as const,
      chainId: 31337,
      rpcUrl: 'http://localhost:8545',
      rbacContractAddress: '0x0123456789012345678901234567890123456789',
      auditContractAddress: '0x9876543210987654321098765432109876543210',
    },
    cache: { ttlSeconds: 300 },
    server: {
      port: 8080,
      host: '127.0.0.1',
      readTimeoutMs: 30000,
      writeTimeoutMs: 60000,
    },
  };

  beforeAll(async () => {
    // Setup encryption key for audit
    process.env.AUDIT_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    // Setup chain driver (local mock)
    chainDriver = new LocalChainDriver();

    // Setup RBAC with test agent role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testRole = {
      id: ('0x' + '1'.repeat(64)) as any,
      name: 'Test Agent',
      isActive: true,
      permissions: [
        {
          tool: 'test-api',
          actions: ['read', 'create', 'update', 'delete'],
        },
      ],
    };

    await chainDriver.setAgentRole(testAgentAddress, testRole.id);
    await chainDriver.setRoleDetails(testRole.id, testRole);

    // Setup custody
    custody = new KeyVault();
    custody.addKey('TEST_API_KEY', Buffer.from('test-key-value'));

    // Setup audit queue
    auditQueue = new AuditQueue(chainDriver, 100);
    const auditWriter = new AuditContractWriter(
      mockConfig.chain.auditContractAddress,
      chainDriver
    );
    await auditQueue.attach(auditWriter);

    // Setup proxy executor (mock upstream)
    executor = new ProxyExecutor();
    vi.spyOn(executor, 'execute').mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: '{"result": "success"}',
    });

    // Create server
    app = createServer(mockConfig, chainDriver, custody, auditQueue, executor);
  });

  afterAll(async () => {
    await auditQueue.drain();
  });

  describe('GET /admin/audit/search', () => {
    it('should accept requests from localhost', async () => {
      // Create a test request with localhost header
      const mockReq = new Request('http://localhost:8080/admin/audit/search?agent=' + testAgentAddress, {
        method: 'GET',
        headers: { host: 'localhost:8080' },
      });

      // Mock chainDriver to return empty results
      vi.spyOn(chainDriver, 'readContract').mockResolvedValue({
        ok: true,
        value: [],
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.count).toBe(0);
      expect(data.entries).toEqual([]);
    });

    it('should reject requests from non-localhost', async () => {
      const mockReq = new Request('http://example.com:8080/admin/audit/search', {
        method: 'GET',
        headers: { host: 'example.com:8080' },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toMatch(/localhost/i);
    });

    it('should reject from 127.0.0.1 without colon and port', async () => {
      const mockReq = new Request('http://127.0.0.1/admin/audit/search', {
        method: 'GET',
        headers: { host: '127.0.0.1' },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(403);
    });

    it('should accept from 127.0.0.1 with port', async () => {
      const mockReq = new Request('http://127.0.0.1:8080/admin/audit/search?agent=' + testAgentAddress, {
        method: 'GET',
        headers: { host: '127.0.0.1:8080' },
      });

      vi.spyOn(chainDriver, 'readContract').mockResolvedValue({
        ok: true,
        value: [],
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(200);
    });

    it('should reject invalid query parameters', async () => {
      const mockReq = new Request('http://localhost:8080/admin/audit/search?limit=101', {
        method: 'GET',
        headers: { host: 'localhost:8080' },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should handle blockchain read errors', async () => {
      const mockReq = new Request('http://localhost:8080/admin/audit/search?agent=' + testAgentAddress, {
        method: 'GET',
        headers: { host: 'localhost:8080' },
      });

      vi.spyOn(chainDriver, 'readContract').mockResolvedValue({
        ok: false,
        error: { code: -32022, message: 'Blockchain unavailable', httpStatus: 503 },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(503);
    });

    it('should handle pagination correctly', async () => {
      const mockReq = new Request(
        'http://localhost:8080/admin/audit/search?agent=' + testAgentAddress + '&offset=10&limit=25',
        {
          method: 'GET',
          headers: { host: 'localhost:8080' },
        }
      );

      const mockEntries = [
        {
          agent: testAgentAddress,
          timestamp: 1700000000,
          isSuccess: true,
          tool: 'test-api',
          errorType: '',
          payloadHash: '0x' + 'a'.repeat(64),
          encryptedPayload: Buffer.from('encrypted'),
        },
      ];

      vi.spyOn(chainDriver, 'readContract').mockResolvedValue({
        ok: true,
        value: mockEntries,
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.count).toBe(1);
      expect(data.query.offset).toBe(10);
      expect(data.query.limit).toBe(25);
    });
  });

  describe('POST /admin/rbac/revoke', () => {
    it('should accept requests from localhost', async () => {
      const mockReq = new Request('http://localhost:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'localhost:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent_address: testAgentAddress }),
      });

      vi.spyOn(chainDriver, 'writeContract').mockResolvedValue({
        ok: true,
        value: '0xabc123',
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Agent revoked successfully');
      expect(data.tx_hash).toBe('0xabc123');
    });

    it('should reject requests from non-localhost', async () => {
      const mockReq = new Request('http://example.com:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'example.com:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent_address: testAgentAddress }),
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toMatch(/localhost/i);
    });

    it('should reject missing agent_address parameter', async () => {
      const mockReq = new Request('http://localhost:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'localhost:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/agent_address/i);
    });

    it('should reject invalid agent address format', async () => {
      const mockReq = new Request('http://localhost:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'localhost:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent_address: 'not-an-address' }),
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/address/i);
    });

    it('should handle blockchain write errors', async () => {
      const mockReq = new Request('http://localhost:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'localhost:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent_address: testAgentAddress }),
      });

      vi.spyOn(chainDriver, 'writeContract').mockResolvedValue({
        ok: false,
        error: { code: -32022, message: 'Blockchain unavailable', httpStatus: 503 },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(503);
    });

    it('should include governance metadata in response', async () => {
      const mockReq = new Request('http://localhost:8080/admin/rbac/revoke', {
        method: 'POST',
        headers: {
          host: 'localhost:8080',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent_address: testAgentAddress }),
      });

      vi.spyOn(chainDriver, 'writeContract').mockResolvedValue({
        ok: true,
        value: '0xabc123',
      });

      const response = await app.fetch(mockReq);

      const data = await response.json();
      expect(data._governance).toBeDefined();
      expect(data._governance.request_id).toBeDefined();
      expect(data._governance.timestamp).toBeDefined();
    });
  });

  describe('Health check (non-admin)', () => {
    it('should be accessible from any host', async () => {
      const mockReq = new Request('http://example.com:8080/health', {
        method: 'GET',
        headers: { host: 'example.com:8080' },
      });

      const response = await app.fetch(mockReq);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });
});
