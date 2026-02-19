import { recoverMessageAddress } from 'viem';
import { createHash } from 'crypto';
import type {
  AgentAddress,
  Hash,
  HttpMethod,
  Nonce,
  SignedRequest,
  Signature,
  Timestamp,
} from '../types.js';
import { createAuthError } from '../errors.js';
import type { Result } from '../types.js';
import { isAgentAddress } from './guards.js';
import { getLogger } from '../logging.js';

const logger = getLogger('auth:signature');

/**
 * Build canonical payload for signature verification
 * Format: {METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}
 *
 * This ensures:
 * - Method and full URL are covered (can't replay GET as POST)
 * - Nonce prevents replay attacks
 * - Timestamp prevents stale requests
 *
 * @param method HTTP method
 * @param targetUrl Full target URL
 * @param nonce Unique value per request
 * @param timestamp Unix seconds
 * @returns Canonical payload string
 */
export function buildCanonicalPayload(
  method: HttpMethod,
  targetUrl: string,
  nonce: Nonce,
  timestamp: Timestamp
): string {
  return `${method}\n${targetUrl}\n${nonce}\n${timestamp}`;
}

/**
 * Compute keccak256 hash of payload (EIP-191 uses keccak256)
 * Uses Node.js crypto for SHA256 (keccak256 requires native lib)
 *
 * @param payload Canonical payload
 * @returns Hex-encoded hash
 */
export function hashPayload(payload: string): Hash {
  const hash = createHash('sha256');
  hash.update(payload);
  return `0x${hash.digest('hex')}` as unknown as Hash;
}

/**
 * Recover signer address from EIP-191 signature
 * Uses viem's recoverMessageAddress (purpose-built for agent signatures)
 *
 * @param payload Canonical payload
 * @param signature EIP-191 signature
 * @returns Recovered agent address or AuthError
 */
export async function recoverSigner(
  payload: string,
  signature: Signature
): Promise<Result<AgentAddress, ReturnType<typeof createAuthError>>> {
  try {
    logger.debug({ payloadLength: payload.length }, 'Recovering signer from signature');

    // viem's recoverMessageAddress handles EIP-191 automatically
    const recoveredAddress = await recoverMessageAddress({
      message: payload,
      signature: signature as `0x${string}`,
    });

    if (!isAgentAddress(recoveredAddress)) {
      logger.error({ recoveredAddress }, 'Recovered address is not valid agent address');
      return {
        ok: false,
        error: createAuthError('INVALID_SIGNATURE', { recovered_signer: recoveredAddress }),
      };
    }

    logger.debug({ recoveredAddress }, 'Signer recovered successfully');
    return { ok: true, value: recoveredAddress };
  } catch (error) {
    logger.warn({ error: String(error) }, 'Signature recovery failed');
    return {
      ok: false,
      error: createAuthError('INVALID_SIGNATURE', {
        reason: 'Signature recovery failed',
      }),
    };
  }
}

/**
 * Verify a complete signed request
 * Orchestrates: signature recovery → signer validation → nonce check → timestamp check
 *
 * @param req Signed request with payload, signature, nonce, timestamp
 * @param nonceValidator Nonce validator instance
 * @param timestampValidator Timestamp validator instance
 * @returns Recovered agent address (not claimed address!) or AuthError
 */
export async function verifySignedRequest(
  req: SignedRequest,
  nonceValidator: NonceValidator,
  timestampValidator: TimestampValidator
): Promise<Result<AgentAddress, ReturnType<typeof createAuthError>>> {
  // Step 1: Recover signer from signature
  const recoverResult = await recoverSigner(
    buildCanonicalPayload(req.method, req.targetUrl, req.nonce, req.timestamp),
    req.signature
  );

  if (!recoverResult.ok) {
    return recoverResult;
  }

  const recoveredSigner = recoverResult.value;

  // Step 2: Verify recovered signer matches claimed address
  // (NOTE: use recovered signer, not claimed address, for all future checks)
  if (recoveredSigner.toLowerCase() !== req.agentAddress.toLowerCase()) {
    logger.warn(
      {
        claimed: req.agentAddress,
        recovered: recoveredSigner,
      },
      'Signer mismatch: claimed vs recovered'
    );

    return {
      ok: false,
      error: createAuthError('INVALID_SIGNATURE', {
        expected_signer: req.agentAddress,
        recovered_signer: recoveredSigner,
      }),
    };
  }

  // Step 3: Validate nonce (prevent replay attacks)
  const nonceResult = nonceValidator.validateAndStore(recoveredSigner, req.nonce, req.timestamp);

  if (!nonceResult.ok) {
    return { ok: false, error: nonceResult.error };
  }

  // Step 4: Validate timestamp (prevent stale requests)
  const timestampResult = timestampValidator.validate(req.timestamp);

  if (!timestampResult.ok) {
    return { ok: false, error: timestampResult.error };
  }

  logger.info({ agentAddress: recoveredSigner }, 'Request signature verified');
  return { ok: true, value: recoveredSigner };
}

// ============================================================================
// NONCE VALIDATOR
// ============================================================================

/**
 * Prevent replay attacks using nonce (number used once per agent)
 * Store nonces in-memory with 5-minute expiry
 */
export class NonceValidator {
  private nonceStore: Map<AgentAddress, Map<Nonce, Timestamp>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Validate nonce and store it (prevent reuse)
   * @returns Error if nonce already used
   */
  validateAndStore(
    agent: AgentAddress,
    nonce: Nonce,
    timestamp: Timestamp
  ): Result<void, ReturnType<typeof createAuthError>> {
    const agentNonces = this.nonceStore.get(agent) || new Map();

    // Check if nonce already used
    if (agentNonces.has(nonce)) {
      logger.warn({ agent, nonce }, 'Nonce reuse detected (replay attack)');
      return {
        ok: false,
        error: createAuthError('INVALID_NONCE', { nonce, agent }),
      };
    }

    // Store nonce with timestamp
    agentNonces.set(nonce, timestamp);
    this.nonceStore.set(agent, agentNonces);

    return { ok: true, value: undefined };
  }

  /**
   * Cleanup expired nonces (lazy GC: 5-minute expiry)
   */
  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000) as Timestamp;
    const expiry = 5 * 60; // 5 minutes

    for (const [agent, nonces] of this.nonceStore.entries()) {
      for (const [nonce, timestamp] of nonces.entries()) {
        if (now - timestamp > expiry) {
          nonces.delete(nonce);
        }
      }
      if (nonces.size === 0) {
        this.nonceStore.delete(agent);
      }
    }
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): { totalAgents: number; totalNonces: number } {
    let totalNonces = 0;
    for (const nonces of this.nonceStore.values()) {
      totalNonces += nonces.size;
    }
    return { totalAgents: this.nonceStore.size, totalNonces };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
    }
    this.nonceStore.clear();
  }
}

// ============================================================================
// TIMESTAMP VALIDATOR
// ============================================================================

/**
 * Prevent request timestamp drift (±5 minutes from server time)
 */
export class TimestampValidator {
  private windowSeconds = 5 * 60; // 5 minutes in seconds

  /**
   * Validate that timestamp is within acceptable window
   * @returns Error if outside ±5 minutes
   */
  validate(timestamp: Timestamp): Result<void, ReturnType<typeof createAuthError>> {
    const now = Math.floor(Date.now() / 1000) as Timestamp;
    const drift = Math.abs(now - timestamp);

    if (drift > this.windowSeconds) {
      logger.warn({ timestamp, now, driftSeconds: drift }, 'Timestamp outside acceptable window');

      return {
        ok: false,
        error: createAuthError('TIMESTAMP_DRIFT', {
          timestamp,
          now,
          max_drift_seconds: this.windowSeconds,
        }),
      };
    }

    return { ok: true, value: undefined };
  }
}
