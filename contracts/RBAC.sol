// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RBAC
 * @dev Role-Based Access Control contract for Zuul Proxy
 * Simple mapping-based design: if agent IS in agentRoles mapping → ACTIVE
 * If agent is NOT in mapping (or deleted) → INACTIVE/REVOKED
 * Transaction history serves as immutable audit trail of state changes
 */
contract RBAC {
    /**
     * @dev Canonical state: agent address → role ID (keccak256 hash of role name)
     * Presence in mapping = agent is ACTIVE with that role
     * Absence from mapping = agent is INACTIVE/REVOKED
     */
    mapping(address agent => bytes32 roleId) public agentRoles;

    /**
     * @dev Proxy address - only authorized actor for state mutations
     */
    address public proxy;

    /**
     * @dev Emitted when an agent's role is set/updated
     */
    event RoleSet(address indexed agent, bytes32 indexed roleId, uint256 timestamp);

    /**
     * @dev Emitted when an agent is revoked (removed from mapping)
     */
    event AgentRevoked(address indexed agent, uint256 timestamp);

    /**
     * @dev Modifier: restrict state mutations to proxy only
     */
    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can mutate RBAC state");
        _;
    }

    /**
     * @dev Constructor: set deployer as proxy (typically the Zuul proxy account)
     */
    constructor() {
        proxy = msg.sender;
    }

    /**
     * @dev Set the role for an agent (proxy only)
     * This transaction becomes part of the immutable state change history
     * @param agent The agent address
     * @param roleId The keccak256 hash of the role name
     */
    function setAgentRole(address agent, bytes32 roleId) public onlyProxy {
        require(roleId != bytes32(0), "Role ID cannot be zero");
        agentRoles[agent] = roleId;
        emit RoleSet(agent, roleId, block.timestamp);
    }

    /**
     * @dev Get the role for an agent (query current state)
     * @param agent The agent address
     * @return roleId The agent's current role, or bytes32(0) if inactive
     * @return isActive True if agent is in mapping (active), false if omitted (revoked)
     */
    function getAgentRole(address agent) public view returns (bytes32, bool) {
        bytes32 roleId = agentRoles[agent];
        bool isActive = roleId != bytes32(0);  // Non-zero = in mapping = active
        return (roleId, isActive);
    }

    /**
     * @dev Revoke an agent by removing from mapping (proxy only)
     * The absence of an entry IS the state change (revocation)
     * Transaction history shows when this revocation occurred
     * @param agent The agent address to revoke
     */
    function emergencyRevoke(address agent) public onlyProxy {
        require(agentRoles[agent] != bytes32(0), "Agent not active");
        delete agentRoles[agent];
        emit AgentRevoked(agent, block.timestamp);
    }
}
