// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RBAC
 * @dev Role-Based Access Control contract for Zuul Proxy
 * Maps agents to roles for permission management
 */
contract RBAC {
    /**
     * @dev Stores role information
     * roleId: keccak256 hash of role name
     * isActive: whether the role is active
     */
    mapping(address agent => bytes32 roleId) public agentRoles;
    mapping(bytes32 roleId => bool isActive) public activeRoles;

    /**
     * @dev Owner for emergency revocation access control
     */
    address public owner;

    /**
     * @dev Per-agent revocation mapping for emergency revoke
     */
    mapping(address agent => bool isRevoked) public revokedAgents;

    /**
     * @dev Emitted when an agent's role is set
     */
    event RoleSet(address indexed agent, bytes32 indexed roleId);

    /**
     * @dev Emitted when a role is activated/deactivated
     */
    event RoleStatusChanged(bytes32 indexed roleId, bool isActive);

    /**
     * @dev Emitted when an agent is emergency revoked
     */
    event AgentRevoked(address indexed agent, uint256 timestamp);

    /**
     * @dev Modifier: restrict to owner only
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    /**
     * @dev Constructor: set deployer as owner
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Set the role for an agent
     * @param agent The agent address
     * @param roleId The keccak256 hash of the role name
     */
    function setAgentRole(address agent, bytes32 roleId) public {
        agentRoles[agent] = roleId;
        emit RoleSet(agent, roleId);
    }

    /**
     * @dev Get the role for an agent
     * @param agent The agent address
     * @return A tuple of (roleId, isActive)
     * @notice Returns isActive=false if agent is revoked, regardless of role status
     */
    function getAgentRole(address agent) public view returns (bytes32, bool) {
        // If agent is revoked, return inactive regardless of role status
        if (revokedAgents[agent]) {
            return (agentRoles[agent], false);
        }

        bytes32 roleId = agentRoles[agent];
        bool isActive = activeRoles[roleId];
        return (roleId, isActive);
    }

    /**
     * @dev Set the active status of a role
     * @param roleId The keccak256 hash of the role name
     * @param isActive Whether the role is active
     */
    function setRoleStatus(bytes32 roleId, bool isActive) public {
        activeRoles[roleId] = isActive;
        emit RoleStatusChanged(roleId, isActive);
    }

    /**
     * @dev Check if a role is active
     * @param roleId The keccak256 hash of the role name
     * @return Whether the role is active
     */
    function isRoleActive(bytes32 roleId) public view returns (bool) {
        return activeRoles[roleId];
    }

    /**
     * @dev Emergency revoke an agent (owner only)
     * @param agent The agent address to revoke
     */
    function emergencyRevoke(address agent) public onlyOwner {
        revokedAgents[agent] = true;
        emit AgentRevoked(agent, block.timestamp);
    }
}
