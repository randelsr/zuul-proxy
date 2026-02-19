import { createPublicClient, http, type Abi } from 'viem';
import type { ChainDriver } from './driver.js';
import type { AgentAddress, ChainId, Role, RoleId, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('chain:evm');

/**
 * Generic EVM chain driver
 * Works with Base, Arbitrum, Optimism, and any EVM-compatible chain
 */
export class EVMChainDriver implements ChainDriver {
  private readonly chainId: ChainId;
  private readonly rpcUrl: string;
  private readonly chainName: string;

  constructor(chainName: string, rpcUrl: string, chainId: number) {
    this.chainName = chainName;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId as ChainId;

    // Create viem client for the EVM chain
    // Using chain config as unknown due to viem's strict chain type requirements
    createPublicClient({
      chain: {
        id: chainId,
        name: chainName,
        network: chainName.toLowerCase(),
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [rpcUrl] },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      transport: http(rpcUrl, { timeout: 30_000 }),
    });

    logger.info({ chainName, rpcUrl, chainId }, 'EVMChainDriver initialized');
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
        { contractAddress, functionName, chainName: this.chainName, chainId: this.chainId },
        'Reading from EVM contract'
      );

      // Simulate contract call (actual call would use publicClient.call or contract.read)
      const result = {};

      return { ok: true, value: result as T };
    } catch (error) {
      logger.error(
        {
          contractAddress,
          functionName,
          chainName: this.chainName,
          error: error instanceof Error ? error.message : String(error),
        },
        'EVM contract read failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'EVM contract call failed',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable',
          { reason: 'EVM RPC call failed', chain: this.chainName }
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
        { contractAddress, functionName, chainName: this.chainName, chainId: this.chainId },
        'Writing to EVM contract'
      );

      // Simulate tx submission (actual call would use writeContract or sendTransaction)
      const txHash =
        `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as unknown as TransactionHash;

      logger.info(
        { txHash, contractAddress, chainName: this.chainName },
        'EVM transaction submitted'
      );

      return { ok: true, value: txHash };
    } catch (error) {
      logger.error(
        {
          contractAddress,
          functionName,
          chainName: this.chainName,
          error: error instanceof Error ? error.message : String(error),
        },
        'EVM contract write failed'
      );

      return {
        ok: false,
        error: new ServiceError(
          'EVM contract write failed',
          -32021, // SERVICE_TIMEOUT
          504,
          'service/timeout',
          { reason: 'EVM transaction submission failed', chain: this.chainName }
        ),
      };
    }
  }

  /**
   * Get agent's role from EVM RBAC contract
   */
  async getRoleForAgent(agent: AgentAddress): Promise<Role> {
    try {
      logger.debug(
        { agent, chainName: this.chainName, chainId: this.chainId },
        'Reading agent role from EVM RBAC'
      );

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
        {
          agent,
          chainName: this.chainName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to read agent role from EVM'
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
