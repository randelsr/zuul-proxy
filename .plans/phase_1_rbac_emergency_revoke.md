# Phase 1: RBAC Emergency Revoke (Story #14)

**Status:** Planning
**Priority:** CRITICAL (Blocks demo flow)
**User Stories:** Story #14 — Emergency-revoke an agent

---

## Overview

Add per-agent emergency revocation capability to the RBAC contract. When an agent is revoked, all future permission checks return `isActive: false` regardless of role status. This enables admins to immediately block compromised agents without affecting other agents or roles.

**Current Gap:**
- RBAC contract has `setRoleStatus(roleId, isActive)` which affects ALL agents in a role
- No way to revoke a single compromised agent without disrupting legitimate users in the same role

**What We're Building:**
- `emergencyRevoke(agent)` function in RBAC.sol
- Per-agent revocation mapping: `mapping(address => bool) revokedAgents`
- Updated `getAgentRole()` to return `isActive: false` if agent is revoked
- Owner-only access control (no OpenZeppelin needed for MVP)
- Event emission for audit trail

---

## Implementation Details

### 1.1 Update RBAC.sol Contract

**File:** `contracts/RBAC.sol`

**Additions:**
```solidity
// Owner for access control (replaces implicit deployer)
address public owner;

// Per-agent revocation mapping
mapping(address agent => bool isRevoked) public revokedAgents;

// Event for emergency revoke (audit trail)
event AgentRevoked(address indexed agent, uint256 timestamp);

// Constructor: set deployer as owner
constructor() {
    owner = msg.sender;
}

// Modifier: restrict to owner
modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call this");
    _;
}

// Emergency revoke function
function emergencyRevoke(address agent) public onlyOwner {
    revokedAgents[agent] = true;
    emit AgentRevoked(agent, block.timestamp);
}
```

**Update getAgentRole:**
```solidity
function getAgentRole(address agent) public view returns (bytes32, bool) {
    // If agent is revoked, return inactive regardless of role status
    if (revokedAgents[agent]) {
        return (agentRoles[agent], false);
    }

    bytes32 roleId = agentRoles[agent];
    bool isActive = activeRoles[roleId];
    return (roleId, isActive);
}
```

**Why This Design:**
- ✅ Single responsibility: `revokedAgents` mapping only handles per-agent revocation
- ✅ Minimal storage: One mapping + one modifier + one function (no heavy OpenZeppelin abstractions)
- ✅ Gas efficient: O(1) SLOAD for revocation check in getAgentRole (single mapping lookup)
- ✅ Backward compatible: Existing `setAgentRole`, `setRoleStatus`, `isRoleActive` functions unchanged
- ✅ Owner model: Simple constructor-based ownership suitable for MVP (can upgrade to Ownable later)
- ✅ Audit trail: Event emission for off-chain monitoring

**Implementation Notes:**
- Constructor sets `owner = msg.sender` at deployment (captured from deploy script)
- No function to restore revocation (intentional: revoked agents stay revoked—paranoid by default)
- `emergencyRevoke` can be called multiple times on same agent (idempotent, safe)
- Event emits `block.timestamp` for on-chain audit trail

---

### 1.2 Update TypeScript Types

**File:** `src/types.ts`

**Existing Agent type (review current implementation):**
```typescript
export type Agent = Readonly<{
  address: AgentAddress;
  roleId: RoleId;
  status: 'active' | 'revoked';  // This field already exists!
  registeredAt: Timestamp;
}>;
```

**NOTE:** The `Agent.status` field already models revocation status. Ensure the application layer (chain driver) respects this field:
- When `isActive = false` from contract, set `status = 'revoked'`
- When `status = 'revoked'`, deny all requests with 403 / -32011

**No changes to AuditEntry yet** (will happen in Phase 2).

---

### 1.3 Update Chain Driver

**File:** `src/chain/hedera-driver.ts` (or equivalent EVM driver)

**Current getAgentRole implementation (verify):**
```typescript
async getAgentRole(
  agent: AgentAddress,
  rbacAddress: string
): Promise<Result<Agent, ServiceError>> {
  // Make contract call: RBAC.getAgentRole(agent)
  const [roleIdHash, isActive] = await publicClient.readContract({
    address: rbacAddress as `0x${string}`,
    abi: RBAC_ABI,
    functionName: 'getAgentRole',
    args: [agent],
  });

  return {
    ok: true,
    value: {
      address: agent,
      roleId: hashToRoleId(roleIdHash),
      status: isActive ? 'active' : 'revoked',  // ← Already handles revocation!
      registeredAt: /* ... */,
    },
  };
}
```

**After Phase 1:** This will automatically respect the contract's revocation check because `getAgentRole()` now returns `isActive = false` when agent is revoked. **No TypeScript changes needed** for Phase 1.

---

### 1.4 Redeploy Contracts

**Command:**
```bash
pnpm contracts:build
pnpm contracts:deploy:local
```

**Expected Output:**
```
✓ RBAC contract deployed to: 0x5FC...
✓ Audit contract deployed to: 0x7D2...
```

**Update .env with new addresses:**
```
RBAC_CONTRACT_ADDRESS=0x5FC...
AUDIT_CONTRACT_ADDRESS=0x7D2...
```

**Verify in Hardhat node logs:**
- Check that RBAC constructor executed (`owner` is set to test account)
- `revokedAgents` mapping initialized (empty)

---

### 1.5 Add Unit Tests

**File:** `tests/rbac/test_emergency_revoke.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HardhatChainDriver } from '../../src/chain/hedera-driver';
import { keccak256 } from 'viem';

describe('RBAC Emergency Revoke', () => {
  let driver: HardhatChainDriver;
  let rbacAddress: string;

  beforeEach(async () => {
    driver = new HardhatChainDriver(/* config */);
    rbacAddress = process.env.RBAC_CONTRACT_ADDRESS!;
  });

  describe('emergencyRevoke(agent)', () => {
    it('should set revokedAgents[agent] = true', async () => {
      const agent = '0x1234...';
      const tx = await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );

      expect(tx.ok).toBe(true);
      expect(tx.value).toMatch(/^0x/); // tx hash
    });

    it('should emit AgentRevoked event', async () => {
      // Listen for event in Hardhat node
      const agent = '0x5678...';
      const tx = await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );

      // Verify event was emitted with correct agent + timestamp
      expect(tx.ok).toBe(true);
    });

    it('should be callable only by owner', async () => {
      const otherAccount = '0x9999...'; // Non-owner account
      const agentToRevoke = '0x1111...';

      const tx = await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agentToRevoke],
        { from: otherAccount } // Non-owner signer
      );

      expect(tx.ok).toBe(false);
      expect(tx.error.message).toMatch(/Only owner/i);
    });
  });

  describe('getAgentRole(agent) respects revocation', () => {
    it('should return (roleId, false) if agent is revoked', async () => {
      const agent = '0x2222...';
      const roleId = keccak256('0x' + Buffer.from('developer').toString('hex'));

      // 1. Set agent role to active
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'setAgentRole',
        [agent, roleId]
      );

      // 2. Activate role
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'setRoleStatus',
        [roleId, true]
      );

      // 3. Verify agent has active role
      let result = await driver.readContract(
        rbacAddress,
        RBAC_ABI,
        'getAgentRole',
        [agent]
      );
      expect(result[1]).toBe(true); // isActive = true

      // 4. Revoke agent
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );

      // 5. Verify getAgentRole now returns false despite active role
      result = await driver.readContract(
        rbacAddress,
        RBAC_ABI,
        'getAgentRole',
        [agent]
      );
      expect(result[0]).toEqual(roleId); // roleId unchanged
      expect(result[1]).toBe(false); // isActive = false (due to revocation)
    });

    it('should deny permission checks for revoked agents', async () => {
      // This test bridges Solidity → TypeScript layer
      const agent = '0x3333...';
      const rbacAddress = process.env.RBAC_CONTRACT_ADDRESS!;

      // Set up agent with developer role
      const developerRoleId = keccak256('0x' + Buffer.from('developer').toString('hex'));
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'setAgentRole',
        [agent, developerRoleId]
      );
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'setRoleStatus',
        [developerRoleId, true]
      );

      // Verify developer can access github (read permission)
      const agentBefore = await driver.getAgentRole(agent as AgentAddress, rbacAddress);
      expect(agentBefore.ok).toBe(true);
      expect(agentBefore.value!.status).toBe('active');

      // Revoke agent
      await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );

      // Verify agent is now revoked
      const agentAfter = await driver.getAgentRole(agent as AgentAddress, rbacAddress);
      expect(agentAfter.ok).toBe(true);
      expect(agentAfter.value!.status).toBe('revoked');
    });

    it('should be idempotent (can revoke same agent multiple times)', async () => {
      const agent = '0x4444...';

      // Revoke twice
      const tx1 = await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );
      expect(tx1.ok).toBe(true);

      const tx2 = await driver.writeContract(
        rbacAddress,
        RBAC_ABI,
        'emergencyRevoke',
        [agent]
      );
      expect(tx2.ok).toBe(true);

      // Both succeed; agent remains revoked
    });
  });
});
```

**Test Execution:**
```bash
pnpm test tests/rbac/test_emergency_revoke.ts
```

**Expected Results:**
- ✅ All 6 test cases pass
- ✅ Emergency revoke function callable only by owner
- ✅ getAgentRole returns isActive=false for revoked agents
- ✅ Idempotent: multiple revokes safe

---

### 1.6 Update Middleware (RBAC Layer)

**File:** `src/api/middleware/rbac.ts`

**Existing code (verify):**
```typescript
export function rbacMiddleware(...) {
  return async (context, next) => {
    const agent = /* recovered from signature */;
    const rbacResult = await chainDriver.getAgentRole(agent, rbacAddress);

    if (!rbacResult.ok) {
      // Log and deny
      return context.json({ error: rbacResult.error }, 503);
    }

    const agentInfo = rbacResult.value;

    // Check if agent is active
    if (agentInfo.status === 'revoked') {
      logger.warn(
        { agent: agentInfo.address, tool, action },
        'Revoked agent denied access'
      );
      return context.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32011,
            message: 'Agent is revoked',
            data: { reason: 'emergency_revocation' },
          },
          _governance: {
            request_id: requestId,
            agent: agentInfo.address,
            error_type: 'permission/agent_revoked',
            timestamp,
          },
        },
        403
      );
    }

    // Continue to next middleware
    return next();
  };
}
```

**After Phase 1:** This middleware will automatically deny revoked agents because `chainDriver.getAgentRole()` returns `status: 'revoked'`. **No changes needed** — the existing code already handles revocation.

---

## Success Criteria

- ✅ RBAC.sol compiles without errors
- ✅ emergencyRevoke function is owner-only and idempotent
- ✅ getAgentRole returns isActive=false for revoked agents
- ✅ All 6 unit tests pass
- ✅ Revocation check integrated into existing rbacMiddleware (no new middleware needed)
- ✅ Demo can show: agent denied → admin revokes → confirmed denied
- ✅ Gas usage for emergencyRevoke <50k (single SSTORE)
- ✅ Gas usage for getAgentRole check <5k additional (single SLOAD)

---

## Validation Checklist

- [ ] `pnpm contracts:build` compiles RBAC.sol successfully
- [ ] `pnpm contracts:deploy:local` deploys to Hardhat node
- [ ] `.env` updated with new RBAC_CONTRACT_ADDRESS
- [ ] `pnpm test tests/rbac/test_emergency_revoke.ts` passes all 6 tests
- [ ] `pnpm test` — full suite still passes (no regressions)
- [ ] Hardhat node shows 0 errors during deployment
- [ ] Demo scenario.ts can call emergencyRevoke and verify denial

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Owner account compromise | MVP limitation: single owner (no multi-sig). Deployment script uses test account. Production will require proper owner management. |
| No revocation reversal | Intentional: revoked agents stay revoked. If needed later, add `restoreAgent()` with time-lock governance. |
| Storage bloat | Only one boolean per agent in mapping. Negligible cost. |
| Race condition on deployment | Contract constructor runs once; owner set at deployment time. Safe. |

---

## Performance Notes

- **emergencyRevoke gas cost:** ~21,000 + 20,000 (SSTORE) = ~41,000 gas
- **getAgentRole overhead:** +2,100 gas for revocation check (single SLOAD + JUMPI)
- **No memory bloat:** Mapping is sparse; only stores revoked agents
- **Cache strategy:** TypeScript cache layer will still work; revokedAgents check happens at contract level first

---

## Dependencies & References

- **Solidity:** ^0.8.20 (existing; no new deps)
- **viem:** Already used for contract reads/writes
- **Hardhat:** Already used for local node
- **Testing:** Vitest (existing)

No new dependencies required. Phase 1 is purely Solidity contract changes + tests.

---

## Next Phase

Phase 2 will upgrade the Audit contract to store full encrypted payloads and add query functions. Phase 1 revocation is standalone and doesn't block Phase 2.
