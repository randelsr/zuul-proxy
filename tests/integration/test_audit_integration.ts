import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuditQueue } from '../../src/audit/store.js';
import { AuditContractWriter } from '../../src/audit/contract.js';
import { EncryptionService } from '../../src/audit/encryption.js';
import { buildAuditPayload, hashPayload } from '../../src/audit/payload.js';
import { LocalChainDriver } from '../../src/chain/local.js';
import type { AuditEntry } from '../../src/types.js';

describe('Integration: Audit Queue and Blockchain', () => {
  let auditQueue: AuditQueue;
  let chainDriver: LocalChainDriver;
  let contractWriter: AuditContractWriter;
  let encryptionService: EncryptionService;

  beforeAll(() => {
    process.env.AUDIT_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    chainDriver = new LocalChainDriver();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contractWriter = new AuditContractWriter('0x' as any);
    auditQueue = new AuditQueue(chainDriver, contractWriter, 100);
    encryptionService = new EncryptionService();
  });

  afterAll(() => {
    auditQueue.destroy();
  });

  it('should queue audit entry and flush to blockchain', async () => {
    const payload = buildAuditPayload(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0x1234567890123456789012345678901234567890' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0xaabbccdd' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0xeeff0011' as any
    );

    const encryptResult = encryptionService.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const entry: AuditEntry = {
      auditId: payload.id,
      timestamp: payload.timestamp,
      encryptedPayload: encryptResult.value,
      payloadHash: hashPayload(payload),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentSignature: '0xsignature' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proxySignature: '0xproxysignature' as any,
    };

    auditQueue.enqueue(entry);
    const metricsBeforeFlush = auditQueue.getMetrics();
    expect(metricsBeforeFlush.pending).toBeGreaterThan(0);

    await auditQueue.flush();
    const metricsAfterFlush = auditQueue.getMetrics();
    expect(metricsAfterFlush.pending).toBe(0);
  });

  it('should handle encryption and decryption through queue', async () => {
    const payload = buildAuditPayload(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0x1234567890123456789012345678901234567890' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'slack' as any,
      'create',
      'https://slack.com/api/conversations.list',
      'POST',
      201,
      undefined,
      256,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0x11111111' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0x22222222' as any
    );

    const encryptResult = encryptionService.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const decryptResult = encryptionService.decrypt(encryptResult.value);
    expect(decryptResult.ok).toBe(true);

    if (!decryptResult.ok) {
      throw new Error('Decryption failed');
    }

    expect(decryptResult.value.id).toBe(payload.id);
    expect(decryptResult.value.tool).toBe(payload.tool);
    expect(decryptResult.value.action).toBe(payload.action);
  });

  it('should retry failed audit writes', async () => {
    // Configure chain to fail once, then succeed
    chainDriver.setFailure(true);

    const payload = buildAuditPayload(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0x1234567890123456789012345678901234567890' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0xaabbccdd' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      '0xeeff0011' as any
    );

    const encryptResult = encryptionService.encrypt(payload);
    expect(encryptResult.ok).toBe(true);

    if (!encryptResult.ok) {
      throw new Error('Encryption failed');
    }

    const entry: AuditEntry = {
      auditId: payload.id,
      timestamp: payload.timestamp,
      encryptedPayload: encryptResult.value,
      payloadHash: hashPayload(payload),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentSignature: '0xsignature' as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proxySignature: '0xproxysignature' as any,
    };

    auditQueue.enqueue(entry);

    // First flush: will fail and re-queue
    await auditQueue.flush();

    // Reset chain
    chainDriver.setFailure(false);

    // Second flush: should succeed
    await auditQueue.flush();

    const metrics = auditQueue.getMetrics();
    expect(metrics.pending).toBe(0);
  });
});
