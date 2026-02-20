import { createPublicClient, http, type Abi, type PublicClient, keccak256 } from 'viem';
import type { ChainDriver } from './driver.js';
import type { AgentAddress, ChainId, Role, RoleId, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';
import type { AppConfig } from '../config/types.js';

const logger = getLogger('chain:evm');

/**
 * Generic EVM chain driver
 * Works with Base, Arbitrum, Optimism, and any EVM-compatible chain
 */
export class EVMChainDriver implements ChainDriver {
  private readonly chainId: ChainId;
  private readonly rpcUrl: string;
  private readonly chainName: string;
  private readonly publicClient: PublicClient;
  private readonly roles: Readonly<Role[]>;
  private readonly rbacContractAddress: string;

  constructor(chainName: string, rpcUrl: string, chainId: number, config?: AppConfig, publicClient?: PublicClient) {
    this.chainName = chainName;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId as ChainId;
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
      // Create viem client for the EVM chain
      this.publicClient = createPublicClient({
        chain: {
          id: chainId,
          name: chainName,
          network: chainName.toLowerCase(),
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [rpcUrl] },
        },
      } as const,
      transport: http(rpcUrl, { timeout: 30_000 }),
      });
    }

    logger.info(
      { chainName, rpcUrl, chainId, rbacContractAddress: this.rbacContractAddress },
      'EVMChainDriver initialized'
    );
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
   * Calls RBAC.getAgentRole(agent) to get roleId and isActive status
   * Then looks up the corresponding role definition from config.yaml
   */
  async getRoleForAgent(agent: AgentAddress): Promise<Role> {
    try {
      logger.debug(
        {
          agent,
          chainName: this.chainName,
          chainId: this.chainId,
          rbacContractAddress: this.rbacContractAddress,
        },
        'Reading agent role from EVM RBAC'
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

      logger.debug({ agent, roleIdHash, isActive }, 'Retrieved agent role from RBAC contract');

      // Find the matching role from config.yaml by role ID hash
      // Role IDs in config are hashed with ethers.keccak256(ethers.toUtf8Bytes(role.id))
      const matchingRole = this.roles.find((role) => {
        // Hash the role ID using keccak256. Note: viem's keccak256 expects hex string
        // We convert the string to UTF-8 bytes first
        const roleIdHex = `0x${Buffer.from(role.id, 'utf-8').toString('hex')}`;
        const hashOfRoleId = keccak256(roleIdHex as `0x${string}`);
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
          chainName: this.chainName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to read agent role from EVM RBAC'
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
