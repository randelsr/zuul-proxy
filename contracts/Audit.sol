// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Audit
 * @dev Immutable audit log contract for Zuul Proxy
 * Records all access requests
 */
contract Audit {
    address public rbacContract;

    /**
     * @dev Stores audit entry information
     */
    struct AuditEntry {
        address agent;
        bytes32 entryHash;
        uint256 timestamp;
        bool isSuccess;
    }

    AuditEntry[] public entries;

    /**
     * @dev Emitted when an audit entry is recorded
     */
    event AuditLogged(address indexed agent, bytes32 indexed entryHash, uint256 timestamp, bool isSuccess);

    /**
     * @dev Initialize with RBAC contract address
     * @param _rbacContract Address of the RBAC contract
     */
    constructor(address _rbacContract) {
        rbacContract = _rbacContract;
    }

    /**
     * @dev Record an audit entry
     * @param agent The agent address
     * @param entryHash The keccak256 hash of the audit entry
     * @param isSuccess Whether the request succeeded
     */
    function recordEntry(address agent, bytes32 entryHash, bool isSuccess) public {
        AuditEntry memory entry = AuditEntry({
            agent: agent,
            entryHash: entryHash,
            timestamp: block.timestamp,
            isSuccess: isSuccess
        });
        entries.push(entry);
        emit AuditLogged(agent, entryHash, block.timestamp, isSuccess);
    }

    /**
     * @dev Get total number of audit entries
     * @return The count of audit entries
     */
    function getEntryCount() public view returns (uint256) {
        return entries.length;
    }

    /**
     * @dev Get an audit entry by index
     * @param index The index of the entry
     * @return The audit entry
     */
    function getEntry(uint256 index) public view returns (AuditEntry memory) {
        require(index < entries.length, "Index out of bounds");
        return entries[index];
    }
}
