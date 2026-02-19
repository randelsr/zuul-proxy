import type { AuditEntry } from '../types.js';
import type { ChainDriver } from '../chain/driver.js';
import type { AuditContractWriter } from './contract.js';
import { getLogger } from '../logging.js';

const logger = getLogger('audit:store');

/**
 * Durable in-memory queue for audit entries
 * Non-blocking: enqueue() returns immediately
 * Flush: background task with exponential backoff retry (3 attempts, 100ms base, full jitter)
 * On graceful shutdown: drain queue to blockchain before exit
 */
export class AuditQueue {
  private queue: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isFlushing = false; // Guard: prevent concurrent flush executions
  private failedEntries: Map<string, number> = new Map(); // auditId → retryCount

  constructor(
    private chainDriver: ChainDriver,
    private contractWriter: AuditContractWriter,
    flushIntervalMs: number = 5000
  ) {
    // Start background flush task
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Flush failed'
        );
      });
    }, flushIntervalMs);
    logger.info({ flushIntervalMs }, 'Audit queue started');

    // Register graceful shutdown
    process.on('SIGTERM', () => {
      this.handleShutdown().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Shutdown handler error'
        );
      });
    });
    process.on('SIGINT', () => {
      this.handleShutdown().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Shutdown handler error'
        );
      });
    });
  }

  /**
   * Enqueue audit entry (non-blocking)
   * @param entry AuditEntry with encrypted payload
   */
  enqueue(entry: AuditEntry): void {
    this.queue.push(entry);
    logger.debug({ auditId: entry.auditId }, 'Audit entry queued');
  }

  /**
   * Flush queue to blockchain with retry logic
   * Exponential backoff: 3 attempts, 100ms base, full jitter
   * Guard: skip flush if one is already in progress (prevents duplicate processing)
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      const entriesToProcess = [...this.queue];
      this.queue = [];

      logger.debug({ count: entriesToProcess.length }, 'Flushing audit queue');

      for (const entry of entriesToProcess) {
        await this.writeWithRetry(entry);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Write entry to blockchain with exponential backoff retry
   * @param entry AuditEntry to write
   */
  private async writeWithRetry(entry: AuditEntry): Promise<void> {
    const maxAttempts = 3;
    const baseDelayMs = 100;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const result = await this.contractWriter.logAudit(entry, this.chainDriver);

        if (!result.ok) {
          throw new Error(result.error.message);
        }

        logger.info(
          { auditId: entry.auditId, txHash: result.value },
          'Audit entry written to blockchain'
        );
        this.failedEntries.delete(entry.auditId);
        return;
      } catch (error) {
        attempt++;
        const retryCount = (this.failedEntries.get(entry.auditId) || 0) + 1;
        this.failedEntries.set(entry.auditId, retryCount);

        if (attempt < maxAttempts) {
          // Exponential backoff with full jitter
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1) * Math.random();
          logger.warn(
            {
              auditId: entry.auditId,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            },
            'Audit write failed, retrying'
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          logger.error(
            {
              auditId: entry.auditId,
              attempts: maxAttempts,
              error: error instanceof Error ? error.message : String(error),
            },
            'Audit write failed after all retries'
          );
          // Re-queue for next flush cycle
          this.queue.push(entry);
        }
      }
    }
  }

  /**
   * Get queue metrics
   */
  getMetrics(): { pending: number; failed: number } {
    return {
      pending: this.queue.length,
      failed: this.failedEntries.size,
    };
  }

  /**
   * Drain queue: flush all remaining entries (called explicitly during graceful shutdown)
   * Must be called from SIGTERM handler before process.exit()
   */
  async drain(): Promise<void> {
    logger.info({}, 'Draining audit queue...');
    let attempts = 0;
    const maxAttempts = 10;

    while (this.queue.length > 0 && attempts < maxAttempts) {
      await this.flush();
      attempts++;
      // Brief delay between flushes to allow retry backoff
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.queue.length > 0) {
      logger.warn(
        { pending: this.queue.length },
        'Audit queue drain timeout; some entries may not have been written'
      );
    } else {
      logger.info({}, 'Audit queue drained successfully');
    }
  }

  /**
   * Handle graceful shutdown: drain queue before exit
   */
  private async handleShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info({}, 'Audit queue: graceful shutdown initiated');

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Call drain to ensure all entries are flushed
    await this.drain();

    logger.info({}, 'Audit queue: shutdown complete');
  }

  /**
   * Destroy queue (for testing)
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.queue = [];
    this.failedEntries.clear();
    this.isShuttingDown = false;
    this.isFlushing = false;
  }
}
