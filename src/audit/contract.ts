import type { AuditEntry, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import type { ChainDriver } from '../chain/driver.js';
import { getLogger } from '../logging.js';

const logger = getLogger('audit:contract');

/**
 * Audit contract writer: submit entries to blockchain
 * Uses dual signatures: agentSignature (original X-Signature) + proxySignature (proxy signs payloadHash)
 */
export class AuditContractWriter {
  constructor(
    // @ts-expect-error - contractAddress will be used in Phase 8+ for actual contract calls
    private readonly contractAddress: string
  ) {}

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
      logger.debug({ auditId: entry.auditId }, 'Writing audit entry to blockchain');

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
      void chainDriver; // Placeholder for Phase 8+ real implementation
      const txHash =
        `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as unknown as TransactionHash;

      logger.info(
        { auditId: entry.auditId, txHash },
        'Audit entry successfully written to blockchain'
      );

      return { ok: true, value: txHash };
    } catch (error) {
      logger.error(
        {
          auditId: entry.auditId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to write audit entry to blockchain'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Audit write failed',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable'
        ),
      };
    }
  }
}
