// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Audit
 * @notice Immutable audit log for Zuul proxy
 *
 * Every access attempt (success or denied) is logged here.
 * Entries can never be deleted or modified.
 * Admin has decryption key to decrypt audit payloads; hashes remain public for integrity.
 *
 * Structure per entry:
 * - auditId: UUID v4 (unique identifier)
 * - timestamp: Unix seconds (when did this happen)
 * - encryptedPayload: AES-256-GCM ciphertext (what happened — agent, tool, action, etc.)
 * - payloadHash: SHA-256 hash of plaintext (proves integrity — admin can decrypt and verify)
 * - agentSignature: EIP-191 signature from agent's X-Signature header (proves agent intent)
 * - proxySignature: Proxy signature over payloadHash (proves Zuul attestation)
 */

contract Audit is Ownable {
    constructor() Ownable(msg.sender) {}

    // ========================================================================
    // TYPES
    // ========================================================================

    struct AuditEntry {
        bytes32 auditId;
        uint256 timestamp;
        bytes encryptedPayload;
        bytes32 payloadHash;
        bytes agentSignature;
        bytes proxySignature;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    /// auditId -> AuditEntry
    mapping(bytes32 => AuditEntry) public auditLog;

    /// Append-only list of audit IDs (for iteration)
    bytes32[] public auditIds;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event AuditLogged(
        bytes32 indexed auditId,
        uint256 indexed timestamp,
        address indexed agentAddress
    );

    // ========================================================================
    // WRITE INTERFACE
    // ========================================================================

    /**
     * Log an audit entry
     * Only owner (the Zuul proxy) can call this
     *
     * @param auditId Unique identifier (UUID v4)
     * @param encryptedPayload AES-256-GCM encrypted audit payload (agent, tool, action, endpoint, latency, status)
     * @param payloadHash SHA-256 hash of plaintext payload (for integrity verification)
     * @param agentSignature Agent's EIP-191 signature (from X-Signature header, proves intent)
     * @param proxySignature Proxy's signature over payloadHash (proves Zuul attestation)
     */
    function logAudit(
        bytes32 auditId,
        bytes calldata encryptedPayload,
        bytes32 payloadHash,
        bytes calldata agentSignature,
        bytes calldata proxySignature
    ) external onlyOwner {
        require(auditId != bytes32(0), "Invalid audit ID");
        require(encryptedPayload.length > 0, "Invalid payload");
        require(payloadHash != bytes32(0), "Invalid hash");
        require(agentSignature.length > 0, "Invalid agent signature");
        require(proxySignature.length > 0, "Invalid proxy signature");

        uint256 timestamp = block.timestamp;

        auditLog[auditId] = AuditEntry({
            auditId: auditId,
            timestamp: timestamp,
            encryptedPayload: encryptedPayload,
            payloadHash: payloadHash,
            agentSignature: agentSignature,
            proxySignature: proxySignature
        });

        auditIds.push(auditId);

        // Emit event for off-chain indexing
        // Note: agent address recovered from signature by off-chain indexer if needed
        emit AuditLogged(auditId, timestamp, address(0));
    }

    // ========================================================================
    // READ INTERFACE
    // ========================================================================

    /**
     * Get a specific audit entry
     * @param auditId The audit entry ID
     * @return The AuditEntry (encrypted; admin must decrypt)
     */
    function getAuditEntry(bytes32 auditId) external view returns (AuditEntry memory) {
        return auditLog[auditId];
    }

    /**
     * Get the count of audit entries
     * @return Total number of entries logged
     */
    function getAuditCount() external view returns (uint256) {
        return auditIds.length;
    }

    /**
     * Iterate over audit entries (paginated)
     * @param offset Starting index
     * @param limit Number of entries to return
     * @return Array of audit entries
     */
    function getAuditEntries(uint256 offset, uint256 limit)
        external
        view
        returns (AuditEntry[] memory)
    {
        require(offset < auditIds.length, "Offset out of bounds");
        uint256 end = offset + limit;
        if (end > auditIds.length) end = auditIds.length;

        AuditEntry[] memory entries = new AuditEntry[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            entries[i - offset] = auditLog[auditIds[i]];
        }
        return entries;
    }
}
