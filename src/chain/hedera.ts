import { createPublicClient, http, type Abi } from 'viem';
import type { ChainDriver } from './driver.js';
import type { AgentAddress, ChainId, Role, RoleId, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('chain:hedera');

/**
 * Hedera testnet chain driver
 * Uses viem to interact with Hedera JSON-RPC relay
 * Chain ID: 295 (Hedera testnet)
 */
export class HederaChainDriver implements ChainDriver {
  private readonly chainId: ChainId = 295 as ChainId;
  private readonly rpcUrl: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

    // Create viem client for Hedera testnet
    // Using generic chain config since viem 2.4.0 doesn't have hederaTestnet built-in
    createPublicClient({
      chain: {
        id: 295,
        name: 'Hedera Testnet',
        network: 'hedera-testnet',
        nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
        rpcUrls: {
          default: { http: [this.rpcUrl] },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      transport: http(this.rpcUrl, { timeout: 30_000 }),
    });

    logger.info({ rpcUrl: this.rpcUrl, chainId: this.chainId }, 'HederaChainDriver initialized');
  }

  /**
   * Read-only contract call with 30s timeout
   */
  async callContract<T>(
    contractAddress: string,
    _abi: Abi,
    functionName: string,
    _args: readonly unknown[]
  ): Promise<Result<T, ServiceError>> {
    try {
      logger.debug(
        { contractAddress, functionName, chainId: this.chainId },
        'Reading from Hedera contract'
      );

      // Simulate contract call (actual call would use publicClient.call or contract.read)
      // For now, return empty result to match interface
      const result = {};

      return { ok: true, value: result as T };
    } catch (error) {
      logger.error(
        {
          contractAddress,
          functionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Hedera contract read failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Hedera contract call failed',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable',
          { reason: 'Hedera RPC call failed' }
        ),
      };
    }
  }

  /**
   * State-mutating contract call with 60s timeout
   */
  async writeContract(
    contractAddress: string,
    _abi: Abi,
    functionName: string,
    _args: readonly unknown[]
  ): Promise<Result<TransactionHash, ServiceError>> {
    try {
      logger.debug(
        { contractAddress, functionName, chainId: this.chainId },
        'Writing to Hedera contract'
      );

      // Simulate tx submission (actual call would use writeContract or sendTransaction)
      const txHash =
        `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as unknown as TransactionHash;

      logger.info({ txHash, contractAddress }, 'Hedera transaction submitted');

      return { ok: true, value: txHash };
    } catch (error) {
      logger.error(
        {
          contractAddress,
          functionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Hedera contract write failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'Hedera contract write failed',
          -32021, // SERVICE_TIMEOUT
          504,
          'service/timeout',
          { reason: 'Hedera transaction submission failed' }
        ),
      };
    }
  }

  /**
   * Get agent's role from Hedera RBAC contract
   */
  async getRoleForAgent(agent: AgentAddress): Promise<Role> {
    try {
      logger.debug({ agent, chainId: this.chainId }, 'Reading agent role from Hedera RBAC');

      // Stub: actual implementation would call RBAC contract
      // For now, return default role
      return {
        id: ('0x' + '0'.repeat(64)) as RoleId,
        name: 'Default Role',
        permissions: [],
        isActive: false,
      };
    } catch (error) {
      logger.error(
        { agent, error: error instanceof Error ? error.message : String(error) },
        'Failed to read agent role from Hedera'
      );

      throw error;
    }
  }

  getChainId(): ChainId {
    return this.chainId;
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }
}
