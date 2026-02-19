import type { AuditEntry } from '../types.js';

/**
 * Abstraction for durable audit log storage
 * Implementations: in-memory with retry queue (MVP)
 *
 * MVP: non-persistent in-memory queue with exponential backoff retry
 * Future: persistent queue (SQLite, Redis)
 */
export interface AuditStoreDriver {
  /**
   * Enqueue an audit entry for blockchain submission
   * Non-blocking: returns immediately
   * Entry is added to in-memory queue and flushed asynchronously
   *
   * If proxy crashes before flush, entry is lost (acknowledged MVP limitation)
   */
  enqueue(entry: AuditEntry): void;

  /**
   * Flush all queued entries to blockchain
   * Called automatically on interval (1s) and graceful shutdown (SIGTERM)
   *
   * Retries on failure: exponential backoff (3 attempts, 100ms base, full jitter)
   * On ultimate failure: error surfaced to monitoring, proxy continues operating
   */
  flush(): Promise<void>;

  /**
   * Get count of entries currently in queue (debugging)
   */
  pendingCount(): number;
}
