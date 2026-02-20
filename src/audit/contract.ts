import { Buffer } from 'node:buffer';
import type { AuditEntry, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import type { ChainDriver } from '../chain/driver.js';
import { getLogger } from '../logging.js';
import { AUDIT_ABI } from '../contracts/abis.js';

const logger = getLogger('audit:contract');

/**
 * Audit contract writer: submit entries to blockchain
 * Uses dual signatures: agentSignature (original X-Signature) + proxySignature (proxy signs payloadHash)
 */
export class AuditContractWriter {
  private readonly AUDIT_ABI_WRITE = [AUDIT_ABI[0]]; // Only recordEntry for writes

  constructor(private readonly contractAddress: string) {}

  /**
   * Write audit entry to blockchain via Audit.recordEntry()
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
        { auditId: entry.auditId, agent: entry.agent },
        'Writing audit entry to blockchain'
      );

      // Call Audit.sol: recordEntry(
      //   address agent,
      //   bytes memory encryptedPayload,
      //   bytes32 payloadHash
      // )
      // Privacy-first design: only agent, encrypted payload, and hash are written
      // All operational details (tool, action, status, error) are encrypted in payload
      // Convert base64-encoded encrypted payload to hex bytes for viem
      const encryptedHex = `0x${Buffer.from(entry.encryptedPayload, 'base64').toString('hex')}` as `0x${string}`;

      const result = await chainDriver.writeContract(
        this.contractAddress,
        this.AUDIT_ABI_WRITE,
        'recordEntry',
        [
          entry.agent, // address
          encryptedHex, // bytes (converted from base64 to hex)
          entry.payloadHash, // bytes32
        ]
      );

      if (!result.ok) {
        logger.error(
          {
            auditId: entry.auditId,
            error: result.error.message,
          },
          'Blockchain write failed'
        );
        return result;
      }

      logger.info(
        { auditId: entry.auditId, txHash: result.value, agent: entry.agent },
        'Audit entry successfully written to blockchain'
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          auditId: entry.auditId,
          error: errorMsg,
        },
        'Failed to write audit entry to blockchain'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Audit write failed',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable',
          { reason: errorMsg }
        ),
      };
    }
  }
}
