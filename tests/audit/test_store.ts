import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditQueue } from '../../src/audit/store.js';
import type {
  AuditEntry,
  AuditId,
  Timestamp,
  EncryptedPayload,
  Hash,
  Signature,
} from '../../src/types.js';
import type { ChainDriver } from '../../src/chain/driver.js';
import type { AuditContractWriter } from '../../src/audit/contract.js';

function createMockEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  const base: AuditEntry = {
    auditId: '0x1' as AuditId,
    timestamp: 1234567890 as Timestamp,
    encryptedPayload: 'base64-encrypted-data' as EncryptedPayload,
    payloadHash: '0xaabbccdd' as Hash,
    agentSignature: '0x1111' as Signature,
    proxySignature: '0x2222' as Signature,
  };
  return { ...base, ...overrides };
}

describe('Audit: Store (Queue)', () => {
  let queue: AuditQueue;
  let mockChainDriver: ChainDriver;
  let mockContractWriter: AuditContractWriter;

  beforeEach(() => {
    mockChainDriver = {} as ChainDriver;
    mockContractWriter = {
      logAudit: vi.fn().mockResolvedValue({
        ok: true,
        value: '0xDEADBEEF',
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    queue = new AuditQueue(mockChainDriver, mockContractWriter, 100);
  });

  afterEach(() => {
    queue.destroy();
  });

  it('should enqueue entries', () => {
    const entry = createMockEntry();

    queue.enqueue(entry);
    const metrics = queue.getMetrics();
    expect(metrics.pending).toBe(1);
  });

  it('should flush entries', async () => {
    const entry = createMockEntry();

    queue.enqueue(entry);
    await queue.flush();

    expect(mockContractWriter.logAudit).toHaveBeenCalledWith(entry, mockChainDriver);
    const metrics = queue.getMetrics();
    expect(metrics.pending).toBe(0);
  });

  it('should retry on write failure', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Chain unavailable'))
      .mockResolvedValueOnce({ ok: true, value: '0xDEADBEEF' });

    mockContractWriter = {
      logAudit: mockFn,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    queue = new AuditQueue(mockChainDriver, mockContractWriter, 100);

    const entry = createMockEntry();

    queue.enqueue(entry);
    await queue.flush();

    // Should have called logAudit twice (first fail, then retry)
    expect(mockFn).toHaveBeenCalledTimes(2);

    queue.destroy();
  });

  it('should get queue metrics', () => {
    const entry = createMockEntry();

    queue.enqueue(entry);
    queue.enqueue(entry);

    const metrics = queue.getMetrics();
    expect(metrics.pending).toBe(2);
    expect(metrics.failed).toBeGreaterThanOrEqual(0);
  });

  it('should handle multiple flushes', async () => {
    const entry1 = createMockEntry();
    const entry2 = createMockEntry({
      auditId: '0x2' as AuditId,
      timestamp: 1234567891 as Timestamp,
    });

    queue.enqueue(entry1);
    queue.enqueue(entry2);

    await queue.flush();

    expect(mockContractWriter.logAudit).toHaveBeenCalledTimes(2);
    const metrics = queue.getMetrics();
    expect(metrics.pending).toBe(0);
  });

  it('should skip flush if already flushing', async () => {
    // Track the number of concurrent logAudit executions
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    const testMockFn = vi.fn().mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentCalls--;
      return { ok: true, value: '0xDEADBEEF' };
    });

    const testMockWriter = {
      logAudit: testMockFn,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Create a new queue
    const testQueue = new AuditQueue(mockChainDriver, testMockWriter, 10000);
    const entry1 = createMockEntry();
    const entry2 = createMockEntry({ auditId: '0x2' as AuditId });

    testQueue.enqueue(entry1);
    testQueue.enqueue(entry2);

    // Call flush twice in quick succession
    const flush1 = testQueue.flush();
    const flush2 = testQueue.flush();

    await Promise.all([flush1, flush2]);

    // Even though we called flush() twice, only one flush cycle should
    // have executed (second call detected isFlushing and returned)
    // So logAudit should be called exactly twice (once per entry)
    expect(testMockFn).toHaveBeenCalledTimes(2);
    // And concurrent executions should never exceed 1
    // (because all executions happened in a single flush cycle)
    expect(maxConcurrentCalls).toBeLessThanOrEqual(1);

    testQueue.destroy();
  });

  it('should skip flush if queue is empty', async () => {
    // Queue is empty, flush should do nothing
    await queue.flush();

    // logAudit should not have been called
    expect(mockContractWriter.logAudit).not.toHaveBeenCalled();
  });
});
