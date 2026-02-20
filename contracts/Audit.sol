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
     * @dev Stores audit entry information with encrypted payload
     * Only unencrypted fields: agent (for querying), timestamp (for time range), encrypted payload, and hash
     * All operational details (tool, action, success/failure, error) are encrypted
     */
    struct AuditEntry {
        address agent;                      // Agent wallet (indexed for queries)
        bytes encryptedPayload;             // Full AES-256-GCM encrypted audit data (contains tool, action, success, error)
        bytes32 payloadHash;                // SHA-256(plaintext) — proves integrity
        uint256 timestamp;                  // Block timestamp (indexed for time-range queries)
    }

    AuditEntry[] public entries;

    // Indexes for efficient queries (O(1) agent lookups, O(n) time range)
    // Tool queries require decryption, so no tool index
    mapping(address => uint256[]) private entriesByAgent;      // Agent → [entryIndex...]

    /**
     * @dev Emitted when an audit entry is recorded
     * All operational details are encrypted, only agent/timestamp/hash are unencrypted
     */
    event AuditLogged(address indexed agent, bytes32 indexed payloadHash, uint256 timestamp, uint256 entryIndex);

    /**
     * @dev Initialize with RBAC contract address
     * @param _rbacContract Address of the RBAC contract
     */
    constructor(address _rbacContract) {
        rbacContract = _rbacContract;
    }

    /**
     * @dev Record an audit entry with encrypted payload
     * All operational details (tool, action, success/failure, error) must be in the encrypted payload
     * @param agent The agent address
     * @param encryptedPayload Full AES-256-GCM encrypted audit data (contains all operational details)
     * @param payloadHash SHA-256 hash of plaintext payload for integrity verification
     */
    function recordEntry(
        address agent,
        bytes memory encryptedPayload,
        bytes32 payloadHash
    ) public {
        AuditEntry memory entry = AuditEntry({
            agent: agent,
            encryptedPayload: encryptedPayload,
            payloadHash: payloadHash,
            timestamp: block.timestamp
        });

        uint256 entryIndex = entries.length;
        entries.push(entry);

        // Update agent index for O(1) agent queries
        entriesByAgent[agent].push(entryIndex);

        emit AuditLogged(agent, payloadHash, block.timestamp, entryIndex);
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

    /**
     * @dev Get entries by agent with pagination
     * @param agent The agent address
     * @param offset Starting index in agent's entries
     * @param limit Max results (capped at 100)
     * @return Array of AuditEntry structs
     */
    function getEntriesByAgent(
        address agent,
        uint256 offset,
        uint256 limit
    ) public view returns (AuditEntry[] memory) {
        require(limit <= 100, "Limit must be <= 100");

        uint256[] memory indices = entriesByAgent[agent];
        uint256 available = indices.length > offset ? indices.length - offset : 0;
        uint256 count = available > limit ? limit : available;

        AuditEntry[] memory result = new AuditEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = entries[indices[offset + i]];
        }
        return result;
    }


    /**
     * @dev Get entries by time range with pagination (sequential scan)
     * @param startTime Start timestamp (inclusive)
     * @param endTime End timestamp (inclusive)
     * @param offset Starting index in filtered entries
     * @param limit Max results (capped at 100)
     * @return Array of matching AuditEntry structs
     */
    function getEntriesByTimeRange(
        uint256 startTime,
        uint256 endTime,
        uint256 offset,
        uint256 limit
    ) public view returns (AuditEntry[] memory) {
        require(limit <= 100, "Limit must be <= 100");
        require(startTime <= endTime, "Invalid time range");

        // Two-pass: count matches, then filter
        uint256 count = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].timestamp >= startTime && entries[i].timestamp <= endTime) {
                count++;
            }
        }

        // Second pass: collect results with offset/limit
        uint256 available = count > offset ? count - offset : 0;
        uint256 resultCount = available > limit ? limit : available;

        AuditEntry[] memory result = new AuditEntry[](resultCount);
        uint256 resultIdx = 0;
        uint256 matchIdx = 0;

        for (uint256 i = 0; i < entries.length && resultIdx < resultCount; i++) {
            if (entries[i].timestamp >= startTime && entries[i].timestamp <= endTime) {
                if (matchIdx >= offset) {
                    result[resultIdx] = entries[i];
                    resultIdx++;
                }
                matchIdx++;
            }
        }

        return result;
    }

    /**
     * @dev Get count of entries for an agent
     * @param agent The agent address
     * @return Number of entries
     */
    function getAgentEntryCount(address agent) public view returns (uint256) {
        return entriesByAgent[agent].length;
    }

}
