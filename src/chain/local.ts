import type { ChainDriver } from './driver.js';
import type { Abi } from 'viem';
import type { AgentAddress, ChainId, Role, RoleId, TransactionHash } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('chain:local');

/**
 * In-memory mock chain driver for testing and local development
 *
 * Simulates blockchain behavior without actual on-chain calls.
 * Can be configured to fail for testing fail-closed behavior.
 * No real state is persisted; each instance starts fresh.
 */
export class LocalChainDriver implements ChainDriver {
  private contractState: Map<string, unknown> = new Map();
  private roleState: Map<AgentAddress, Role> = new Map();
  private shouldFail: boolean = false;
  private readonly chainId: ChainId = 31337 as ChainId;

  constructor() {
    logger.debug({}, 'LocalChainDriver initialized (mock, no real blockchain calls)');
  }

  /**
   * Call a view function (read-only contract call)
   * Simulates by returning mock data from internal state
   */
  async callContract<T>(
    contractAddress: string,
    _abi: Abi,
    functionName: string,
    _args: readonly unknown[]
  ): Promise<Result<T, ServiceError>> {
    if (this.shouldFail) {
      logger.warn(
        { contractAddress, functionName },
        'Mock contract call intentionally failed (test mode)'
      );
      return {
        ok: false,
        error: new ServiceError(
          'Mock blockchain unavailable (test mode)',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable',
          { reason: 'Local mock driver configured to fail' }
        ),
      };
    }

    logger.debug(
      { contractAddress, functionName },
      'Mock contract call (read-only, no real blockchain)'
    );

    // Simulate contract call by looking up stored state
    const key = `${contractAddress}:${functionName}`;
    const result = this.contractState.get(key);

    return { ok: true, value: (result || {}) as T };
  }

  /**
   * Call a state-mutating function
   * Simulates by generating mock transaction hash
   */
  async writeContract(
    contractAddress: string,
    _abi: Abi,
    functionName: string,
    _args: readonly unknown[]
  ): Promise<Result<TransactionHash, ServiceError>> {
    if (this.shouldFail) {
      logger.warn(
        { contractAddress, functionName },
        'Mock contract write intentionally failed (test mode)'
      );
      return {
        ok: false,
        error: new ServiceError(
          'Mock blockchain unavailable (test mode)',
          -32022, // SERVICE_UNAVAILABLE
          503,
          'service/unavailable',
          { reason: 'Local mock driver configured to fail' }
        ),
      };
    }

    logger.debug(
      { contractAddress, functionName },
      'Mock contract write (state mutation, generates fake tx hash)'
    );

    // Simulate tx submission by generating random hash
    const txHash =
      `0x${Math.random().toString(16).slice(2).padStart(64, '0')}` as unknown as TransactionHash;

    return { ok: true, value: txHash };
  }

  /**
   * Get agent's role from mock RBAC contract state
   * Returns pre-configured role data or default
   */
  async getRoleForAgent(agent: AgentAddress): Promise<Role> {
    if (this.shouldFail) {
      logger.warn({ agent }, 'Mock getRoleForAgent intentionally failed');
      throw new Error('Mock blockchain unavailable (test mode)');
    }

    logger.debug({ agent }, 'Mock getRoleForAgent (returns pre-configured state)');

    // Return stored role or default
    const role = this.roleState.get(agent);
    if (role) {
      return role;
    }

    // Default role for unknown agent
    return {
      id: ('0x' + '0'.repeat(64)) as RoleId,
      name: 'Default',
      permissions: [],
      isActive: false,
    };
  }

  getChainId(): ChainId {
    return this.chainId;
  }

  getRpcUrl(): string {
    return 'http://localhost:8545';
  }

  /**
   * Testing helper: configure driver to fail all calls
   * Useful for testing fail-closed behavior
   */
  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
    logger.info({ shouldFail }, 'Mock driver failure mode toggled');
  }

  /**
   * Testing helper: pre-configure a role for an agent
   * Allows unit tests to set up specific role data
   */
  setRoleForAgent(agent: AgentAddress, role: Role): void {
    this.roleState.set(agent, role);
    logger.debug({ agent, roleId: role.id }, 'Mock role configured for agent');
  }

  /**
   * Testing helper: clear all stored state
   */
  reset(): void {
    this.contractState.clear();
    this.roleState.clear();
    this.shouldFail = false;
    logger.debug({}, 'Mock driver state reset');
  }
}
