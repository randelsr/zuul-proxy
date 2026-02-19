import type { Abi } from 'viem';
import type { AgentAddress, ChainId, Role, TransactionHash } from '../types.js';
import type { ServiceError } from '../errors.js';
import type { Result } from '../types.js';

/**
 * Abstraction for blockchain interactions
 * Implementations: local (in-memory), hedera (Hedera testnet), evm (Base, Arbitrum, Optimism)
 *
 * All methods use viem's Abi type for type-safe contract interaction
 * Never use hand-written ABI types
 */
export interface ChainDriver {
  /**
   * Read-only contract call (view function)
   * Returns the decoded return value
   *
   * Timeout: 30 seconds
   * Retry: exponential backoff (3 attempts, 100ms base, full jitter)
   *
   * On failure: return ServiceError with code -32022 (SERVICE_UNAVAILABLE)
   * This ensures fail-closed: RBAC denies access if chain is down
   */
  callContract<T>(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[]
  ): Promise<Result<T, ServiceError>>;

  /**
   * State-mutating contract call (write function)
   * Returns the transaction hash
   *
   * Timeout: 60 seconds
   * Retry: exponential backoff (3 attempts, 100ms base, full jitter)
   *
   * On failure: return ServiceError with code -32021 (SERVICE_TIMEOUT) or -32022
   */
  writeContract(
    contractAddress: string,
    abi: Abi,
    functionName: string,
    args: readonly unknown[]
  ): Promise<Result<TransactionHash, ServiceError>>;

  /**
   * Get the chain ID this driver is configured for
   */
  getChainId(): ChainId;

  /**
   * Get the RPC URL (for informational purposes only)
   */
  getRpcUrl(): string;

  /**
   * Get agent's role from RBAC contract
   * Calls RBAC.getAgentRole(agent) → Role
   * Returns domain Role with roleId, name, permissions array, and isActive status
   *
   * Used by PermissionCache to populate cache on miss
   * Timeout: 30 seconds
   * Retry: exponential backoff (3 attempts, 100ms base, full jitter)
   *
   * On failure: throw Error (will be caught by cache's retry logic)
   */
  getRoleForAgent(agent: AgentAddress): Promise<Role>;
}
