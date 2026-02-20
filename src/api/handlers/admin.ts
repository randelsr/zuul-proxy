import type { Result } from '../../types.js';
import type { ChainDriver } from '../../chain/driver.js';
import type { EncryptionService } from '../../audit/encryption.js';
import type { EncryptedPayload } from '../../types.js';
import { ServiceError } from '../../errors.js';
import { getLogger } from '../../logging.js';
import { AUDIT_ABI, RBAC_ABI } from '../../contracts/abis.js';

const logger = getLogger('api:admin');

/**
 * Query parameters for audit search
 * Note: tool-based queries removed for privacy (tool is encrypted in payload)
 */
export type AuditSearchParams = Readonly<{
  agent?: string; // Filter by agent address (0x...)
  startTime?: number; // Unix timestamp start (inclusive)
  endTime?: number; // Unix timestamp end (inclusive)
  offset?: number; // Pagination offset (default: 0)
  limit?: number; // Pagination limit (default: 50, max: 100)
  decrypt?: boolean; // Decrypt payloads? (default: false)
}>;

/**
 * Audit search result
 *
 * Privacy-first design:
 * - On-chain: agent, timestamp, payloadHash, encryptedPayload (4 fields)
 * - Decrypted: tool, action, status, errorType (from encrypted payload only)
 */
export type AuditSearchResult = Readonly<{
  query: AuditSearchParams;
  count: number;
  entries: ReadonlyArray<{
    agent: string;
    timestamp: number;
    payloadHash: string;
    encryptedPayload?: string; // If decrypt=false
    payload?: Record<string, unknown>; // If decrypt=true
    tool?: string; // Only if decrypt=true (from decrypted payload)
    action?: string; // Only if decrypt=true (from decrypted payload)
    status?: number; // Only if decrypt=true (from decrypted payload)
    errorType?: string; // Only if decrypt=true (from decrypted payload)
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

    const agent = params.get('agent');

    return {
      ok: true,
      value: {
        ...(agent !== null && { agent }),
        startTime,
        endTime,
        offset,
        limit,
        decrypt: params.has('decrypt') && params.get('decrypt') === 'true',
      } as AuditSearchParams,
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
    let entries: readonly unknown[];

    // Determine query path based on filters
    if (params.agent) {
      // Query by agent
      const agentResult = await chainDriver.callContract<unknown>(
        auditContractAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [params.agent, BigInt(params.offset || 0), BigInt(params.limit || 50)]
      );

      if (!agentResult.ok) {
        logger.error({ agent: params.agent }, 'Failed to query entries by agent');
        return {
          ok: false,
          error: new ServiceError('Blockchain read failed', -32022, 503, 'service/unavailable'),
        };
      }

      entries = agentResult.value as readonly unknown[];
    } else if (params.startTime !== undefined && params.endTime !== undefined) {
      // Query by time range
      const timeResult = await chainDriver.callContract<unknown>(
        auditContractAddress,
        AUDIT_ABI,
        'getEntriesByTimeRange',
        [
          BigInt(params.startTime),
          BigInt(params.endTime),
          BigInt(params.offset || 0),
          BigInt(params.limit || 50),
        ]
      );

      if (!timeResult.ok) {
        logger.error(
          { startTime: params.startTime, endTime: params.endTime },
          'Failed to query entries by time range'
        );
        return {
          ok: false,
          error: new ServiceError('Blockchain read failed', -32022, 503, 'service/unavailable'),
        };
      }

      entries = timeResult.value as readonly unknown[];
    } else {
      // No filter specified
      return {
        ok: false,
        error: new ServiceError(
          'At least one filter required: agent or time range',
          -32600,
          400,
          'request/invalid'
        ),
      };
    }

    // Transform entries for response
    // Privacy-first design: only unencrypted fields from contract, rest from decryption
    const results = entries.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;

      // Base result: only fields from contract (agent, timestamp, hash)
      const result: Record<string, unknown> = {
        agent: e.agent,
        timestamp: Number(e.timestamp),
        payloadHash: e.payloadHash,
      };

      if (params.decrypt && e.encryptedPayload) {
        // Decrypt to access tool, action, status, errorType
        const encryptedStr = String(e.encryptedPayload) as EncryptedPayload;
        const decrypted = encryptionService.decrypt(encryptedStr);

        if (decrypted.ok) {
          // decrypted.value is AuditPayload object
          const payload = decrypted.value as unknown as Record<string, unknown>;
          result.payload = payload;

          // Extract operational fields from decrypted payload
          result.tool = payload.tool;
          result.action = payload.action;
          result.status = payload.status;
          result.errorType = payload.errorType;
        } else {
          logger.warn(
            { error: (decrypted.error as Error).message },
            'Failed to decrypt payload'
          );
          result.payload = null;
        }
      } else if (e.encryptedPayload) {
        // Include encrypted payload as hex (no operational details visible)
        if (typeof e.encryptedPayload === 'string') {
          result.encryptedPayload = e.encryptedPayload;
        } else {
          const payload = e.encryptedPayload as Buffer | Uint8Array;
          if (Buffer.isBuffer(payload)) {
            result.encryptedPayload = '0x' + payload.toString('hex');
          } else if (payload instanceof Uint8Array) {
            result.encryptedPayload = '0x' + Buffer.from(payload).toString('hex');
          } else {
            result.encryptedPayload = String(payload);
          }
        }
      }

      return result;
    });

    logger.info({ query: params, resultCount: results.length }, 'Audit search completed');

    return {
      ok: true,
      value: {
        query: params,
        count: results.length,
        entries: results as unknown as AuditSearchResult['entries'],
      },
    };
  } catch (error) {
    logger.error({ error: String(error) }, 'Unexpected error during audit search');
    return {
      ok: false,
      error: new ServiceError('Internal error during audit search', -32603, 500, 'service/internal_error'),
    };
  }
}

/**
 * Perform emergency revocation
 */
export async function performEmergencyRevoke(
  agentAddress: string,
  chainDriver: ChainDriver,
  _rbacContractAddress?: string, // Deprecated: contract address now read from process.env
  permissionCache?: { invalidate: (agent: string) => void }
): Promise<Result<string, ServiceError>> {
  try {
    logger.debug({
      receivedParams: {
        agentAddress,
        permissionCacheExists: !!permissionCache,
      },
    }, 'performEmergencyRevoke called with params');

    // Validate agent address format
    if (!agentAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      return {
        ok: false,
        error: new ServiceError('Invalid agent address format', -32600, 400, 'request/invalid'),
      };
    }

    logger.warn(
      {
        agent: agentAddress,
        abiLength: RBAC_ABI.length,
      },
      'Emergency revocation requested'
    );

    // Call contract
    logger.debug(
      {
        functionName: 'emergencyRevoke',
        argCount: 1,
        arg0: agentAddress,
      },
      'About to call writeContract for emergencyRevoke'
    );

    // Bypass chainDriver and call viem directly to debug
    // This helps isolate whether the issue is in HederaChainDriver or viem itself
    const { createWalletClient, http, getAddress } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');

    const debugSigner = process.env.HARDHAT_SIGNER_KEY || process.env.PROXY_SIGNER_KEY;
    if (!debugSigner) {
      return {
        ok: false,
        error: new ServiceError('No signer key found', -32603, 500, 'service/internal_error'),
      };
    }

    const debugAccount = privateKeyToAccount(debugSigner as `0x${string}`);
    const debugWalletClient = createWalletClient({
      account: debugAccount,
      transport: http('http://127.0.0.1:8545', { timeout: 60_000 }),
    });

    const REVOKE_ABI = [
      {
        inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
        name: 'emergencyRevoke',
        outputs: [],
        stateMutability: 'nonpayable' as const,
        type: 'function' as const,
      },
    ] as const;

    logger.debug(
      { agent: agentAddress, debugSigner: debugAccount.address },
      'Using direct viem call for emergencyRevoke'
    );

    // Note: rbacContractAddress parameter is undefined due to config schema issue
    // Config schema doesn't include contract addresses, so get from env directly
    const contractAddressFromEnv = process.env.RBAC_CONTRACT_ADDRESS;
    if (!contractAddressFromEnv) {
      return {
        ok: false,
        error: new ServiceError('RBAC contract address not configured', -32603, 500, 'service/internal_error'),
      };
    }

    let debugTxHash: string;
    try {
      // Normalize addresses to correct checksum format required by viem
      // viem requires EIP-55 checksummed addresses for validation
      logger.debug({
        beforeChecksum: { contractAddress: contractAddressFromEnv, agentAddress },
      }, 'Before address normalization');

      let checksumContractAddress: `0x${string}`;
      try {
        checksumContractAddress = getAddress(contractAddressFromEnv) as `0x${string}`;
      } catch (addrError) {
        logger.error({ address: contractAddressFromEnv, error: String(addrError) }, 'getAddress for contract failed');
        throw addrError;
      }

      let checksumAgentAddress: `0x${string}`;
      try {
        checksumAgentAddress = getAddress(agentAddress) as `0x${string}`;
      } catch (addrError) {
        logger.error({ address: agentAddress, error: String(addrError) }, 'getAddress for agent failed');
        throw addrError;
      }

      logger.debug({
        original: { contractAddress: contractAddressFromEnv, agentAddress },
        checksummed: { checksumContractAddress, checksumAgentAddress },
        signerAddress: debugAccount.address,
      }, 'Normalized addresses for viem call');

      debugTxHash = await (debugWalletClient as any).writeContract({
        address: checksumContractAddress,
        abi: REVOKE_ABI,
        functionName: 'emergencyRevoke',
        args: [checksumAgentAddress],
      });

      logger.info({ txHash: debugTxHash }, 'Direct viem call succeeded');

      const result = {
        ok: true as const,
        value: debugTxHash,
      };

      // Invalidate permission cache so next request re-reads from chain and sees revocation
      if (permissionCache) {
        permissionCache.invalidate(agentAddress as any);
        logger.debug({ agent: agentAddress }, 'Permission cache invalidated after revocation');
      }

      return result;
    } catch (viemError) {
      logger.error({ error: String(viemError), agent: agentAddress }, 'Direct viem call failed');

      // Fall back to chainDriver if direct call fails
      logger.debug('Falling back to chainDriver.writeContract');

      const fallbackResult = await chainDriver.writeContract(contractAddressFromEnv, RBAC_ABI, 'emergencyRevoke', [
        agentAddress,
      ]);

      if (!fallbackResult.ok) {
        logger.error({ agent: agentAddress, error: fallbackResult.error }, 'Fallback revocation failed');
        return {
          ok: false,
          error: new ServiceError('Revocation failed', -32022, 503, 'service/unavailable'),
        };
      }

      // Invalidate permission cache
      if (permissionCache) {
        permissionCache.invalidate(agentAddress as any);
        logger.debug({ agent: agentAddress }, 'Permission cache invalidated after fallback revocation');
      }

      return {
        ok: true as const,
        value: fallbackResult.value,
      };
    }
  } catch (error) {
    logger.error({ error: String(error) }, 'Unexpected error during revocation');
    return {
      ok: false,
      error: new ServiceError('Internal error during revocation', -32603, 500, 'service/internal_error'),
    };
  }
}
