# Phase 2: Audit Contract Upgrade (Stories #12, #13)

**Status:** Planning
**Priority:** IMPORTANT (Admin visibility requirements)
**User Stories:** Story #12 — Search audit logs; Story #13 — Decrypt audit logs

---

## Overview

Upgrade the Audit contract to store full encrypted payloads on-chain and add query functions. This enables:
- **Story #12:** Admin can search audit logs by agent, tool, timestamp range
- **Story #13:** Admin can decrypt audit payloads to inspect request details

**Current Gap:**
- Audit.sol only stores: `{ agent, entryHash, timestamp, isSuccess }`
- No query functions (only sequential enumeration via getEntry)
- No storage for encrypted payloads (required for decryption)

**What We're Building:**
- Upgrade AuditEntry struct with full encrypted payload + tool name + error type
- Add index mappings for O(1) agent/tool lookups
- Add pagination-enabled query functions (getEntriesByAgent, getEntriesByTool, getEntriesByTimeRange)
- Maintain immutability: entries can only be appended, never modified/deleted

---

## Implementation Details

### 2.1 Update Audit.sol Contract

**File:** `contracts/Audit.sol`

**NEW: Updated AuditEntry struct**
```solidity
struct AuditEntry {
    address agent;                      // Agent wallet (indexed for queries)
    bytes encryptedPayload;             // Full AES-256-GCM encrypted audit data
    bytes32 payloadHash;                // SHA-256(plaintext) — proves integrity
    uint256 timestamp;                  // Block timestamp (indexed for time-range queries)
    bool isSuccess;                     // Request succeeded or denied
    string tool;                        // Tool key (indexed for tool queries)
    string errorType;                   // Error code if denied (e.g., "permission/no_action_access")
}
```

**Why this structure:**
- ✅ Encrypted payload enables Story #13 (admin can decrypt)
- ✅ payloadHash provides integrity proof (public, tamper-evident)
- ✅ tool + errorType enable filtering without decryption
- ✅ timestamp + isSuccess enable basic queries
- ✅ No private key stored; encryption key is admin-only

**NEW: Index mappings**
```solidity
// Indexes for efficient queries (O(1) agent/tool lookups, O(n) time range)
mapping(address => uint256[]) private entriesByAgent;      // Agent → [entryIndex...]
mapping(string => uint256[]) private entriesByTool;        // Tool → [entryIndex...]
```

**Why indexes:**
- ✅ O(1) to find all entries for an agent (instead of sequential scan)
- ✅ O(1) to find all entries for a tool
- ✅ Time range queries still O(n) but acceptable for MVP volumes
- ✅ Trade-off: ~32 bytes extra storage per entry (two index writes per recordEntry call)

**UPDATED: recordEntry function**
```solidity
function recordEntry(
    address agent,
    bytes memory encryptedPayload,
    bytes32 payloadHash,
    bool isSuccess,
    string memory tool,
    string memory errorType
) public {
    AuditEntry memory entry = AuditEntry({
        agent: agent,
        encryptedPayload: encryptedPayload,
        payloadHash: payloadHash,
        timestamp: block.timestamp,
        isSuccess: isSuccess,
        tool: tool,
        errorType: errorType
    });

    uint256 entryIndex = entries.length;
    entries.push(entry);

    // Update indexes for O(1) queries
    entriesByAgent[agent].push(entryIndex);
    entriesByTool[tool].push(entryIndex);

    emit AuditLogged(agent, payloadHash, block.timestamp, isSuccess, tool, entryIndex);
}
```

**NEW: Query functions with pagination**

```solidity
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
 * @dev Get entries by tool with pagination
 * @param tool The tool key
 * @param offset Starting index in tool's entries
 * @param limit Max results (capped at 100)
 * @return Array of AuditEntry structs
 */
function getEntriesByTool(
    string memory tool,
    uint256 offset,
    uint256 limit
) public view returns (AuditEntry[] memory) {
    require(limit <= 100, "Limit must be <= 100");

    uint256[] memory indices = entriesByTool[tool];
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

/**
 * @dev Get count of entries for a tool
 * @param tool The tool key
 * @return Number of entries
 */
function getToolEntryCount(string memory tool) public view returns (uint256) {
    return entriesByTool[tool].length;
}

/**
 * @dev Get total number of audit entries
 * @return Total count
 */
function getEntryCount() public view returns (uint256) {
    return entries.length;
}

/**
 * @dev Get a single entry by index (existing, no change)
 * @param index The entry index
 * @return The audit entry
 */
function getEntry(uint256 index) public view returns (AuditEntry memory) {
    require(index < entries.length, "Index out of bounds");
    return entries[index];
}
```

**NEW: Updated Event**
```solidity
// Update existing AuditLogged event to include tool and entryIndex
event AuditLogged(
    address indexed agent,
    bytes32 indexed payloadHash,
    uint256 timestamp,
    bool isSuccess,
    string tool,
    uint256 entryIndex
);
```

**Why this API:**
- ✅ Pagination prevents out-of-gas errors (limit 100 per query)
- ✅ Agent + tool queries use indexes (O(1) index lookup, O(limit) result collection)
- ✅ Time range queries use sequential scan (acceptable for MVP)
- ✅ Count functions enable client-side pagination UI
- ✅ View functions are pure (no gas cost for callers)
- ✅ Backward compatible: getEntryCount() and getEntry() still work

---

### 2.2 Update TypeScript AuditEntry Type

**File:** `src/types.ts`

**Current AuditEntry (review):**
```typescript
export type AuditEntry = Readonly<{
  auditId: AuditId;
  timestamp: Timestamp;
  encryptedPayload: EncryptedPayload;  // ← NOW STORED ON-CHAIN
  payloadHash: Hash;
  agentSignature: Signature;
  proxySignature: Signature;
}>;
```

**NO CHANGES NEEDED** — The TypeScript type already models full encrypted payloads. Phase 2 makes the contract match what the application already expects.

---

### 2.3 Update Audit Writer (Blockchain Integration)

**File:** `src/audit/contract.ts`

**Current logAudit implementation (verify):**
```typescript
async logAudit(
  entry: AuditEntry,
  auditPayload: AuditPayload,
  chainDriver: ChainDriver,
  auditContractAddress: string
): Promise<Result<TransactionHash, ServiceError>> {
  try {
    const result = await chainDriver.writeContract(
      auditContractAddress,
      AUDIT_ABI,
      'recordEntry',
      [
        entry.auditId,                  // Was: entryHash
        entry.encryptedPayload,         // ← NEW: full encrypted payload
        entry.payloadHash,              // ← NEW: hash for integrity
        auditPayload.status === 'success',  // isSuccess
        auditPayload.tool,              // ← NEW: tool name
        auditPayload.errorType || '',   // ← NEW: error type if denied
      ]
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to log audit entry');
    return {
      ok: false,
      error: new ServiceError('Blockchain write failed', -32022),
    };
  }
}
```

**Implementation notes:**
- Pass full `entry.encryptedPayload` (not just hash)
- Include `auditPayload.tool` for filtering
- Include `auditPayload.errorType` for context (can be empty string if success)
- Payload hash and agent signature already computed in audit/encryption.ts

---

### 2.4 Update ABI and Viem Types

**File:** `src/chain/abis/audit-abi.ts`

**Update AUDIT_ABI with new signature:**
```typescript
export const AUDIT_ABI = [
  // ... existing functions ...
  {
    type: 'function',
    name: 'recordEntry',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'encryptedPayload', type: 'bytes' },
      { name: 'payloadHash', type: 'bytes32' },
      { name: 'isSuccess', type: 'bool' },
      { name: 'tool', type: 'string' },
      { name: 'errorType', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getEntriesByAgent',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ type: 'tuple[]', components: [/* AuditEntry fields */] }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEntriesByTool',
    inputs: [
      { name: 'tool', type: 'string' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ type: 'tuple[]', components: [/* AuditEntry fields */] }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEntriesByTimeRange',
    inputs: [
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ type: 'tuple[]', components: [/* AuditEntry fields */] }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentEntryCount',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getToolEntryCount',
    inputs: [{ name: 'tool', type: 'string' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // ... rest ...
] as const;
```

---

### 2.5 Add Integration Tests

**File:** `tests/audit/test_query_functions.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HardhatChainDriver } from '../../src/chain/hedera-driver';
import { EncryptionService } from '../../src/audit/encryption';

describe('Audit Contract Query Functions', () => {
  let driver: HardhatChainDriver;
  let auditAddress: string;
  let encryption: EncryptionService;

  beforeEach(async () => {
    driver = new HardhatChainDriver(/* config */);
    auditAddress = process.env.AUDIT_CONTRACT_ADDRESS!;
    encryption = new EncryptionService();
  });

  describe('getEntriesByAgent', () => {
    it('should return entries for a specific agent', async () => {
      const agent = '0x1111...';
      const tool = 'github';
      const errorType = '';

      // Record 3 entries for this agent
      for (let i = 0; i < 3; i++) {
        const payload = Buffer.from(JSON.stringify({ test: i }));
        const encrypted = encryption.encrypt(payload);
        const hash = /* compute SHA-256 */;

        await driver.writeContract(
          auditAddress,
          AUDIT_ABI,
          'recordEntry',
          [agent, encrypted, hash, true, tool, errorType]
        );
      }

      // Query agent entries with pagination
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [agent, 0, 10] // offset=0, limit=10
      );

      expect(result).toHaveLength(3);
      expect(result.every((e) => e.agent === agent)).toBe(true);
    });

    it('should respect pagination offset and limit', async () => {
      const agent = '0x2222...';

      // Record 5 entries
      for (let i = 0; i < 5; i++) {
        // ... record entry ...
      }

      // Query with offset=2, limit=2
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [agent, 2, 2]
      );

      expect(result).toHaveLength(2); // Should get entries 2-3 (0-indexed)
    });

    it('should return empty array if agent has no entries', async () => {
      const agent = '0xDEAD...'; // Never used

      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [agent, 0, 10]
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('getEntriesByTool', () => {
    it('should return entries for a specific tool', async () => {
      const tool = 'slack';
      const agents = ['0x3333...', '0x4444...', '0x5555...'];

      // Record entries for different agents but same tool
      for (const agent of agents) {
        const payload = Buffer.from(JSON.stringify({ agent }));
        const encrypted = encryption.encrypt(payload);
        const hash = /* compute SHA-256 */;

        await driver.writeContract(
          auditAddress,
          AUDIT_ABI,
          'recordEntry',
          [agent, encrypted, hash, true, tool, '']
        );
      }

      // Query tool entries
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByTool',
        [tool, 0, 10]
      );

      expect(result).toHaveLength(3);
      expect(result.every((e) => e.tool === tool)).toBe(true);
    });
  });

  describe('getEntriesByTimeRange', () => {
    it('should return entries within time range', async () => {
      const agent = '0x6666...';
      const now = Math.floor(Date.now() / 1000);

      // Record entries with different timestamps
      const timestamps = [now - 1000, now, now + 1000];
      for (const ts of timestamps) {
        // ... record entry at this timestamp ...
      }

      // Query entries in range [now - 500, now + 500]
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByTimeRange',
        [now - 500, now + 500, 0, 10]
      );

      expect(result).toHaveLength(2); // Should get entries at `now` and `now + 1000`? (No, within range)
      expect(result.every((e) => e.timestamp >= now - 500)).toBe(true);
    });

    it('should return empty array if no entries in range', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Query far future range
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByTimeRange',
        [now + 10000, now + 20000, 0, 10]
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('Count functions', () => {
    it('getAgentEntryCount should return correct count', async () => {
      const agent = '0x7777...';

      // Record 5 entries
      for (let i = 0; i < 5; i++) {
        // ... record entry ...
      }

      const count = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getAgentEntryCount',
        [agent]
      );

      expect(count).toBe(5n); // Solidity returns uint256
    });

    it('getToolEntryCount should return correct count', async () => {
      const tool = 'openai';

      // Record 3 entries for this tool
      for (let i = 0; i < 3; i++) {
        // ... record entry with tool='openai' ...
      }

      const count = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getToolEntryCount',
        [tool]
      );

      expect(count).toBe(3n);
    });

    it('getEntryCount should return total count', async () => {
      const initialCount = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntryCount',
        []
      );

      // Record 2 more entries
      for (let i = 0; i < 2; i++) {
        // ... record entry ...
      }

      const newCount = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntryCount',
        []
      );

      expect(newCount).toBe(initialCount + 2n);
    });
  });

  describe('Encrypted payload decryption', () => {
    it('should store encrypted payload that can be decrypted', async () => {
      const agent = '0x8888...';
      const originalData = { agent, tool: 'github', action: 'read' };
      const payload = Buffer.from(JSON.stringify(originalData));

      // Encrypt
      const encrypted = encryption.encrypt(payload);
      const hash = /* compute SHA-256(payload) */;

      // Record entry
      await driver.writeContract(
        auditAddress,
        AUDIT_ABI,
        'recordEntry',
        [agent, encrypted, hash, true, 'github', '']
      );

      // Query entry
      const entries = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [agent, 0, 10]
      );

      expect(entries).toHaveLength(1);
      const entry = entries[0];

      // Decrypt
      const decrypted = encryption.decrypt(entry.encryptedPayload);
      expect(decrypted.ok).toBe(true);
      expect(JSON.parse(decrypted.value.toString())).toEqual(originalData);

      // Verify hash matches
      const computedHash = /* compute SHA-256(decrypted) */;
      expect(computedHash).toBe(entry.payloadHash);
    });
  });

  describe('Pagination safety', () => {
    it('should reject limit > 100', async () => {
      const agent = '0x9999...';

      try {
        await driver.readContract(
          auditAddress,
          AUDIT_ABI,
          'getEntriesByAgent',
          [agent, 0, 101] // limit > 100
        );
        expect.fail('Should have thrown');
      } catch (error) {
        expect(String(error)).toMatch(/Limit must be/i);
      }
    });

    it('should handle offset beyond array length gracefully', async () => {
      const agent = '0xAAAA...';

      // Record 2 entries
      for (let i = 0; i < 2; i++) {
        // ... record entry ...
      }

      // Query with offset beyond length
      const result = await driver.readContract(
        auditAddress,
        AUDIT_ABI,
        'getEntriesByAgent',
        [agent, 100, 10] // offset=100 but only 2 entries
      );

      expect(result).toHaveLength(0);
    });
  });
});
```

**Test Execution:**
```bash
pnpm test tests/audit/test_query_functions.ts
```

**Expected Results:**
- ✅ All 12+ test cases pass
- ✅ Query functions return correct entries
- ✅ Pagination works with offset/limit
- ✅ Encrypted payloads can be decrypted
- ✅ Hashes match plaintext
- ✅ Empty results handled gracefully

---

### 2.6 Redeploy Contracts

**Command:**
```bash
pnpm contracts:build
pnpm contracts:deploy:local
```

**Expected Output:**
```
✓ RBAC contract deployed to: 0x5FC...
✓ Audit contract deployed to: 0x7D2... (NEW: with query functions)
```

**Update .env:**
```
RBAC_CONTRACT_ADDRESS=0x5FC...
AUDIT_CONTRACT_ADDRESS=0x7D2...
```

---

## Success Criteria

- ✅ Audit.sol compiles without errors
- ✅ AuditEntry struct stores encryptedPayload, payloadHash, tool, errorType
- ✅ recordEntry accepts new parameters and updates indexes
- ✅ getEntriesByAgent returns O(1) indexed results
- ✅ getEntriesByTool returns O(1) indexed results
- ✅ getEntriesByTimeRange returns O(n) sequential scan results
- ✅ Count functions return correct totals
- ✅ Pagination enforces limit <= 100
- ✅ All 12+ integration tests pass
- ✅ Encrypted payloads can be decrypted by admin
- ✅ Hash integrity verified
- ✅ Gas usage per audit entry <300k (write) + <50k (read)

---

## Validation Checklist

- [ ] `pnpm contracts:build` compiles Audit.sol successfully
- [ ] `pnpm contracts:deploy:local` deploys to Hardhat node
- [ ] `.env` updated with new AUDIT_CONTRACT_ADDRESS
- [ ] `pnpm test tests/audit/test_query_functions.ts` passes all tests
- [ ] `pnpm test` — full suite still passes (no regressions)
- [ ] Encrypted payloads successfully stored and retrieved
- [ ] Pagination works with offset/limit
- [ ] Index mappings reduce query gas cost

---

## Performance Notes

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| recordEntry (write) | ~150-200k | Payload storage + index updates |
| getEntriesByAgent (read) | ~5-10k per entry | Index lookup + struct copying |
| getEntriesByTool (read) | ~5-10k per entry | Index lookup + struct copying |
| getEntriesByTimeRange (read) | ~10-20k per entry | Sequential scan (no index) |
| getAgentEntryCount (read) | ~100 | Array length lookup |

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Gas limit on time-range queries | Pagination limit (100 entries max) prevents out-of-gas errors |
| Encryption key management | Keys managed by admin outside contract; contract only stores ciphertext |
| Storage growth | Entries append-only; indexes grow linearly with unique agents/tools |
| Payload size limits | No explicit limit in contract; application should enforce reasonable bounds |

---

## Dependencies & References

- **Solidity:** ^0.8.20 (existing)
- **viem:** Already used for contract reads/writes
- **AES-256-GCM:** Already implemented in src/audit/encryption.ts
- **Hardhat:** Already used for testing

No new dependencies required.

---

## Next Phase

Phase 3 will expose these query functions via TypeScript admin endpoints (`GET /admin/audit/search`, etc.).
