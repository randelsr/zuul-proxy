import type { AgentAddress, ToolKey, PermissionAction, RoleId } from '../types.js';
import { ServiceError } from '../errors.js';
import type { Result } from '../types.js';
import type { ChainDriver } from '../chain/driver.js';
import { getLogger } from '../logging.js';

const logger = getLogger('rbac:contract');

/**
 * RBAC contract reader (read-only operations on RBAC.sol)
 *
 * Provides high-level methods to check permissions and fetch agent roles.
 * Implementation delegates to ChainDriver (Phase 7) for actual contract calls.
 * For now, these are stubs that will be completed in Phase 7.
 *
 * Note: These methods are rarely called directly; PermissionCache (cache.ts)
 * is the preferred interface as it caches results with TTL.
 */
export class RBACContractReader {
  private contractAddress: string;

  constructor(contractAddress: string) {
    this.contractAddress = contractAddress;
    // Reference for type checking; will be used in Phase 7 for actual contract calls
    void this.getContractAddress();
  }

  /**
   * Get the RBAC contract address (for Phase 7 implementation)
   * @private
   */
  private getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Check if agent has permission for (tool, action)
   *
   * Calls RBAC contract: hasPermission(agent, tool, action) → bool
   * Returns true if agent is active AND has permission; false otherwise.
   *
   * @param agent Agent wallet address
   * @param tool Tool key (e.g., 'github', 'slack')
   * @param action Permission action (read, create, update, delete)
   * @param driver ChainDriver for blockchain interaction
   * @returns Result with boolean permission status or ServiceError
   */
  async hasPermission(
    agent: AgentAddress,
    tool: ToolKey,
    action: PermissionAction,
    _driver: ChainDriver
  ): Promise<Result<boolean, ServiceError>> {
    logger.debug({ agent, tool, action }, 'Checking permission via contract');

    // TODO (Phase 7): Call RBAC contract via driver
    // try {
    //   const hasPermission = await _driver.callContract(
    //     this.contractAddress,
    //     RBAC_ABI,
    //     'hasPermission',
    //     [agent, tool, action]
    //   )
    //   return { ok: true, value: hasPermission as boolean }
    // } catch (error) {
    //   logger.error(...)
    //   return { ok: false, error: new ServiceError(...) }
    // }

    // For now: stub returning true
    const hasPermission = true;

    logger.debug({ agent, tool, action, hasPermission }, 'Permission check result');

    return { ok: true, value: hasPermission };
  }

  /**
   * Get agent's role and active status
   *
   * Calls RBAC contract: getAgentRole(agent) → (roleId, isActive)
   * Returns role ID and active flag.
   * If agent is inactive, future permission checks will return false.
   *
   * @param agent Agent wallet address
   * @param driver ChainDriver for blockchain interaction
   * @returns Result with { roleId, isActive } or ServiceError
   */
  async getAgentRole(
    agent: AgentAddress,
    _driver: ChainDriver
  ): Promise<Result<{ roleId: RoleId; isActive: boolean }, ServiceError>> {
    logger.debug({ agent }, 'Fetching agent role from contract');

    // TODO (Phase 7): Call RBAC contract via driver
    // try {
    //   const result = await _driver.callContract(
    //     this.contractAddress,
    //     RBAC_ABI,
    //     'getAgentRole',
    //     [agent]
    //   )
    //   return { ok: true, value: { roleId: result[0] as RoleId, isActive: result[1] as boolean } }
    // } catch (error) {
    //   logger.error(...)
    //   return { ok: false, error: new ServiceError(...) }
    // }

    // For now: stub returning default role
    const result = { roleId: ('0x' + '0'.repeat(64)) as RoleId, isActive: true };

    logger.debug({ agent, roleId: result.roleId, isActive: result.isActive }, 'Agent role fetched');

    return { ok: true, value: result };
  }
}
