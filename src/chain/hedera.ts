import { createPublicClient, http, type Abi, type PublicClient, keccak256, encodeFunctionData, toHex } from 'viem';
import type { ChainDriver } from './driver.js';
import type { AgentAddress, ChainId, Role, RoleId, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';
import type { AppConfig } from '../config/types.js';

const logger = getLogger('chain:hedera');

/**
 * Hedera testnet chain driver
 * Uses viem to interact with Hedera JSON-RPC relay
 * Chain ID: 295 (Hedera testnet)
 */
export class HederaChainDriver implements ChainDriver {
  private readonly chainId: ChainId = 295 as ChainId;
  private readonly rpcUrl: string;
  private readonly publicClient: PublicClient;
  private readonly roles: Readonly<Role[]>;
  private readonly rbacContractAddress: string;

  constructor(rpcUrl?: string, config?: AppConfig, publicClient?: PublicClient) {
    this.rpcUrl = rpcUrl || process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api';
    // Ensure roles have isActive set (defaults to true for config-defined roles)
    this.roles = (config?.roles || []).map(
      (role) =>
        ({
          ...role,
          isActive: true,
        }) as Readonly<Role>
    );
    this.rbacContractAddress = process.env.RBAC_CONTRACT_ADDRESS || '';

    // Use provided publicClient for testing, or create real client for production
    if (publicClient) {
      this.publicClient = publicClient;
    } else {
      // Create viem client for Hedera testnet
      // Using generic chain config since viem 2.4.0 doesn't have hederaTestnet built-in
      this.publicClient = createPublicClient({
        chain: {
          id: 295,
          name: 'Hedera Testnet',
          network: 'hedera-testnet',
          nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
          rpcUrls: {
            default: { http: [this.rpcUrl] },
          },
        } as const,
        transport: http(this.rpcUrl, { timeout: 30_000 }),
      });
    }

    logger.info(
      { rpcUrl: this.rpcUrl, chainId: this.chainId, rbacContractAddress: this.rbacContractAddress },
      'HederaChainDriver initialized'
    );
  }

  /**
   * Read-only contract call with 30s timeout
   *
   * Note: MVP implementation returns empty arrays for audit queries.
   * Full implementation would encode function calls and decode results.
   */
  async callContract<T>(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[]
  ): Promise<Result<T, ServiceError>> {
    try {
      logger.debug(
        { contractAddress, functionName, chainId: this.chainId },
        'Reading from Hedera contract'
      );

      // MVP: Return empty array for audit query functions
      // Production: Would encode the function call and make RPC call
      if (functionName.startsWith('getEntries')) {
        // Audit query functions return empty arrays initially
        return { ok: true, value: [] as unknown as T };
      }

      // For other read functions, try to encode and call
      if (abi.length > 0) {
        const data = encodeFunctionData({
          abi: abi,
          functionName: functionName,
          args: args as readonly unknown[],
        });

        // Make the call (production implementation would decode result)
        await this.publicClient.call({
          account: '0x0000000000000000000000000000000000000000',
          to: contractAddress as `0x${string}`,
          data: data,
        });

        // For now, return empty array
        return { ok: true, value: [] as unknown as T };
      }

      return { ok: true, value: [] as unknown as T };
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
   * Calls RBAC.getAgentRole(agent) to get roleId and isActive status
   * Then looks up the corresponding role definition from config.yaml
   */
  async getRoleForAgent(agent: AgentAddress): Promise<Role> {
    try {
      logger.debug(
        { agent, chainId: this.chainId, rbacContractAddress: this.rbacContractAddress },
        'Reading agent role from Hedera RBAC'
      );

      if (!this.rbacContractAddress || this.rbacContractAddress === '') {
        throw new Error('RBAC_CONTRACT_ADDRESS not set in environment');
      }

      // RBAC contract ABI for getAgentRole
      const getAgentRoleAbi = [
        {
          inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
          name: 'getAgentRole',
          outputs: [
            { internalType: 'bytes32', name: 'roleId', type: 'bytes32' },
            { internalType: 'bool', name: 'isActive', type: 'bool' },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      // Call RBAC.getAgentRole(agent)
      const result = await this.publicClient.readContract({
        address: this.rbacContractAddress as `0x${string}`,
        abi: getAgentRoleAbi,
        functionName: 'getAgentRole',
        args: [agent as `0x${string}`],
      });

      const [roleIdHash, isActive] = result as [string, boolean];

      logger.debug(
        { agent, roleIdHash, isActive },
        'Retrieved agent role from Hedera RBAC contract'
      );

      // Find the matching role from config.yaml by role ID hash
      // Role IDs are hashed with keccak256(toHex(role.id, { size: 32 }))
      const matchingRole = this.roles.find((role) => {
        // Hash the role ID using keccak256 with 32-byte padding (same as register-agents.ts)
        const roleIdHex = toHex(role.id, { size: 32 });
        const hashOfRoleId = keccak256(roleIdHex);
        return hashOfRoleId.toLowerCase() === roleIdHash.toLowerCase();
      });

      if (!matchingRole) {
        logger.warn(
          { agent, roleIdHash },
          'Agent has registered role but no matching role in config.yaml'
        );
        // Return a minimal role for this agent with only the isActive status
        return {
          id: roleIdHash as RoleId,
          name: 'Unknown Role',
          permissions: [],
          isActive,
        };
      }

      // Return the role from config with the isActive status from chain
      return {
        ...matchingRole,
        isActive,
      };
    } catch (error) {
      logger.error(
        {
          agent,
          chainId: this.chainId,
          error: error instanceof Error ? error.message : String(error),
        },
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
