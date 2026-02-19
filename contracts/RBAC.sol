// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RBAC
 * @notice On-chain permission management for Zuul proxy
 *
 * Agent Registration: admin calls registerAgent(agent_address, role_id)
 * Permission Grant: admin calls grantPermission(role_id, tool, action)
 * Permission Lookup: proxy calls hasPermission(agent, tool, action) -> bool
 * Emergency Revoke: admin calls emergencyRevoke(agent_address)
 *
 * All state is on-chain; immutable record maintained by EVM consensus
 */

contract RBAC is Ownable {
    constructor() Ownable(msg.sender) {}

    // ========================================================================
    // STATE
    // ========================================================================

    /// Agent address -> role ID
    mapping(address => bytes32) public agentRoles;

    /// Agent address -> active status
    mapping(address => bool) public agentActive;

    /// (role ID, tool, action) -> permission exists
    mapping(bytes32 => mapping(string => mapping(string => bool))) public permissions;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event AgentRegistered(address indexed agent, bytes32 indexed roleId);
    event AgentRevoked(address indexed agent);
    event PermissionGranted(bytes32 indexed roleId, string indexed tool, string action);
    event PermissionRevoked(bytes32 indexed roleId, string indexed tool, string action);

    // ========================================================================
    // ADMIN INTERFACE
    // ========================================================================

    /**
     * Register an agent with a role
     * Only owner can call
     * @param agent Agent wallet address
     * @param roleId Role identifier (e.g., keccak256("developer"))
     */
    function registerAgent(address agent, bytes32 roleId) external onlyOwner {
        require(agent != address(0), "Invalid agent address");
        agentRoles[agent] = roleId;
        agentActive[agent] = true;
        emit AgentRegistered(agent, roleId);
    }

    /**
     * Emergency revoke: immediately deny all access to an agent
     * Only owner can call
     * @param agent Agent wallet address
     */
    function emergencyRevoke(address agent) external onlyOwner {
        require(agent != address(0), "Invalid agent address");
        agentActive[agent] = false;
        emit AgentRevoked(agent);
    }

    /**
     * Grant a permission to a role
     * @param roleId Role identifier
     * @param tool Tool name (e.g., "github")
     * @param action Action (e.g., "read", "create", "update", "delete")
     */
    function grantPermission(
        bytes32 roleId,
        string calldata tool,
        string calldata action
    ) external onlyOwner {
        require(bytes(tool).length > 0, "Invalid tool");
        require(bytes(action).length > 0, "Invalid action");
        permissions[roleId][tool][action] = true;
        emit PermissionGranted(roleId, tool, action);
    }

    /**
     * Revoke a permission from a role
     * @param roleId Role identifier
     * @param tool Tool name
     * @param action Action
     */
    function revokePermission(
        bytes32 roleId,
        string calldata tool,
        string calldata action
    ) external onlyOwner {
        require(bytes(tool).length > 0, "Invalid tool");
        require(bytes(action).length > 0, "Invalid action");
        permissions[roleId][tool][action] = false;
        emit PermissionRevoked(roleId, tool, action);
    }

    // ========================================================================
    // QUERY INTERFACE
    // ========================================================================

    /**
     * Check if agent has permission for (tool, action)
     * Used by proxy on every request
     * View function: gas-free query
     *
     * @param agent Agent wallet address
     * @param tool Tool name
     * @param action Action
     * @return True if agent is active AND has permission; false otherwise
     */
    function hasPermission(
        address agent,
        string calldata tool,
        string calldata action
    ) external view returns (bool) {
        // Agent must be active
        if (!agentActive[agent]) return false;

        // Agent's role must have permission
        bytes32 roleId = agentRoles[agent];
        return permissions[roleId][tool][action];
    }

    /**
     * Get agent's role and active status
     * @param agent Agent wallet address
     * @return roleId The role ID assigned to the agent
     * @return isActive Whether the agent is currently active
     */
    function getAgentRole(address agent) external view returns (bytes32 roleId, bool isActive) {
        return (agentRoles[agent], agentActive[agent]);
    }
}
