import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseAuditSearchParams,
  performAuditSearch,
  performEmergencyRevoke,
} from '../../src/api/handlers/admin.js';
import { ServiceError } from '../../src/errors.js';
import type { ChainDriver } from '../../src/chain/driver.js';
import type { EncryptionService } from '../../src/audit/encryption.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockChainDriver = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockEncryptionService = any;

describe('API: Admin Handlers', () => {
  let mockChainDriver: MockChainDriver;
  let mockEncryptionService: MockEncryptionService;
  const auditContractAddress = '0x1234567890123456789012345678901234567890';
  const rbacContractAddress = '0x0987654321098765432109876543210987654321';

  beforeEach(() => {
    mockChainDriver = {
      callContract: vi.fn(),
      writeContract: vi.fn(),
    };

    mockEncryptionService = {
      decrypt: vi.fn(),
    };
  });

  describe('parseAuditSearchParams', () => {
    it('should parse agent filter correctly', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agent).toBe('0x1234567890123456789012345678901234567890');
      }
    });

    it('should parse tool filter correctly', () => {
      const query = 'tool=github';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tool).toBe('github');
      }
    });

    it('should parse time range filters correctly', () => {
      const query = 'startTime=1700000000&endTime=1700086400';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.startTime).toBe(1700000000);
        expect(result.value.endTime).toBe(1700086400);
      }
    });

    it('should parse pagination parameters correctly', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890&offset=10&limit=50';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.offset).toBe(10);
        expect(result.value.limit).toBe(50);
      }
    });

    it('should default offset to 0 and limit to 50', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.offset).toBe(0);
        expect(result.value.limit).toBe(50);
      }
    });

    it('should parse decrypt flag correctly', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890&decrypt=true';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decrypt).toBe(true);
      }
    });

    it('should reject offset < 0', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890&offset=-1';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/offset/i);
      }
    });

    it('should reject limit < 1', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890&limit=0';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/limit/i);
      }
    });

    it('should reject limit > 100', () => {
      const query = 'agent=0x1234567890123456789012345678901234567890&limit=101';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/limit/i);
      }
    });

    it('should reject negative timestamps', () => {
      const query = 'startTime=-100&endTime=1700086400';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/timestamp/i);
      }
    });

    it('should reject startTime > endTime', () => {
      const query = 'startTime=1700086400&endTime=1700000000';
      const result = parseAuditSearchParams(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/startTime/i);
      }
    });

    it('should handle empty query string with defaults', () => {
      const query = '';
      const result = parseAuditSearchParams(query);

      // Empty query defaults to offset=0, limit=50, decrypt=false with no filters
      // Parser accepts it; performAuditSearch validates filters
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.offset).toBe(0);
        expect(result.value.limit).toBe(50);
        expect(result.value.decrypt).toBe(false);
        expect(result.value.agent).toBeUndefined();
        expect(result.value.tool).toBeUndefined();
      }
    });
  });

  describe('performAuditSearch', () => {
    it('should query by agent', async () => {
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('encrypted'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      const params = {
        agent: '0x1234567890123456789012345678901234567890',
        offset: 0,
        limit: 50,
        decrypt: false,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(1);
        expect(result.value.entries).toHaveLength(1);
        expect(mockChainDriver.callContract).toHaveBeenCalledWith(
          auditContractAddress,
          [],
          'getEntriesByAgent',
          ['0x1234567890123456789012345678901234567890', BigInt(0), BigInt(50)]
        );
      }
    });

    it('should query by tool', async () => {
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('encrypted'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      const params = {
        tool: 'github',
        offset: 0,
        limit: 50,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(mockChainDriver.callContract).toHaveBeenCalledWith(
          auditContractAddress,
          [],
          'getEntriesByTool',
          ['github', BigInt(0), BigInt(50)]
        );
      }
    });

    it('should query by time range', async () => {
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('encrypted'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      const params = {
        startTime: 1700000000,
        endTime: 1700086400,
        offset: 0,
        limit: 50,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(mockChainDriver.callContract).toHaveBeenCalledWith(
          auditContractAddress,
          [],
          'getEntriesByTimeRange',
          [BigInt(1700000000), BigInt(1700086400), BigInt(0), BigInt(50)]
        );
      }
    });

    it('should reject query with no filters', async () => {
      const params = {
        offset: 0,
        limit: 50,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/filter/i);
      }
    });

    it('should decrypt payloads when requested', async () => {
      const decryptedData = { request: 'data', timestamp: 1700000000 };
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('encrypted_data'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      mockEncryptionService.decrypt.mockReturnValue({
        ok: true,
        value: decryptedData,
      });

      const params = {
        agent: '0x1234567890123456789012345678901234567890',
        offset: 0,
        limit: 50,
        decrypt: true,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entries[0].payload).toEqual(decryptedData);
        expect(result.value.entries[0].encryptedPayload).toBeUndefined();
      }
    });

    it('should handle decryption failures gracefully', async () => {
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('bad_encrypted_data'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      mockEncryptionService.decrypt.mockReturnValue({
        ok: false,
        error: new Error('Decryption failed'),
      });

      const params = {
        agent: '0x1234567890123456789012345678901234567890',
        offset: 0,
        limit: 50,
        decrypt: true,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entries[0].payload).toBeNull();
      }
    });

    it('should handle chain read failures', async () => {
      mockChainDriver.callContract.mockResolvedValue({
        ok: false,
        error: new ServiceError('Blockchain read failed', -32022, 503),
      });

      const params = {
        agent: '0x1234567890123456789012345678901234567890',
        offset: 0,
        limit: 50,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32022);
        expect(result.error.httpStatus).toBe(503);
      }
    });

    it('should include encrypted payload in response when decrypt=false', async () => {
      const mockEntry = {
        agent: '0x1234567890123456789012345678901234567890',
        timestamp: 1700000000,
        isSuccess: true,
        tool: 'github',
        errorType: '',
        payloadHash: '0x' + 'a'.repeat(64),
        encryptedPayload: Buffer.from('encrypted'),
      };

      mockChainDriver.callContract.mockResolvedValue({
        ok: true,
        value: [mockEntry],
      });

      const params = {
        agent: '0x1234567890123456789012345678901234567890',
        offset: 0,
        limit: 50,
        decrypt: false,
      };

      const result = await performAuditSearch(
        params,
        mockChainDriver,
        mockEncryptionService,
        auditContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entries[0].encryptedPayload).toBeDefined();
        expect(result.value.entries[0].payload).toBeUndefined();
      }
    });
  });

  describe('performEmergencyRevoke', () => {
    it('should revoke agent successfully', async () => {
      const txHash = '0xabc123def456';
      const agentAddress = '0x1234567890123456789012345678901234567890';

      mockChainDriver.writeContract.mockResolvedValue({
        ok: true,
        value: txHash,
      });

      const result = await performEmergencyRevoke(
        agentAddress,
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(txHash);
        // The handler uses RBAC_ABI for contract calls
        expect(mockChainDriver.writeContract).toHaveBeenCalled();
        // Verify the call was made with correct agent address
        const calls = (mockChainDriver.writeContract as any).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const lastCall = calls[calls.length - 1];
        expect(lastCall[3]).toContain(agentAddress);
      }
    });

    it('should reject invalid agent address format', async () => {
      const result = await performEmergencyRevoke(
        'not-a-valid-address',
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/address/i);
        expect(result.error.code).toBe(-32600);
        expect(result.error.httpStatus).toBe(400);
      }
    });

    it('should reject address without 0x prefix', async () => {
      const result = await performEmergencyRevoke(
        '1234567890123456789012345678901234567890',
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32600);
      }
    });

    it('should reject address with incorrect length', async () => {
      const result = await performEmergencyRevoke(
        '0x123456789012345678901234567890123456789',
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32600);
      }
    });

    it('should reject address with non-hex characters', async () => {
      const result = await performEmergencyRevoke(
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32600);
      }
    });

    it('should handle blockchain write failures', async () => {
      const agentAddress = '0x1234567890123456789012345678901234567890';

      mockChainDriver.writeContract.mockResolvedValue({
        ok: false,
        error: new ServiceError('Revocation failed', -32022, 503),
      });

      const result = await performEmergencyRevoke(
        agentAddress,
        mockChainDriver,
        rbacContractAddress
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(-32022);
        expect(result.error.httpStatus).toBe(503);
      }
    });
  });
});
