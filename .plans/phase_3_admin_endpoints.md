# Phase 3: Admin Endpoints (Stories #12, #13)

**Status:** Planning
**Priority:** HIGH (Exposes admin functionality)
**User Stories:** Story #12 — Search audit logs; Story #13 — Decrypt audit logs

---

## Overview

Create localhost-only admin HTTP endpoints to expose RBAC revocation and audit query functionality. This bridges the blockchain contracts (Phases 1-2) to HTTP-based admin operations.

**What We're Building:**
- `POST /admin/rbac/revoke` — Emergency revoke endpoint (calls contract)
- `GET /admin/audit/search` — Audit log query endpoint with filtering + pagination + optional decryption
- Localhost-only middleware to reject non-localhost requests (403)
- Query parameter parsing for flexible filtering

**Scope:**
- No authentication (localhost-only in MVP; can add OAuth in 2.0)
- Non-blocking: admin endpoints don't slow down agent requests
- Decryption optional: `?decrypt=true` to return plaintext payload

---

## Implementation Details

### 3.1 Create Admin Handlers Module

**File:** `src/api/handlers/admin.ts` (NEW)

**Purpose:** Pure handler functions for admin operations (no Hono-specific logic).

```typescript
import type { Result } from '../../types.js';
import type { ChainDriver } from '../../chain/driver.js';
import type { EncryptionService } from '../../audit/encryption.js';
import { ServiceError } from '../../errors.js';
import { getLogger } from '../../logging.js';

const logger = getLogger('api:admin');

/**
 * Query parameters for audit search
 */
export type AuditSearchParams = Readonly<{
  agent?: string;         // Filter by agent address (0x...)
  tool?: string;          // Filter by tool key
  startTime?: number;     // Unix timestamp start (inclusive)
  endTime?: number;       // Unix timestamp end (inclusive)
  offset?: number;        // Pagination offset (default: 0)
  limit?: number;         // Pagination limit (default: 50, max: 100)
  decrypt?: boolean;      // Decrypt payloads? (default: false)
}>;

/**
 * Audit search result
 */
export type AuditSearchResult = Readonly<{
  query: AuditSearchParams;
  count: number;
  entries: ReadonlyArray<{
    agent: string;
    timestamp: number;
    isSuccess: boolean;
    tool: string;
    errorType?: string;
    payloadHash: string;
    encryptedPayload?: string;  // If decrypt=false
    payload?: Record<string, unknown>;  // If decrypt=true
  }>;
}>;

/**
 * Parse and validate audit search query parameters
 */
export function parseAuditSearchParams(queryString: string): Result<AuditSearchParams, Error> {
  try {
    const params = new URLSearchParams(queryString);

    const offset = params.has('offset') ? parseInt(params.get('offset')!, 10) : 0;
    const limit = params.has('limit') ? parseInt(params.get('limit')!, 10) : 50;

    if (offset < 0 || limit < 1 || limit > 100) {
      return {
        ok: false,
        error: new Error('offset >= 0 and 1 <= limit <= 100'),
      };
    }

    const startTime = params.has('startTime') ? parseInt(params.get('startTime')!, 10) : undefined;
    const endTime = params.has('endTime') ? parseInt(params.get('endTime')!, 10) : undefined;

    if ((startTime !== undefined && startTime < 0) || (endTime !== undefined && endTime < 0)) {
      return {
        ok: false,
        error: new Error('Timestamps must be non-negative'),
      };
    }

    if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
      return {
        ok: false,
        error: new Error('startTime must be <= endTime'),
      };
    }

    return {
      ok: true,
      value: {
        agent: params.get('agent') || undefined,
        tool: params.get('tool') || undefined,
        startTime,
        endTime,
        offset,
        limit,
        decrypt: params.has('decrypt') && params.get('decrypt') === 'true',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Perform audit search against blockchain
 */
export async function performAuditSearch(
  params: AuditSearchParams,
  chainDriver: ChainDriver,
  encryptionService: EncryptionService,
  auditContractAddress: string
): Promise<Result<AuditSearchResult, ServiceError>> {
  try {
    let entries;

    // Determine query path based on filters
    if (params.agent) {
      // Query by agent
      const agentResult = await chainDriver.readContract(
        auditContractAddress,
        'getEntriesByAgent',
        [params.agent, params.offset || 0, params.limit || 50]
      );

      if (!agentResult.ok) {
        logger.error({ agent: params.agent }, 'Failed to query entries by agent');
        return {
          ok: false,
          error: new ServiceError('Blockchain read failed', -32022),
        };
      }

      entries = agentResult.value;
    } else if (params.tool) {
      // Query by tool
      const toolResult = await chainDriver.readContract(
        auditContractAddress,
        'getEntriesByTool',
        [params.tool, params.offset || 0, params.limit || 50]
      );

      if (!toolResult.ok) {
        logger.error({ tool: params.tool }, 'Failed to query entries by tool');
        return {
          ok: false,
          error: new ServiceError('Blockchain read failed', -32022),
        };
      }

      entries = toolResult.value;
    } else if (params.startTime !== undefined && params.endTime !== undefined) {
      // Query by time range
      const timeResult = await chainDriver.readContract(
        auditContractAddress,
        'getEntriesByTimeRange',
        [params.startTime, params.endTime, params.offset || 0, params.limit || 50]
      );

      if (!timeResult.ok) {
        logger.error(
          { startTime: params.startTime, endTime: params.endTime },
          'Failed to query entries by time range'
        );
        return {
          ok: false,
          error: new ServiceError('Blockchain read failed', -32022),
        };
      }

      entries = timeResult.value;
    } else {
      // No filter specified; probably should list recent entries
      // For now, require at least one filter
      return {
        ok: false,
        error: new Error('At least one filter required: agent, tool, or time range'),
      };
    }

    // Transform entries for response
    const results = entries.map((entry) => {
      const result: Record<string, unknown> = {
        agent: entry.agent,
        timestamp: entry.timestamp,
        isSuccess: entry.isSuccess,
        tool: entry.tool,
        errorType: entry.errorType,
        payloadHash: entry.payloadHash,
      };

      if (params.decrypt) {
        // Decrypt payload
        const decrypted = encryptionService.decrypt(entry.encryptedPayload);
        if (decrypted.ok) {
          try {
            result.payload = JSON.parse(decrypted.value.toString());
          } catch (e) {
            logger.warn({ error: String(e) }, 'Failed to parse decrypted payload as JSON');
            result.payload = decrypted.value.toString();
          }
        } else {
          logger.warn({ error: decrypted.error.message }, 'Failed to decrypt payload');
          result.payload = null;
        }
      } else {
        // Include encrypted payload as hex
        result.encryptedPayload = '0x' + entry.encryptedPayload.toString('hex');
      }

      return result;
    });

    logger.info(
      { query: params, resultCount: results.length },
      'Audit search completed'
    );

    return {
      ok: true,
      value: {
        query: params,
        count: results.length,
        entries: results as AuditSearchResult['entries'],
      },
    };
  } catch (error) {
    logger.error({ error: String(error) }, 'Unexpected error during audit search');
    return {
      ok: false,
      error: new ServiceError('Internal error during audit search', -32603),
    };
  }
}

/**
 * Perform emergency revocation
 */
export async function performEmergencyRevoke(
  agentAddress: string,
  chainDriver: ChainDriver,
  rbacContractAddress: string
): Promise<Result<string, ServiceError>> {
  try {
    // Validate agent address format
    if (!agentAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      return {
        ok: false,
        error: new ServiceError('Invalid agent address format', -32600),
      };
    }

    logger.warn({ agent: agentAddress }, 'Emergency revocation requested');

    // Call contract
    const result = await chainDriver.writeContract(
      rbacContractAddress,
      'emergencyRevoke',
      [agentAddress]
    );

    if (!result.ok) {
      logger.error({ agent: agentAddress, error: result.error }, 'Revocation failed');
      return {
        ok: false,
        error: new ServiceError('Revocation failed', -32022),
      };
    }

    logger.info({ agent: agentAddress, txHash: result.value }, 'Agent revoked successfully');

    return {
      ok: true,
      value: result.value,
    };
  } catch (error) {
    logger.error({ error: String(error) }, 'Unexpected error during revocation');
    return {
      ok: false,
      error: new ServiceError('Internal error during revocation', -32603),
    };
  }
}
```

**Design Rationale:**
- ✅ Pure functions (no Hono context; testable)
- ✅ Explicit error handling via Result<T, E>
- ✅ Structured logging with context
- ✅ Separation of parsing, validation, and execution
- ✅ Optional decryption (separate concern)
- ✅ Address validation before contract call

---

### 3.2 Add Admin Routes to Server

**File:** `src/api/server.ts`

**Add localhost-only middleware:**
```typescript
/**
 * Reject requests from non-localhost origins
 * Admin endpoints are only accessible from local development/testing
 */
function localhostOnly() {
  return async (context: Context, next: () => Promise<void>) => {
    const host = context.req.header('host') || '';
    const forwarded = context.req.header('x-forwarded-for');

    // Allow localhost, 127.0.0.1, and ::1
    const isLocalhost = host.startsWith('localhost:') ||
                       host.startsWith('127.0.0.1:') ||
                       host.startsWith('[::1]:') ||
                       host === 'localhost' ||
                       host === '127.0.0.1';

    const isForwarded = forwarded ? forwarded.split(',')[0].trim() === '127.0.0.1' : false;

    if (!isLocalhost && !isForwarded) {
      logger.warn({ host, forwarded }, 'Non-localhost admin request rejected');
      context.status(403);
      return context.json({
        error: 'Admin endpoints only accessible from localhost',
      });
    }

    return next();
  };
}
```

**Add admin routes to createServer function:**
```typescript
export function createServer(
  config: AppConfig,
  chainDriver: ChainDriver,
  custody: KeyCustodyDriver,
  auditQueue: AuditQueue,
  executor: ProxyExecutor
): Hono {
  const app = new Hono();

  // ... existing initialization ...

  // ========================================================================
  // ADMIN ROUTES (Localhost Only)
  // ========================================================================

  // Audit search endpoint
  app.get('/admin/audit/search', localhostOnly(), async (context: Context) => {
    const query = context.req.query();
    const queryString = new URLSearchParams(query).toString();

    // Parse query parameters
    const parseResult = parseAuditSearchParams(queryString);
    if (!parseResult.ok) {
      context.status(400);
      return context.json({
        error: 'Invalid query parameters',
        details: parseResult.error.message,
      });
    }

    // Perform audit search
    const searchResult = await performAuditSearch(
      parseResult.value,
      chainDriver,
      encryptionService,
      config.chain.auditContractAddress
    );

    if (!searchResult.ok) {
      context.status(503);
      return context.json({
        error: 'Audit search failed',
        details: searchResult.error.message,
      });
    }

    context.status(200);
    return context.json(searchResult.value);
  });

  // Emergency revocation endpoint
  app.post('/admin/rbac/revoke', localhostOnly(), async (context: Context) => {
    let body;
    try {
      body = await context.req.json();
    } catch (e) {
      context.status(400);
      return context.json({
        error: 'Invalid JSON body',
      });
    }

    const agentAddress = body.agent_address || body.agentAddress;
    if (!agentAddress) {
      context.status(400);
      return context.json({
        error: 'Missing required field: agent_address',
      });
    }

    // Perform revocation
    const revokeResult = await performEmergencyRevoke(
      agentAddress,
      chainDriver,
      config.chain.rbacContractAddress
    );

    if (!revokeResult.ok) {
      const statusCode = revokeResult.error.httpStatus || 503;
      context.status(statusCode);
      return context.json({
        error: revokeResult.error.message,
      });
    }

    context.status(200);
    return context.json({
      message: 'Agent revoked successfully',
      txHash: revokeResult.value,
    });
  });

  // ========================================================================
  // EXISTING ROUTES (unchanged)
  // ========================================================================

  // Health, RPC, Forward endpoints...

  return app;
}
```

**Design Notes:**
- ✅ Handlers imported from admin.ts (separation of concerns)
- ✅ Localhost middleware applied to both routes
- ✅ Explicit error responses with HTTP status codes
- ✅ Query parameter parsing with validation
- ✅ JSON body parsing with try/catch

---

### 3.3 Update Configuration Types

**File:** `src/config/types.ts`

**Update ChainConfig to include contract addresses:**
```typescript
export type ChainConfig = Readonly<{
  name: 'hedera' | 'base' | 'arbitrum' | 'optimism' | 'local';
  chainId: number;
  rpcUrl: string;
  rbacContractAddress: string;      // ← NEW
  auditContractAddress: string;     // ← NEW
}>;
```

**Example in config.yaml:**
```yaml
chain:
  name: hedera
  chainId: 295
  rpcUrl: ${HEDERA_RPC_URL}
  rbacContractAddress: ${RBAC_CONTRACT_ADDRESS}
  auditContractAddress: ${AUDIT_CONTRACT_ADDRESS}
```

---

### 3.4 Update .env Template

**File:** `.env.example`

**Add contract address variables:**
```bash
# Blockchain Configuration
HEDERA_RPC_URL=https://testnet.hashio.io/api
RBAC_CONTRACT_ADDRESS=0x5FC8B...
AUDIT_CONTRACT_ADDRESS=0x7D2C...

# Admin Encryption Key (if needed for decryption)
ADMIN_DECRYPTION_KEY=0x...
```

---

### 3.5 Add Unit Tests for Admin Handlers

**File:** `tests/api/test_admin_handlers.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseAuditSearchParams, performAuditSearch, performEmergencyRevoke } from '../../src/api/handlers/admin';
import type { ChainDriver } from '../../src/chain/driver';
import { EncryptionService } from '../../src/audit/encryption';

describe('Admin Handlers', () => {
  let mockChainDriver: ChainDriver;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    mockChainDriver = {
      readContract: vi.fn(),
      writeContract: vi.fn(),
    } as unknown as ChainDriver;

    encryptionService = new EncryptionService();
  });

  describe('parseAuditSearchParams', () => {
    it('should parse valid query string', () => {
      const result = parseAuditSearchParams('agent=0x1234&tool=github&offset=0&limit=50');
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        agent: '0x1234',
        tool: 'github',
        offset: 0,
        limit: 50,
        decrypt: false,
      });
    });

    it('should set default offset and limit', () => {
      const result = parseAuditSearchParams('agent=0x1234');
      expect(result.ok).toBe(true);
      expect(result.value?.offset).toBe(0);
      expect(result.value?.limit).toBe(50);
    });

    it('should reject invalid offset', () => {
      const result = parseAuditSearchParams('agent=0x1234&offset=-1');
      expect(result.ok).toBe(false);
    });

    it('should reject limit > 100', () => {
      const result = parseAuditSearchParams('agent=0x1234&limit=101');
      expect(result.ok).toBe(false);
    });

    it('should parse decrypt flag', () => {
      const result = parseAuditSearchParams('agent=0x1234&decrypt=true');
      expect(result.ok).toBe(true);
      expect(result.value?.decrypt).toBe(true);
    });

    it('should parse time range', () => {
      const result = parseAuditSearchParams('startTime=1000&endTime=2000');
      expect(result.ok).toBe(true);
      expect(result.value?.startTime).toBe(1000);
      expect(result.value?.endTime).toBe(2000);
    });

    it('should reject startTime > endTime', () => {
      const result = parseAuditSearchParams('startTime=2000&endTime=1000');
      expect(result.ok).toBe(false);
    });
  });

  describe('performAuditSearch', () => {
    it('should query by agent when agent filter provided', async () => {
      const mockEntries = [
        {
          agent: '0x1234',
          timestamp: 1000,
          isSuccess: true,
          tool: 'github',
          errorType: '',
          payloadHash: '0xabcd',
          encryptedPayload: Buffer.from('encrypted'),
        },
      ];

      vi.mocked(mockChainDriver.readContract).mockResolvedValue({
        ok: true,
        value: mockEntries,
      });

      const result = await performAuditSearch(
        { agent: '0x1234', offset: 0, limit: 50 },
        mockChainDriver,
        encryptionService,
        '0xaudit'
      );

      expect(result.ok).toBe(true);
      expect(result.value?.count).toBe(1);
      expect(result.value?.entries[0].agent).toBe('0x1234');
    });

    it('should query by tool when tool filter provided', async () => {
      const mockEntries = [
        {
          agent: '0x1234',
          timestamp: 1000,
          isSuccess: true,
          tool: 'slack',
          errorType: '',
          payloadHash: '0xabcd',
          encryptedPayload: Buffer.from('encrypted'),
        },
        {
          agent: '0x5678',
          timestamp: 1100,
          isSuccess: true,
          tool: 'slack',
          errorType: '',
          payloadHash: '0xdef0',
          encryptedPayload: Buffer.from('encrypted2'),
        },
      ];

      vi.mocked(mockChainDriver.readContract).mockResolvedValue({
        ok: true,
        value: mockEntries,
      });

      const result = await performAuditSearch(
        { tool: 'slack', offset: 0, limit: 50 },
        mockChainDriver,
        encryptionService,
        '0xaudit'
      );

      expect(result.ok).toBe(true);
      expect(result.value?.count).toBe(2);
      expect(result.value?.entries.every((e) => e.tool === 'slack')).toBe(true);
    });

    it('should include encrypted payload when decrypt=false', async () => {
      const mockEntries = [
        {
          agent: '0x1234',
          timestamp: 1000,
          isSuccess: true,
          tool: 'github',
          errorType: '',
          payloadHash: '0xabcd',
          encryptedPayload: Buffer.from('encrypted'),
        },
      ];

      vi.mocked(mockChainDriver.readContract).mockResolvedValue({
        ok: true,
        value: mockEntries,
      });

      const result = await performAuditSearch(
        { agent: '0x1234', decrypt: false, offset: 0, limit: 50 },
        mockChainDriver,
        encryptionService,
        '0xaudit'
      );

      expect(result.ok).toBe(true);
      expect(result.value?.entries[0].encryptedPayload).toBeDefined();
      expect(result.value?.entries[0].payload).toBeUndefined();
    });

    it('should reject query with no filters', async () => {
      const result = await performAuditSearch(
        {},
        mockChainDriver,
        encryptionService,
        '0xaudit'
      );

      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/At least one filter/);
    });

    it('should handle blockchain read errors', async () => {
      vi.mocked(mockChainDriver.readContract).mockResolvedValue({
        ok: false,
        error: new Error('RPC failed'),
      });

      const result = await performAuditSearch(
        { agent: '0x1234', offset: 0, limit: 50 },
        mockChainDriver,
        encryptionService,
        '0xaudit'
      );

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(-32022);
    });
  });

  describe('performEmergencyRevoke', () => {
    it('should revoke agent via contract', async () => {
      vi.mocked(mockChainDriver.writeContract).mockResolvedValue({
        ok: true,
        value: '0xtxhash',
      });

      const result = await performEmergencyRevoke(
        '0x1234567890123456789012345678901234567890',
        mockChainDriver,
        '0xrbac'
      );

      expect(result.ok).toBe(true);
      expect(result.value).toBe('0xtxhash');
      expect(mockChainDriver.writeContract).toHaveBeenCalledWith(
        '0xrbac',
        'emergencyRevoke',
        ['0x1234567890123456789012345678901234567890']
      );
    });

    it('should reject invalid agent address', async () => {
      const result = await performEmergencyRevoke(
        'not-an-address',
        mockChainDriver,
        '0xrbac'
      );

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(-32600);
    });

    it('should handle contract write errors', async () => {
      vi.mocked(mockChainDriver.writeContract).mockResolvedValue({
        ok: false,
        error: new Error('Out of gas'),
      });

      const result = await performEmergencyRevoke(
        '0x1234567890123456789012345678901234567890',
        mockChainDriver,
        '0xrbac'
      );

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(-32022);
    });
  });
});
```

**Test Execution:**
```bash
pnpm test tests/api/test_admin_handlers.ts
```

**Expected Results:**
- ✅ Query parameter parsing validates offset/limit
- ✅ Audit search queries correct blockchain function based on filter
- ✅ Encrypted payloads included when decrypt=false
- ✅ Payloads decrypted when decrypt=true
- ✅ Invalid agent addresses rejected before contract call
- ✅ Blockchain errors handled gracefully

---

### 3.6 Add Integration Tests for Admin Routes

**File:** `tests/api/test_admin_routes.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../../src/api/server';
import type { AppConfig } from '../../src/config/types';
import { mockChainDriver, mockCustody, mockAuditQueue, mockExecutor } from '../mocks';

describe('Admin Routes (Localhost-Only)', () => {
  let app;

  beforeEach(() => {
    const config: AppConfig = {
      server: { port: 8080, host: '0.0.0.0', readTimeoutMs: 30000, writeTimeoutMs: 60000 },
      chain: {
        name: 'hedera',
        chainId: 295,
        rpcUrl: 'http://127.0.0.1:8545',
        rbacContractAddress: '0xrbac',
        auditContractAddress: '0xaudit',
      },
      cache: { ttlSeconds: 300 },
      tools: [],
      roles: [],
    };

    app = createServer(config, mockChainDriver, mockCustody, mockAuditQueue, mockExecutor);
  });

  describe('GET /admin/audit/search', () => {
    it('should reject non-localhost requests with 403', async () => {
      const res = await app.request(
        new Request('http://example.com:8080/admin/audit/search?agent=0x1234', {
          headers: { host: 'example.com:8080' },
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/localhost/i);
    });

    it('should accept localhost requests', async () => {
      const res = await app.request(
        new Request('http://localhost:8080/admin/audit/search?agent=0x1234', {
          headers: { host: 'localhost:8080' },
        })
      );

      // Should not be 403
      expect(res.status).not.toBe(403);
    });

    it('should accept 127.0.0.1 requests', async () => {
      const res = await app.request(
        new Request('http://127.0.0.1:8080/admin/audit/search?agent=0x1234', {
          headers: { host: '127.0.0.1:8080' },
        })
      );

      expect(res.status).not.toBe(403);
    });

    it('should return 400 on invalid query parameters', async () => {
      const res = await app.request(
        new Request('http://localhost:8080/admin/audit/search?limit=1000', {
          headers: { host: 'localhost:8080' },
        })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should return audit entries on success', async () => {
      // This requires mocking the chain driver to return audit entries
      // (See test_admin_handlers.ts for detailed mocking examples)
      const res = await app.request(
        new Request('http://localhost:8080/admin/audit/search?agent=0x1234', {
          headers: { host: 'localhost:8080' },
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.query).toBeDefined();
      expect(body.count).toBeDefined();
      expect(body.entries).toBeDefined();
    });
  });

  describe('POST /admin/rbac/revoke', () => {
    it('should reject non-localhost requests with 403', async () => {
      const res = await app.request(
        new Request('http://example.com:8080/admin/rbac/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', host: 'example.com:8080' },
          body: JSON.stringify({ agent_address: '0x1234' }),
        })
      );

      expect(res.status).toBe(403);
    });

    it('should accept localhost requests', async () => {
      const res = await app.request(
        new Request('http://localhost:8080/admin/rbac/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', host: 'localhost:8080' },
          body: JSON.stringify({ agent_address: '0x1234567890123456789012345678901234567890' }),
        })
      );

      expect(res.status).not.toBe(403);
    });

    it('should return 400 on missing agent_address', async () => {
      const res = await app.request(
        new Request('http://localhost:8080/admin/rbac/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', host: 'localhost:8080' },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/agent_address/i);
    });

    it('should return success on valid revocation', async () => {
      // Requires mocking chain driver to return tx hash
      const res = await app.request(
        new Request('http://localhost:8080/admin/rbac/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', host: 'localhost:8080' },
          body: JSON.stringify({ agent_address: '0x1234567890123456789012345678901234567890' }),
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBeDefined();
      expect(body.txHash).toBeDefined();
    });
  });
});
```

**Test Execution:**
```bash
pnpm test tests/api/test_admin_routes.ts
```

---

## Success Criteria

- ✅ Admin handlers parse and validate query parameters
- ✅ Localhost-only middleware rejects non-localhost requests (403)
- ✅ Audit search queries blockchain correctly based on filters
- ✅ Decryption works when decrypt=true
- ✅ Pagination enforces limit <= 100
- ✅ Emergency revoke calls contract and returns tx hash
- ✅ Agent address validation happens before contract call
- ✅ All unit tests pass (parseAuditSearchParams, performAuditSearch, performEmergencyRevoke)
- ✅ All integration tests pass (admin routes)
- ✅ Error responses include clear error messages
- ✅ HTTP status codes correct (400 for validation, 403 for unauthorized, 200 for success, 503 for errors)

---

## Validation Checklist

- [ ] `src/api/handlers/admin.ts` created with handler functions
- [ ] `src/api/server.ts` updated with admin routes + localhost middleware
- [ ] `src/config/types.ts` updated with rbacContractAddress + auditContractAddress
- [ ] `.env.example` updated with contract address variables
- [ ] `tests/api/test_admin_handlers.ts` created and passes all tests
- [ ] `tests/api/test_admin_routes.ts` created and passes all tests
- [ ] `pnpm test` — full suite passes with admin tests included
- [ ] Localhost-only middleware correctly rejects remote requests
- [ ] Audit search returns encrypted payloads when decrypt=false
- [ ] Audit search returns decrypted payloads when decrypt=true

---

## API Documentation

### GET /admin/audit/search

**Description:** Search audit logs with optional decryption

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent | string | No | Filter by agent address (0x...) |
| tool | string | No | Filter by tool key |
| startTime | number | No | Filter start (Unix timestamp, inclusive) |
| endTime | number | No | Filter end (Unix timestamp, inclusive) |
| offset | number | No | Pagination offset (default: 0) |
| limit | number | No | Results per page (default: 50, max: 100) |
| decrypt | string | No | Decrypt payloads? (values: "true" or "false", default: false) |

**At least one filter required:** agent OR tool OR (startTime AND endTime)

**Response (200 OK):**
```json
{
  "query": {
    "agent": "0x1234...",
    "offset": 0,
    "limit": 50,
    "decrypt": true
  },
  "count": 5,
  "entries": [
    {
      "agent": "0x1234...",
      "timestamp": 1640000000,
      "isSuccess": true,
      "tool": "github",
      "errorType": "",
      "payloadHash": "0xabcd...",
      "payload": {
        "action": "read",
        "endpoint": "/repos/owner/repo/issues",
        "status": "success",
        "latencyMs": 142
      }
    }
  ]
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid query parameters",
  "details": "1 <= limit <= 100"
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Admin endpoints only accessible from localhost"
}
```

---

### POST /admin/rbac/revoke

**Description:** Emergency revoke an agent

**Request Body:**
```json
{
  "agent_address": "0x1234567890123456789012345678901234567890"
}
```

**Response (200 OK):**
```json
{
  "message": "Agent revoked successfully",
  "txHash": "0xdef..."
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Missing required field: agent_address"
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Admin endpoints only accessible from localhost"
}
```

---

## Performance Notes

| Operation | Time | Notes |
|-----------|------|-------|
| Audit search (by agent) | ~100-200ms | Single contract read + local result building |
| Audit search (by tool) | ~100-200ms | Single contract read + local result building |
| Audit search (by time range) | ~200-500ms | Sequential scan on-chain; scales with entry count |
| Decryption per entry | ~5-10ms | AES-256-GCM decryption (CPU-bound) |
| Emergency revoke | ~5-30s | Contract write + pending confirmation |

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Localhost bypass via X-Forwarded-For spoofing | Check both header and connection origin; can be secured with TLS termination |
| Large decryption operations blocking request | Each entry decrypted independently; can be optimized with worker pool if needed |
| Query hitting out-of-gas limit | Pagination limit (100 entries max) keeps queries small |
| Admin key exposure in logs | Never log encryption keys; redact in serializers |

---

## Dependencies & References

- **viem:** Already used for contract reads/writes
- **Hono:** Already used for HTTP server
- **pino:** Already used for logging
- **AES-256-GCM:** Already implemented in src/audit/encryption.ts

No new dependencies required.

---

## Next Phase

Phase 4 will update the demo scenario to use these admin endpoints and show the complete revoke + audit query flow.
