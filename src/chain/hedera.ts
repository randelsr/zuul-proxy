import { createPublicClient, createWalletClient, http, type Abi, type PublicClient, type WalletClient, keccak256, encodeFunctionData, decodeFunctionResult, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
  // Use 31337 for local Hardhat, 295 for Hedera testnet
  private readonly chainId: ChainId = (process.env.HARDHAT_SIGNER_KEY ? 31337 : 295) as ChainId;
  private readonly rpcUrl: string;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | null;
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
      this.walletClient = null;
    } else {
      // Create viem clients for Hedera testnet
      // Using generic chain config since viem 2.4.0 doesn't have hederaTestnet built-in
      // Use chainId 31337 for local Hardhat, 295 for Hedera testnet
      const isLocalHardhat = !!process.env.HARDHAT_SIGNER_KEY;
      const chainConfig = {
        id: isLocalHardhat ? 31337 : 295,
        name: isLocalHardhat ? 'Hardhat Local' : 'Hedera Testnet',
        network: isLocalHardhat ? 'hardhat' : 'hedera-testnet',
        nativeCurrency: { name: isLocalHardhat ? 'ETH' : 'HBAR', symbol: isLocalHardhat ? 'ETH' : 'HBAR', decimals: 18 },
        rpcUrls: {
          default: { http: [this.rpcUrl] },
        },
      } as const;

      this.publicClient = createPublicClient({
        chain: chainConfig,
        transport: http(this.rpcUrl, { timeout: 30_000 }),
      });

      // Initialize wallet client for transaction submission (if signer key available)
      const signerKey = process.env.PROXY_SIGNER_KEY || process.env.HARDHAT_SIGNER_KEY;
      if (signerKey) {
        const account = privateKeyToAccount(signerKey as `0x${string}`);
        this.walletClient = createWalletClient({
          account,
          chain: chainConfig,
          transport: http(this.rpcUrl, { timeout: 60_000 }),
        });
        logger.debug({ signerAddress: account.address }, 'Wallet client initialized for transaction submission');
      } else {
        this.walletClient = null;
        logger.debug('No signer key found; transaction submission disabled');
      }
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

      // Encode the function call
      if (abi.length === 0) {
        return { ok: true, value: [] as unknown as T };
      }

      const data = encodeFunctionData({
        abi: abi,
        functionName: functionName,
        args: args as readonly unknown[],
      });

      // Make the static call (view function)
      const result = await this.publicClient.call({
        account: '0x0000000000000000000000000000000000000000',
        to: contractAddress as `0x${string}`,
        data: data,
      });

      // Decode the result
      if (!result.data) {
        return { ok: true, value: [] as unknown as T };
      }

      try {
        const decoded = decodeFunctionResult({
          abi: abi,
          functionName: functionName,
          data: result.data,
        });

        return { ok: true, value: decoded as unknown as T };
      } catch (decodeError) {
        logger.warn(
          { functionName, error: decodeError instanceof Error ? decodeError.message : String(decodeError) },
          'Failed to decode contract result, returning empty array'
        );
        return { ok: true, value: [] as unknown as T };
      }
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
   * Submits real transactions to blockchain via wallet client
   */
  async writeContract(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[]
  ): Promise<Result<TransactionHash, ServiceError>> {
    try {
      logger.debug(
        { contractAddress, functionName, chainId: this.chainId, walletClientAvailable: !!this.walletClient },
        'Writing to Hedera contract'
      );

      // Check if wallet client is available (requires signer key)
      if (!this.walletClient) {
        logger.error({}, 'Wallet client not initialized; cannot submit transaction');
        return {
          ok: false,
          error: new ServiceError(
            'Transaction submission disabled: no signer configured',
            -32603,
            500,
            'service/internal_error',
            { reason: 'PROXY_SIGNER_KEY or HARDHAT_SIGNER_KEY not set' }
          ),
        };
      }

      // Submit actual transaction using wallet client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txHash = await (this.walletClient as any).writeContract({
        address: contractAddress as `0x${string}`,
        abi: abi,
        functionName: functionName,
        args: args as readonly unknown[],
      });

      logger.info({ txHash, contractAddress, functionName }, 'Hedera transaction submitted');

      return { ok: true, value: txHash as unknown as TransactionHash };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          contractAddress,
          functionName,
          error: errorMsg,
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
          { reason: errorMsg }
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
