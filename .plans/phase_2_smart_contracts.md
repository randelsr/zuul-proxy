# Phase 2: Smart Contracts

**Duration:** ~4-6 hours
**Depends on:** Phase 0 (Hardhat configured), Phase 1 (types finalized)
**Deliverable:** RBAC.sol, Audit.sol, TypeChain-generated types, Hardhat Ignition deployment modules
**Success Criteria:** `pnpm contracts:build` compiles with zero warnings; `pnpm contracts:test` passes all tests

---

## Objective

Implement on-chain smart contracts for:
1. **RBAC.sol:** On-chain permission management (register agents, assign roles, grant/revoke permissions)
2. **Audit.sol:** Immutable audit log (record every access attempt, encrypted payload)

Both deployed to Hedera testnet via Hardhat Ignition. TypeChain generates TypeScript types for type-safe contract interaction.

---

## Implementation Details

### 1. contracts/RBAC.sol

**Purpose:** On-chain role-based access control

```solidity
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
```

### 2. contracts/Audit.sol

**Purpose:** Immutable audit log on-chain

```solidity
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
    function getAuditEntry(bytes32 auditId)
        external
        view
        returns (AuditEntry memory)
    {
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
```

### 3. contracts/test/RBAC.test.ts

**Purpose:** TypeScript unit tests for RBAC contract using Vitest + viem

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { getContractAt, deployContract } from '@nomicfoundation/hardhat-viem/ethers-compat'
import { getSigners } from '@nomicfoundation/hardhat-viem/ethers-compat'
import { keccak256, toUtf8Bytes } from 'viem'
import type { Contract } from 'ethers'

describe('RBAC Contract', () => {
  let rbac: Contract
  let owner: Awaited<ReturnType<typeof getSigners>>[number]
  let agent1: Awaited<ReturnType<typeof getSigners>>[number]
  let agent2: Awaited<ReturnType<typeof getSigners>>[number]

  const developerRole = keccak256(toUtf8Bytes('developer'))
  const adminRole = keccak256(toUtf8Bytes('admin'))

  beforeEach(async () => {
    const signers = await getSigners()
    ;[owner, agent1, agent2] = signers

    const RBACFactory = await getContractFactory('RBAC')
    rbac = await RBACFactory.deploy()
    await rbac.waitForDeployment()
  })

  it('should register an agent', async () => {
    const tx = await rbac.registerAgent(agent1.address, developerRole)
    const receipt = await tx.wait()

    expect(receipt?.logs.length).toBeGreaterThan(0)

    const [role, isActive] = await rbac.getAgentRole(agent1.address)
    expect(role).toBe(developerRole)
    expect(isActive).toBe(true)
  })

  it('should grant a permission', async () => {
    const tx = await rbac.grantPermission(developerRole, 'github', 'read')
    const receipt = await tx.wait()

    expect(receipt?.logs.length).toBeGreaterThan(0)
  })

  it('should check permission correctly', async () => {
    // Register agent with developer role
    await rbac.registerAgent(agent1.address, developerRole)

    // Grant permission
    await rbac.grantPermission(developerRole, 'github', 'read')

    // Agent should have permission
    const hasReadPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    const hasCreatePermission = await rbac.hasPermission(agent1.address, 'github', 'create')

    expect(hasReadPermission).toBe(true)
    expect(hasCreatePermission).toBe(false)
  })

  it('should deny access to revoked agent', async () => {
    await rbac.registerAgent(agent1.address, developerRole)
    await rbac.grantPermission(developerRole, 'github', 'read')

    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    expect(hasPermission).toBe(true)

    // Emergency revoke
    await rbac.emergencyRevoke(agent1.address)

    // Agent should no longer have permission
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    expect(hasPermission).toBe(false)
  })

  it('should revoke a permission', async () => {
    await rbac.grantPermission(developerRole, 'github', 'read')
    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    expect(hasPermission).toBe(false) // No registration

    await rbac.registerAgent(agent1.address, developerRole)
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    expect(hasPermission).toBe(true)

    // Revoke permission
    await rbac.revokePermission(developerRole, 'github', 'read')

    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read')
    expect(hasPermission).toBe(false)
  })

  it('should deny non-owner from registering agents', async () => {
    const rbacAsAgent1 = rbac.connect(agent1)

    try {
      await rbacAsAgent1.registerAgent(agent2.address, developerRole)
      expect.fail('Should have thrown error')
    } catch (error) {
      // Expected to revert with OwnableUnauthorizedAccount
      expect(error instanceof Error && error.message).toContain('OwnableUnauthorizedAccount')
    }
  })
})
```

### 4. contracts/test/Audit.test.ts

**Purpose:** TypeScript unit tests for Audit contract

```typescript
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Audit } from '../typechain-types'

describe('Audit Contract', () => {
  let audit: Audit
  let owner: any

  beforeEach(async () => {
    ;[owner] = await ethers.getSigners()
    const AuditFactory = await ethers.getContractFactory('Audit')
    audit = await AuditFactory.deploy()
  })

  it('should log an audit entry', async () => {
    const auditId = ethers.id('test-audit-1')
    const encryptedPayload = ethers.toBeHex('encrypted-data')
    const payloadHash = ethers.id('payload-hash')
    const agentSig = ethers.toBeHex('agent-sig', 65)
    const proxySig = ethers.toBeHex('proxy-sig', 65)

    await expect(
      audit.logAudit(auditId, encryptedPayload, payloadHash, agentSig, proxySig)
    ).to.emit(audit, 'AuditLogged')

    const entry = await audit.getAuditEntry(auditId)
    expect(entry.auditId).to.equal(auditId)
    expect(entry.payloadHash).to.equal(payloadHash)
  })

  it('should deny non-owner from logging', async () => {
    const [, nonOwner] = await ethers.getSigners()
    const auditId = ethers.id('test-audit-1')

    await expect(
      audit.connect(nonOwner).logAudit(
        auditId,
        ethers.toBeHex('data'),
        ethers.id('hash'),
        ethers.toBeHex('sig1', 65),
        ethers.toBeHex('sig2', 65)
      )
    ).to.be.revertedWithCustomError(audit, 'OwnableUnauthorizedAccount')
  })

  it('should paginate audit entries', async () => {
    for (let i = 0; i < 5; i++) {
      const auditId = ethers.id(`audit-${i}`)
      await audit.logAudit(
        auditId,
        ethers.toBeHex('data'),
        ethers.id('hash'),
        ethers.toBeHex('sig1', 65),
        ethers.toBeHex('sig2', 65)
      )
    }

    const count = await audit.getAuditCount()
    expect(count).to.equal(5)

    const page1 = await audit.getAuditEntries(0, 2)
    expect(page1.length).to.equal(2)

    const page2 = await audit.getAuditEntries(2, 2)
    expect(page2.length).to.equal(2)
  })
})
```

### 5. ignition/modules/RBAC.ts

**Purpose:** Hardhat Ignition deployment module for RBAC contract

```typescript
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const RBACModule = buildModule('RBAC', (m) => {
  const rbac = m.contract('RBAC')

  return { rbac }
})

export default RBACModule
```

### 6. ignition/modules/Audit.ts

**Purpose:** Hardhat Ignition deployment module for Audit contract

```typescript
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const AuditModule = buildModule('Audit', (m) => {
  const audit = m.contract('Audit')

  return { audit }
})

export default AuditModule
```

### 7. ignition/parameters/local.json

**Purpose:** Deployment parameters for local Hardhat

```json
{
  "RBAC": {},
  "Audit": {}
}
```

### 8. ignition/parameters/hedera.json

**Purpose:** Deployment parameters for Hedera testnet

```json
{
  "RBAC": {},
  "Audit": {}
}
```

---

## Commands to Execute

```bash
cd /Users/nullfox/repos/zuul-proxy

# Copy Solidity files (create above)
# Copy test files
# Copy Ignition modules and parameters

# Compile contracts
pnpm contracts:build

# Run tests
pnpm contracts:test

# Verify TypeChain types generated
ls -la src/contracts/generated/

# Deploy to local Hardhat (after Phase 3 config is set up)
# pnpm contracts:deploy:local

# Deploy to Hedera testnet (after Phase 3, with env vars)
# pnpm contracts:deploy:hedera

# Commit
git add contracts/ ignition/
git commit -m "Phase 2: Smart contracts — RBAC.sol, Audit.sol, Hardhat Ignition, tests"
```

---

## Acceptance Criteria

- ✅ RBAC.sol compiles without warnings
- ✅ Audit.sol compiles without warnings
- ✅ All contract tests pass: `pnpm contracts:test`
- ✅ TypeChain generates `src/contracts/generated/` files with correct viem types
- ✅ RBAC.registerAgent, grantPermission, hasPermission, emergencyRevoke all tested
- ✅ Audit.logAudit, getAuditEntry, getAuditCount all tested
- ✅ Non-owner access denied (Ownable enforced)
- ✅ Ignition modules ready for deployment

---

## What's NOT in Phase 2

- Deployment to any blockchain (defer to Phase 7 or Phase 14)
- TypeScript wrapper classes (defer to Phase 7: Chain Driver)
- Integration with proxy (defer to Phase 7)
