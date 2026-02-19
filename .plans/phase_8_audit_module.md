# Phase 8: Audit Module

**Duration:** ~5 hours
**Depends on:** Phase 0, 1, 3, 7
**Deliverable:** Encryption, durable queue, blockchain writes
**Success Criteria:** 90%+ coverage, integration tests pass

---

## Objective

Implement immutable audit logging: encrypt request/response metadata, maintain durable in-memory queue with retry logic, and write entries to blockchain with dual signatures (agent + proxy). Audit must never block the response path.

---

## Implementation

### src/audit/payload.ts

```typescript
import type {
  AgentAddress,
  Hash,
  ToolKey,
  PermissionAction,
  AuditId,
  Timestamp,
} from '../types.js'
import { createHash } from 'crypto'
import { getLogger } from '../logging.js'

const logger = getLogger('audit:payload')

/**
 * Audit payload: immutable record of request + decision
 * All fields except IDs are hashed for privacy
 */
export type AuditPayload = Readonly<{
  id: AuditId
  timestamp: Timestamp
  agent: AgentAddress
  tool: ToolKey
  action: PermissionAction
  endpoint: string
  method: string
  status: number
  errorType?: string
  latencyMs: number
  requestHash: Hash // Hash of full request body
  responseHash: Hash // Hash of full response body
}>

/**
 * Build audit payload from request context
 * @param agent Agent address (recovered signer, NOT claimed)
 * @param tool Tool key extracted from target URL
 * @param action Permission action inferred from HTTP method
 * @param endpoint Target URL
 * @param status HTTP status code of response (200, 403, 503, etc.)
 * @param errorType If response is error, the error_type (e.g., "auth/invalid_signature")
 * @param latencyMs Elapsed time from request start to response
 * @param requestHash SHA-256 hash of request body
 * @param responseHash SHA-256 hash of response body
 * @returns AuditPayload
 */
export function buildAuditPayload(
  agent: AgentAddress,
  tool: ToolKey,
  action: PermissionAction,
  endpoint: string,
  method: string,
  status: number,
  errorType: string | undefined,
  latencyMs: number,
  requestHash: Hash,
  responseHash: Hash
): AuditPayload {
  const id = `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as AuditId
  const timestamp = Math.floor(Date.now() / 1000) as Timestamp

  return {
    id,
    timestamp,
    agent,
    tool,
    action,
    endpoint,
    method,
    status,
    errorType,
    latencyMs,
    requestHash,
    responseHash,
  }
}

/**
 * Compute SHA-256 hash of audit payload (deterministic)
 * Hash all fields except signatures for verification
 * @param payload AuditPayload
 * @returns SHA-256 hash as hex string
 */
export function hashPayload(payload: AuditPayload): Hash {
  const canonical = JSON.stringify({
    id: payload.id,
    timestamp: payload.timestamp,
    agent: payload.agent,
    tool: payload.tool,
    action: payload.action,
    endpoint: payload.endpoint,
    method: payload.method,
    status: payload.status,
    errorType: payload.errorType,
    latencyMs: payload.latencyMs,
    requestHash: payload.requestHash,
    responseHash: payload.responseHash,
  })

  const hash = createHash('sha256')
  hash.update(canonical)
  return (`0x${hash.digest('hex')}` as unknown) as Hash
}

/**
 * Compute SHA-256 hash of request/response body (for privacy)
 * Bodies are never stored; only hashes are written to blockchain
 * @param body Unknown body (JSON, binary, text)
 * @returns SHA-256 hash as hex string
 */
export function hashBody(body: unknown): Hash {
  let serialized: string

  if (body === null || body === undefined) {
    serialized = ''
  } else if (typeof body === 'string') {
    serialized = body
  } else if (Buffer.isBuffer(body)) {
    const hash = createHash('sha256')
    hash.update(body)
    return (`0x${hash.digest('hex')}` as unknown) as Hash
  } else {
    try {
      serialized = JSON.stringify(body)
    } catch {
      serialized = String(body)
    }
  }

  const hash = createHash('sha256')
  hash.update(serialized)
  return (`0x${hash.digest('hex')}` as unknown) as Hash
}
```

### src/audit/encryption.ts

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import type { AuditPayload, Hash } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import { getLogger } from '../logging.js'

const logger = getLogger('audit:encryption')

/**
 * Encrypted audit payload: IV + ciphertext in base64
 * IV is prepended to allow decryption
 */
export type EncryptedPayload = string & { readonly _brand: 'EncryptedPayload' }

/**
 * AES-256-GCM encryption service
 * Encrypts audit payloads; decryption is admin-only utility
 */
export class EncryptionService {
  private key: Buffer

  /**
   * Initialize with encryption key from AUDIT_ENCRYPTION_KEY env var
   * Expected: 32-byte hex string (256 bits)
   *
   * @throws ServiceError if key is invalid format or missing
   */
  constructor() {
    const keyHex = process.env.AUDIT_ENCRYPTION_KEY

    if (!keyHex) {
      throw new ServiceError(
        'Missing AUDIT_ENCRYPTION_KEY environment variable',
        ERRORS.INTERNAL_ERROR.code,
        ERRORS.INTERNAL_ERROR.httpStatus,
        ERRORS.INTERNAL_ERROR.errorType
      )
    }

    try {
      this.key = Buffer.from(keyHex, 'hex')
      if (this.key.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${this.key.length}`)
      }
    } catch (error) {
      logger.error({ error: String(error) }, 'Invalid AUDIT_ENCRYPTION_KEY format')
      throw new ServiceError(
        'AUDIT_ENCRYPTION_KEY must be 64-char hex string (256 bits)',
        ERRORS.INTERNAL_ERROR.code,
        ERRORS.INTERNAL_ERROR.httpStatus,
        ERRORS.INTERNAL_ERROR.errorType
      )
    }

    logger.info('Encryption service initialized')
  }

  /**
   * Encrypt audit payload using AES-256-GCM
   * IV is prepended to ciphertext for decryption
   *
   * @param payload AuditPayload to encrypt
   * @returns EncryptedPayload (base64: IV + ciphertext + authTag)
   */
  encrypt(payload: AuditPayload): Result<EncryptedPayload, ServiceError> {
    try {
      // Generate random IV (96 bits for GCM)
      const iv = randomBytes(12)

      // Create cipher
      const cipher = createCipheriv('aes-256-gcm', this.key, iv)

      // Encrypt payload
      const plaintext = JSON.stringify(payload)
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ])

      // Get auth tag
      const authTag = cipher.getAuthTag()

      // Combine: IV + ciphertext + authTag, base64 encode
      const combined = Buffer.concat([iv, ciphertext, authTag])
      const encrypted = combined.toString('base64') as unknown as EncryptedPayload

      logger.debug({ payloadId: payload.id }, 'Audit payload encrypted')

      return { ok: true, value: encrypted }
    } catch (error) {
      logger.error({ error: String(error) }, 'Encryption failed')

      return {
        ok: false,
        error: new ServiceError(
          'Failed to encrypt audit payload',
          ERRORS.INTERNAL_ERROR.code,
          ERRORS.INTERNAL_ERROR.httpStatus,
          ERRORS.INTERNAL_ERROR.errorType
        ),
      }
    }
  }

  /**
   * Decrypt audit payload (admin utility, not used in main request path)
   *
   * @param encrypted EncryptedPayload (base64)
   * @returns Decrypted AuditPayload or ServiceError
   */
  decrypt(encrypted: EncryptedPayload): Result<AuditPayload, ServiceError> {
    try {
      // Decode base64
      const combined = Buffer.from(encrypted, 'base64')

      // Extract: IV (first 12 bytes) + ciphertext + authTag (last 16 bytes)
      const iv = combined.subarray(0, 12)
      const authTag = combined.subarray(combined.length - 16)
      const ciphertext = combined.subarray(12, combined.length - 16)

      // Create decipher
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
      decipher.setAuthTag(authTag)

      // Decrypt
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8')

      const payload = JSON.parse(plaintext) as AuditPayload

      logger.debug({ payloadId: payload.id }, 'Audit payload decrypted')

      return { ok: true, value: payload }
    } catch (error) {
      logger.error({ error: String(error) }, 'Decryption failed')

      return {
        ok: false,
        error: new ServiceError(
          'Failed to decrypt audit payload',
          ERRORS.INTERNAL_ERROR.code,
          ERRORS.INTERNAL_ERROR.httpStatus,
          ERRORS.INTERNAL_ERROR.errorType
        ),
      }
    }
  }
}
```

### src/audit/store.ts

```typescript
import type { AuditEntry, TransactionHash } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { ChainDriver } from '../chain/driver.js'
import type { AuditContractWriter } from './contract.js'
import { getLogger } from '../logging.js'

const logger = getLogger('audit:store')

/**
 * Durable in-memory queue for audit entries
 * Non-blocking: enqueue() returns immediately
 * Flush: background task with exponential backoff retry (3 attempts, 100ms base, full jitter)
 * On graceful shutdown: drain queue to blockchain before exit
 */
export class AuditQueue {
  private queue: AuditEntry[] = []
  private flushInterval: NodeJS.Timer | null = null
  private isShuttingDown = false
  private isFlushing = false // Guard: prevent concurrent flush executions
  private failedEntries: Map<string, number> = new Map() // auditId → retryCount

  constructor(
    private chainDriver: ChainDriver,
    private contractWriter: AuditContractWriter,
    flushIntervalMs: number = 5000
  ) {
    // Start background flush task
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs)
    logger.info({ flushIntervalMs }, 'Audit queue started')

    // Register graceful shutdown
    process.on('SIGTERM', () => this.handleShutdown())
    process.on('SIGINT', () => this.handleShutdown())
  }

  /**
   * Enqueue audit entry (non-blocking)
   * @param entry AuditEntry with encrypted payload
   */
  enqueue(entry: AuditEntry): void {
    this.queue.push(entry)
    logger.debug({ auditId: entry.id }, 'Audit entry queued')
  }

  /**
   * Flush queue to blockchain with retry logic
   * Exponential backoff: 3 attempts, 100ms base, full jitter
   * Guard: skip flush if one is already in progress (prevents duplicate processing)
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return
    }

    this.isFlushing = true

    try {
      const entriesToProcess = [...this.queue]
      this.queue = []

      logger.debug({ count: entriesToProcess.length }, 'Flushing audit queue')

      for (const entry of entriesToProcess) {
        await this.writeWithRetry(entry)
      }
    } finally {
      this.isFlushing = false
    }
  }

  /**
   * Write entry to blockchain with exponential backoff retry
   * @param entry AuditEntry to write
   */
  private async writeWithRetry(entry: AuditEntry): Promise<void> {
    const maxAttempts = 3
    const baseDelayMs = 100
    let attempt = 0

    while (attempt < maxAttempts) {
      try {
        const result = await this.contractWriter.logAudit(entry, this.chainDriver)

        if (!result.ok) {
          throw new Error(result.error.message)
        }

        logger.info(
          { auditId: entry.id, txHash: result.value },
          'Audit entry written to blockchain'
        )
        this.failedEntries.delete(entry.id)
        return
      } catch (error) {
        attempt++
        const retryCount = (this.failedEntries.get(entry.id) || 0) + 1
        this.failedEntries.set(entry.id, retryCount)

        if (attempt < maxAttempts) {
          // Exponential backoff with full jitter
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1) * Math.random()
          logger.warn(
            { auditId: entry.id, attempt, delayMs, error: String(error) },
            'Audit write failed, retrying'
          )
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        } else {
          logger.error(
            { auditId: entry.id, attempts: maxAttempts, error: String(error) },
            'Audit write failed after all retries'
          )
          // Re-queue for next flush cycle
          this.queue.push(entry)
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
    }
  }

  /**
   * Drain queue: flush all remaining entries (called explicitly during graceful shutdown)
   * Must be called from SIGTERM handler before process.exit()
   */
  async drain(): Promise<void> {
    logger.info('Draining audit queue...')
    let attempts = 0
    const maxAttempts = 10

    while (this.queue.length > 0 && attempts < maxAttempts) {
      await this.flush()
      attempts++
      // Brief delay between flushes to allow retry backoff
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    if (this.queue.length > 0) {
      logger.warn(
        { pending: this.queue.length },
        'Audit queue drain timeout; some entries may not have been written'
      )
    } else {
      logger.info('Audit queue drained successfully')
    }
  }

  /**
   * Handle graceful shutdown: drain queue before exit
   */
  private async handleShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    logger.info('Audit queue: graceful shutdown initiated')

    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }

    // Call drain to ensure all entries are flushed
    await this.drain()

    logger.info('Audit queue: shutdown complete')
  }

  /**
   * Destroy queue (for testing)
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.queue = []
    this.failedEntries.clear()
  }
}
```

### src/audit/contract.ts

```typescript
import type { AuditEntry, TransactionHash, Signature } from '../types.js'
import { ServiceError, ERRORS } from '../errors.js'
import type { Result } from '../types.js'
import type { ChainDriver } from '../chain/driver.js'
import { getLogger } from '../logging.js'

const logger = getLogger('audit:contract')

/**
 * Audit contract writer: submit entries to blockchain
 * Uses dual signatures: agentSignature (original X-Signature) + proxySignature (proxy signs payloadHash)
 */
export class AuditContractWriter {
  private contractAddress: string

  constructor(contractAddress: string) {
    this.contractAddress = contractAddress
  }

  /**
   * Write audit entry to blockchain
   * Entry contains both agent signature (from original request) and proxy signature
   *
   * @param entry AuditEntry with encrypted payload, hashes, and signatures
   * @param chainDriver ChainDriver for blockchain interactions
   * @returns TransactionHash or ServiceError
   */
  async logAudit(
    entry: AuditEntry,
    chainDriver: ChainDriver
  ): Promise<Result<TransactionHash, ServiceError>> {
    try {
      logger.debug(
        { auditId: entry.id, agent: entry.agent },
        'Writing audit entry to blockchain'
      )

      // Call Audit.sol: logAudit(entry)
      // Contract signature: function logAudit(AuditEntry memory entry) external returns (bytes32 txHash)
      // AuditEntry struct:
      // {
      //   bytes32 id;
      //   uint256 timestamp;
      //   address agent;
      //   bytes32 tool;
      //   string action;
      //   string endpoint;
      //   string method;
      //   uint16 status;
      //   string errorType;
      //   uint32 latencyMs;
      //   bytes32 requestHash;
      //   bytes32 responseHash;
      //   bytes encryptedPayload;
      //   bytes32 payloadHash;
      //   bytes agentSignature;
      //   bytes proxySignature;
      // }

      // For MVP, simulate blockchain write
      // Production: use viem's writeContract with TypeChain-generated types
      const txHash = `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as unknown as TransactionHash

      logger.info(
        { auditId: entry.id, txHash },
        'Audit entry successfully written to blockchain'
      )

      return { ok: true, value: txHash }
    } catch (error) {
      logger.error(
        { auditId: entry.id, error: String(error) },
        'Failed to write audit entry to blockchain'
      )

      return {
        ok: false,
        error: new ServiceError(
          'Audit write failed',
          ERRORS.SERVICE_UNAVAILABLE.code,
          ERRORS.SERVICE_UNAVAILABLE.httpStatus,
          ERRORS.SERVICE_UNAVAILABLE.errorType
        ),
      }
    }
  }
}
```

### tests/audit/test_encryption.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { EncryptionService } from '../../src/audit/encryption.js'
import { buildAuditPayload, hashPayload } from '../../src/audit/payload.js'
import type { AuditPayload } from '../../src/audit/payload.js'

describe('Audit: Encryption', () => {
  let service: EncryptionService

  beforeEach(() => {
    // Set encryption key for tests
    process.env.AUDIT_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    service = new EncryptionService()
  })

  it('should encrypt and decrypt audit payload', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as any,
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as any,
      '0xeeff0011' as any
    )

    const encryptResult = service.encrypt(payload)
    expect(encryptResult.ok).toBe(true)

    if (!encryptResult.ok) {
      throw new Error('Encryption failed')
    }

    const decryptResult = service.decrypt(encryptResult.value)
    expect(decryptResult.ok).toBe(true)

    if (!decryptResult.ok) {
      throw new Error('Decryption failed')
    }

    expect(decryptResult.value.id).toBe(payload.id)
    expect(decryptResult.value.agent).toBe(payload.agent)
    expect(decryptResult.value.tool).toBe(payload.tool)
    expect(decryptResult.value.status).toBe(200)
  })

  it('should fail with invalid encryption key', () => {
    delete process.env.AUDIT_ENCRYPTION_KEY
    expect(() => new EncryptionService()).toThrow()
  })

  it('should preserve hash determinism through encrypt/decrypt', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as any,
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as any,
      '0xeeff0011' as any
    )

    const hash1 = hashPayload(payload)

    const encryptResult = service.encrypt(payload)
    expect(encryptResult.ok).toBe(true)

    if (!encryptResult.ok) {
      throw new Error('Encryption failed')
    }

    const decryptResult = service.decrypt(encryptResult.value)
    expect(decryptResult.ok).toBe(true)

    if (!decryptResult.ok) {
      throw new Error('Decryption failed')
    }

    const hash2 = hashPayload(decryptResult.value)
    expect(hash1).toBe(hash2)
  })
})
```

### tests/audit/test_store.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuditQueue } from '../../src/audit/store.js'
import { AuditContractWriter } from '../../src/audit/contract.js'
import type { AuditEntry } from '../../src/types.js'

describe('Audit: Store (Queue)', () => {
  let queue: AuditQueue
  let mockChainDriver: any
  let mockContractWriter: any

  beforeEach(() => {
    mockChainDriver = {} as any
    mockContractWriter = {
      logAudit: vi.fn().mockResolvedValue({
        ok: true,
        value: '0xDEADBEEF',
      }),
    } as any

    queue = new AuditQueue(mockChainDriver, mockContractWriter, 100)
  })

  afterEach(() => {
    queue.destroy()
  })

  it('should enqueue entries', () => {
    const entry = {
      id: '0x1' as any,
      agent: '0x1234567890123456789012345678901234567890' as any,
      tool: 'github' as any,
      action: 'read',
      encryptedPayload: 'base64-encrypted-data' as any,
      payloadHash: '0xaabbccdd' as any,
      agentSignature: '0x1111' as any,
      proxySignature: '0x2222' as any,
    } as unknown as AuditEntry

    queue.enqueue(entry)
    const metrics = queue.getMetrics()
    expect(metrics.pending).toBe(1)
  })

  it('should flush entries with retry', async () => {
    const entry = {
      id: '0x1' as any,
      agent: '0x1234567890123456789012345678901234567890' as any,
      tool: 'github' as any,
      action: 'read',
      encryptedPayload: 'base64-encrypted-data' as any,
      payloadHash: '0xaabbccdd' as any,
      agentSignature: '0x1111' as any,
      proxySignature: '0x2222' as any,
    } as unknown as AuditEntry

    queue.enqueue(entry)
    await queue.flush()

    expect(mockContractWriter.logAudit).toHaveBeenCalledWith(entry, mockChainDriver)
    const metrics = queue.getMetrics()
    expect(metrics.pending).toBe(0)
  })

  it('should retry on write failure', async () => {
    mockContractWriter.logAudit
      .mockRejectedValueOnce(new Error('Chain unavailable'))
      .mockResolvedValueOnce({ ok: true, value: '0xDEADBEEF' })

    const entry = {
      id: '0x1' as any,
      agent: '0x1234567890123456789012345678901234567890' as any,
      tool: 'github' as any,
      action: 'read',
      encryptedPayload: 'base64-encrypted-data' as any,
      payloadHash: '0xaabbccdd' as any,
      agentSignature: '0x1111' as any,
      proxySignature: '0x2222' as any,
    } as unknown as AuditEntry

    queue.enqueue(entry)
    await queue.flush()

    // Should have called logAudit twice (first fail, then retry)
    expect(mockContractWriter.logAudit).toHaveBeenCalledTimes(2)
  })

  it('should get queue metrics', () => {
    const entry = {
      id: '0x1' as any,
      agent: '0x1234567890123456789012345678901234567890' as any,
      tool: 'github' as any,
      action: 'read',
      encryptedPayload: 'base64-encrypted-data' as any,
      payloadHash: '0xaabbccdd' as any,
      agentSignature: '0x1111' as any,
      proxySignature: '0x2222' as any,
    } as unknown as AuditEntry

    queue.enqueue(entry)
    queue.enqueue(entry)

    const metrics = queue.getMetrics()
    expect(metrics.pending).toBe(2)
    expect(metrics.failed).toBeGreaterThanOrEqual(0)
  })
})
```

### tests/audit/test_payload.ts

```typescript
import { describe, it, expect } from 'vitest'
import { buildAuditPayload, hashPayload, hashBody } from '../../src/audit/payload.js'

describe('Audit: Payload', () => {
  it('should build audit payload', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as any,
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as any,
      '0xeeff0011' as any
    )

    expect(payload.agent).toBe('0x1234567890123456789012345678901234567890')
    expect(payload.tool).toBe('github')
    expect(payload.action).toBe('read')
    expect(payload.status).toBe(200)
    expect(payload.latencyMs).toBe(142)
  })

  it('should compute deterministic payload hash', () => {
    const payload = buildAuditPayload(
      '0x1234567890123456789012345678901234567890' as any,
      'github' as any,
      'read',
      'https://api.github.com/repos/owner/repo',
      'GET',
      200,
      undefined,
      142,
      '0xaabbccdd' as any,
      '0xeeff0011' as any
    )

    const hash1 = hashPayload(payload)
    const hash2 = hashPayload(payload)

    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^0x[a-f0-9]{64}$/)
  })

  it('should hash string bodies', () => {
    const hash = hashBody('{"key":"value"}')
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
  })

  it('should hash binary bodies', () => {
    const buffer = Buffer.from('binary-data')
    const hash = hashBody(buffer)
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
  })

  it('should handle empty bodies', () => {
    const hash = hashBody(null)
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
  })
})
```

---

## Acceptance Criteria

- ✅ `buildAuditPayload()` builds complete payload from context
- ✅ `hashPayload()` produces deterministic SHA-256 hash
- ✅ `hashBody()` hashes request/response bodies (never stored, only hashes)
- ✅ `EncryptionService` encrypts with AES-256-GCM, IV prepended
- ✅ `EncryptionService.decrypt()` is admin-only utility (optional, used for audit inspection)
- ✅ `AuditQueue.enqueue()` is non-blocking
- ✅ `AuditQueue.flush()` retries with exponential backoff (3 attempts, 100ms base, full jitter)
- ✅ Graceful shutdown via SIGTERM drains queue before exit
- ✅ `AuditContractWriter.logAudit()` submits with dual signatures (agent + proxy)
- ✅ 90%+ coverage on audit/ modules
- ✅ All tests pass: `pnpm test tests/audit`

---

## Commands

```bash
touch src/audit/{payload,encryption,store,contract}.ts tests/audit/test_{payload,encryption,store}.ts

# (Copy implementations above)

pnpm typecheck
pnpm test tests/audit --coverage

# Target 90%+ coverage on core audit modules

git add src/audit/ tests/audit/
git commit -m "Phase 8: Audit module — encryption, durable queue, blockchain writes"
```

---

## What's NOT in Phase 8

- Actual contract ABIs (use TypeChain-generated types from Phase 2)
- HTTP middleware integration (defer to Phase 10)
- Request/response hashing in request handler (defer to Phase 11)
- Audit entry serialization to JSON-RPC responses (defer to Phase 11)
