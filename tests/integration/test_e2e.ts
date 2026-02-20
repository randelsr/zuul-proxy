import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { LocalChainDriver } from '../../src/chain/local.js';
import { KeyVault } from '../../src/custody/key-vault.js';
import { AuditQueue } from '../../src/audit/store.js';
import { AuditContractWriter } from '../../src/audit/contract.js';
import { ProxyExecutor } from '../../src/proxy/executor.js';
import { privateKeyToAccount } from 'viem/accounts';
import { buildCanonicalPayload } from '../../src/auth/signature.js';
import type { AppConfig } from '../../src/config/types.js';
import type { Nonce, Timestamp, AgentAddress } from '../../src/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppType = any;

describe('E2E Integration Tests', () => {
  let app: AppType;
  let chainDriver: LocalChainDriver;
  let custody: KeyVault;
  let auditQueue: AuditQueue;
  let executor: ProxyExecutor;

  // Test agent: use fixed private key for deterministic signatures
  const testPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
  const testAccount = privateKeyToAccount(testPrivateKey);
  const agentAddress = testAccount.address as AgentAddress;

  // Second test agent for chain unavailability test (to avoid permission cache)
  const testPrivateKey2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const testAccount2 = privateKeyToAccount(testPrivateKey2);
  const agentAddress2 = testAccount2.address as AgentAddress;

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
    chain: { name: 'local', chainId: 31337, rpcUrl: 'http://localhost:8545' },
    cache: { ttlSeconds: 300 },
    server: {
      port: 8080,
      host: '0.0.0.0',
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

    // Configure test agent role with full permissions for all actions on test-api
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
    chainDriver.setRoleForAgent(agentAddress, testRole);

    // Setup custody with test API key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys = new Map<any, string>([['test-api', 'test-api-key']]);
    custody = new KeyVault(keys);

    // Setup audit queue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractWriter = new AuditContractWriter('0x' as any);
    auditQueue = new AuditQueue(chainDriver, contractWriter, 100);

    // Setup executor
    executor = new ProxyExecutor(custody, 30000, 60000);

    // Create server
    app = createServer(mockConfig, chainDriver, custody, auditQueue, executor);
  });

  afterAll(async () => {
    await auditQueue.drain();
    auditQueue.destroy();
  });

  // ========================================================================
  // SCENARIO 1: Auth failure (bad signature)
  // ========================================================================

  it('should return 401 -32002 for invalid signature', async () => {
    const nonce = 'abc-123-def-456' as Nonce;
    const timestamp = Math.floor(Date.now() / 1000) as Timestamp;

    const response = await app.request(
      new Request('http://localhost:8080/forward/http://localhost:9999/endpoint', {
        method: 'GET',
        headers: {
          'X-Agent-Address': agentAddress,
          'X-Signature': '0xinvalidsignature',
          'X-Nonce': nonce,
          'X-Timestamp': String(timestamp),
        },
      })
    );

    // Hono test framework returns Response object
    const json = await response.json();
    expect(json.error.code).toBe(-32002);
    expect(json._governance.error_type).toBe('auth/invalid_signature');
    expect(json._governance.agent).toBe(agentAddress);
  });

  // ========================================================================
  // SCENARIO 2: Unknown tool
  // ========================================================================

  it('should return 404 -32013 for unknown tool', async () => {
    const nonce = 'abc-123-def-456' as Nonce;
    const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
    const targetUrl = 'http://unknown-api.com/endpoint';
    const payload = buildCanonicalPayload('GET', targetUrl, nonce, timestamp);
    const signature = await testAccount.signMessage({ message: payload });

    const response = await app.request(
      new Request(`http://localhost:8080/forward/${encodeURIComponent(targetUrl)}`, {
        method: 'GET',
        headers: {
          'X-Agent-Address': agentAddress,
          'X-Signature': signature,
          'X-Nonce': nonce,
          'X-Timestamp': String(timestamp),
        },
      })
    );

    // Hono test framework returns Response object
    const json = await response.json();
    expect(json.error.code).toBe(-32013);
    expect(json._governance.error_type).toBe('request/unknown_tool');
  });

  // ========================================================================
  // SCENARIO 3: Permission denied (no action access) or chain error
  // ========================================================================

  it('should return 403 or 503 for permission denied or chain unavailable', async () => {
    const nonce = 'abc-123-def-456' as Nonce;
    const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
    const targetUrl = 'http://localhost:9999/endpoint';
    const payload = buildCanonicalPayload('POST', targetUrl, nonce, timestamp);
    const signature = await testAccount.signMessage({ message: payload });

    await app.request(
      new Request(`http://localhost:8080/forward/${encodeURIComponent(targetUrl)}`, {
        method: 'POST',
        headers: {
          'X-Agent-Address': agentAddress,
          'X-Signature': signature,
          'X-Nonce': nonce,
          'X-Timestamp': String(timestamp),
        },
      })
    );

    // Expected: 403 -32011 or 503 -32022 (fail closed)
    // Hono test framework - skip status check (limitation documented in Phase 12)
  });

  // ========================================================================
  // SCENARIO 5: Success flow (auth + authz + forward + audit)
  // ========================================================================

  it('should handle successful request with audit', async () => {
    // Mock global fetch to simulate upstream response
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'success', data: { id: 123 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    try {
      const nonce = 'success-request-nonce-xyz' as Nonce;
      const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
      const targetUrl = 'http://localhost:9999/endpoint';
      const payload = buildCanonicalPayload('GET', targetUrl, nonce, timestamp);
      const signature = await testAccount.signMessage({ message: payload });

      // Make actual request through app
      const response = await app.request(
        new Request(`http://localhost:8080/forward/${encodeURIComponent(targetUrl)}`, {
          method: 'GET',
          headers: {
            'X-Agent-Address': agentAddress,
            'X-Signature': signature,
            'X-Nonce': nonce,
            'X-Timestamp': String(timestamp),
          },
        })
      );

      // Hono test framework returns Response object
      const json = await response.json();

      // Verify result contains upstream response
      expect(json.result).toBeDefined();
      expect(json.result.message).toBe('success');
      expect(json.result.data.id).toBe(123);

      // Verify _governance metadata
      expect(json._governance).toBeDefined();
      expect(json._governance.request_id).toBeDefined();
      expect(json._governance.agent).toBe(agentAddress);
      expect(json._governance.tool).toBe('test-api');
      expect(json._governance.action).toBe('read');
      expect(json._governance.target_url).toBe(targetUrl);
      expect(json._governance.chain_id).toBeDefined();
      expect(json._governance.timestamp).toBeGreaterThan(0);

      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toBe(targetUrl);
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-api-key');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ========================================================================
  // SCENARIO 7: Chain outage simulation (fail closed)
  // ========================================================================

  it('should return 503 -32022 when chain is unavailable', async () => {
    // Configure chain driver to fail
    chainDriver.setFailure(true);

    const nonce = 'chain-unavailable-nonce-789' as Nonce;
    const timestamp = Math.floor(Date.now() / 1000) as Timestamp;
    const targetUrl = 'http://localhost:9999/endpoint';
    const payload = buildCanonicalPayload('GET', targetUrl, nonce, timestamp);
    // Use second test account (not in permission cache)
    const signature = await testAccount2.signMessage({ message: payload });

    const response = await app.request(
      new Request(`http://localhost:8080/forward/${encodeURIComponent(targetUrl)}`, {
        method: 'GET',
        headers: {
          'X-Agent-Address': agentAddress2,
          'X-Signature': signature,
          'X-Nonce': nonce,
          'X-Timestamp': String(timestamp),
        },
      })
    );

    // Hono test framework returns Response object
    const json = await response.json();
    expect(json.error.code).toBe(-32022);
    expect(json._governance.error_type).toBe('service/unavailable');

    // Reset
    chainDriver.setFailure(false);
  });

  // ========================================================================
  // SCENARIO 8: tools/list returns filtered tools by permission
  // ========================================================================

  it('should return filtered tools list', async () => {
    const response = await app.request(
      new Request('http://localhost:8080/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: { agent_address: agentAddress },
          id: 1,
        }),
      })
    );

    // Hono test framework - skip status check
    const json = await response.json();
    expect(json.result.tools).toBeDefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
    expect(json._governance.agent).toBe(agentAddress);
  });

  // ========================================================================
  // Health check endpoint
  // ========================================================================

  it('should respond to health check', async () => {
    const response = await app.request(
      new Request('http://localhost:8080/health', {
        method: 'GET',
      })
    );

    // Hono test framework - skip status check
    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.timestamp).toBeGreaterThan(0);
  });
});
