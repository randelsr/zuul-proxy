// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RBAC
 * @dev Role-Based Access Control contract for Zuul Proxy
 *
 * Simple mapping-based design:
 * - Presence in agentRoles mapping = agent is ACTIVE with that role
 * - Absence from mapping (value = 0x0) = agent is INACTIVE (revoked or never set)
 * - Only proxy can mutate state via onlyProxy modifier
 */
contract RBAC {
    /**
     * @dev Agent to role mapping
     * Presence = active, absence (0x0) = revoked
     */
    mapping(address agent => bytes32 roleId) public agentRoles;

    /**
     * @dev Proxy address for authorization (set at deployment)
     */
    address public proxy;

    /**
     * @dev Emitted when an agent's role is set
     */
    event RoleSet(address indexed agent, bytes32 indexed roleId);

    /**
     * @dev Emitted when an agent is emergency revoked
     */
    event AgentRevoked(address indexed agent, uint256 timestamp);

    /**
     * @dev Modifier: restrict to proxy only
     */
    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can call this");
        _;
    }

    /**
     * @dev Constructor: set deployer as proxy
     */
    constructor() {
        proxy = msg.sender;
    }

    /**
     * @dev Set the role for an agent (proxy only)
     * @param agent The agent address
     * @param roleId The keccak256 hash of the role name
     */
    function setAgentRole(address agent, bytes32 roleId) public onlyProxy {
        agentRoles[agent] = roleId;
        emit RoleSet(agent, roleId);
    }

    /**
     * @dev Get the role for an agent with active status
     * @param agent The agent address
     * @return roleId The keccak256 hash of the role (0x0 if absent/revoked)
     * @return isActive True if agent is in mapping (active), false if absent (revoked)
     */
    function getAgentRole(address agent) public view returns (bytes32 roleId, bool isActive) {
        roleId = agentRoles[agent];
        // Presence in mapping (non-zero roleId) = active
        // Absence (roleId = 0x0) = inactive/revoked
        isActive = roleId != bytes32(0);
        return (roleId, isActive);
    }

    /**
     * @dev Emergency revoke an agent by removing from mapping (proxy only)
     * @param agent The agent address to revoke
     * @notice Uses delete to remove from mapping; subsequent getAgentRole will return (0x0, false)
     */
    function emergencyRevoke(address agent) public onlyProxy {
        delete agentRoles[agent];
        emit AgentRevoked(agent, block.timestamp);
    }
}
