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
    encryptedPayload?: string; // If decrypt=false
    payload?: Record<string, unknown>; // If decrypt=true
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
    const results = entries.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const result: Record<string, unknown> = {
        agent: e.agent,
        timestamp: Number(e.timestamp),
        isSuccess: e.isSuccess,
        tool: e.tool,
        errorType: e.errorType || undefined,
        payloadHash: e.payloadHash,
      };

      if (params.decrypt && e.encryptedPayload) {
        // Decrypt payload
        const encryptedStr = String(e.encryptedPayload) as EncryptedPayload;
        const decrypted = encryptionService.decrypt(encryptedStr);
        if (decrypted.ok) {
          // decrypted.value is AuditPayload object
          result.payload = decrypted.value as unknown as Record<string, unknown>;
        } else {
          logger.warn(
            { error: (decrypted.error as Error).message },
            'Failed to decrypt payload'
          );
          result.payload = null;
        }
      } else if (e.encryptedPayload) {
        // Include encrypted payload as hex
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
  rbacContractAddress: string,
  permissionCache?: { invalidate: (agent: string) => void }
): Promise<Result<string, ServiceError>> {
  try {
    // Validate agent address format
    if (!agentAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      return {
        ok: false,
        error: new ServiceError('Invalid agent address format', -32600, 400, 'request/invalid'),
      };
    }

    logger.warn({ agent: agentAddress }, 'Emergency revocation requested');

    // Call contract
    const result = await chainDriver.writeContract(rbacContractAddress, RBAC_ABI, 'emergencyRevoke', [
      agentAddress,
    ]);

    if (!result.ok) {
      logger.error({ agent: agentAddress, error: result.error }, 'Revocation failed');
      return {
        ok: false,
        error: new ServiceError('Revocation failed', -32022, 503, 'service/unavailable'),
      };
    }

    logger.info({ agent: agentAddress, txHash: result.value }, 'Agent revoked successfully');

    // Invalidate permission cache so next request re-reads from chain and sees revocation
    if (permissionCache) {
      permissionCache.invalidate(agentAddress as any);
      logger.debug({ agent: agentAddress }, 'Permission cache invalidated after revocation');
    }

    return {
      ok: true,
      value: result.value,
    };
  } catch (error) {
    logger.error({ error: String(error) }, 'Unexpected error during revocation');
    return {
      ok: false,
      error: new ServiceError('Internal error during revocation', -32603, 500, 'service/internal_error'),
    };
  }
}
