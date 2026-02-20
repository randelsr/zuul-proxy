# Cost Optimization & Storage Analysis for Zuul Proxy Audit Logging

**Current Implementation:** MVP baseline for auditability
**Analysis Date:** February 20, 2026

---

## Executive Summary

**Current Cost Model:** $1,200-1,500/month for 10k audit entries/day on Hedera
- Each entry = 1 blockchain transaction ($0.003-0.005)
- Full encrypted payload stored on-chain (400-2000+ bytes each)
- No batching, no compression, no storage pruning

**Fundamental Improvement Opportunities:**

| Optimization | Cost Reduction | Complexity | Trade-off |
|---|---|---|---|
| **Batch Saving (MVP → v1.1)** | 70-85% | Low | 100-500ms latency increase |
| **Event-Only Model (MVP → v1.1)** | 0% cost, but 80% storage reduction | Medium | Query via indexing service |
| **Merkle Tree Rollup (v2.0+)** | 99% | High | Off-chain storage required |
| **Hedera File Service (v2.0+)** | 60-80% | Medium | Different API, file-based |

---

## Part 1: Current Cost Structure Analysis

### 1.1 Per-Transaction Costs

**Hedera Fixed Pricing (not gas-based):**

| Operation | Cost | Count/Day | Monthly |
|-----------|------|-----------|---------|
| recordEntry (write) | $0.003-0.005 | 10,000 | $900-1,500 |
| getEntriesByAgent (read) | Free | 20,000 | $0 |
| getEntriesByTool (read) | Free | 20,000 | $0 |
| setAgentRole (register) | ~$0.001 | 10 | ~$0.30 |
| **TOTAL** | | | **$900-1,500** |

**Why each recordEntry is a separate transaction:**

Current code in `src/audit/store.ts`:

```typescript
// Lines 83-85
for (const entry of entriesToProcess) {
  await this.writeWithRetry(entry);  // Individual transaction per entry
}
```

Each entry calls `contractWriter.logAudit()` → `chainDriver.writeContract()` → 1 RPC call to blockchain

**Result:**
- 10k entries/day = 10,000 blockchain transactions
- Each transaction has ~100-200 gas overhead (on Hedera units)
- **70-85% of gas is transaction overhead, only 15-30% is actual data**

---

### 1.2 Storage Growth Analysis

**Current Audit.sol Storage Model:**

```solidity
// Line 25: Dynamic array stores full entries
AuditEntry[] public entries;

// Struct (lines 15-23)
struct AuditEntry {
    address agent;                      // 20 bytes
    bytes encryptedPayload;             // 400-2000 bytes (variable)
    bytes32 payloadHash;                // 32 bytes
    uint256 timestamp;                  // 8 bytes
    bool isSuccess;                     // 1 byte
    string tool;                        // 20-50 bytes
    string errorType;                   // 20-100 bytes
}

// Total per entry: 500-2200 bytes (avg 1000 bytes)
```

**Storage Growth Projection:**

At 10k entries/day × 1000 bytes average:

| Timeframe | Storage | Monthly Cost | Annual Cost |
|-----------|---------|--------------|------------|
| **1 month** | 300 MB | Negligible | Negligible |
| **1 year** | 3.6 GB | Begins to matter | ~$100-500* |
| **5 years** | 18 GB | Significant | ~$500-2500* |

*Exact cost depends on Hedera's storage pricing model (not yet published for large contracts)

**Index Growth (equally problematic):**

```solidity
// Lines 28-29
mapping(address => uint256[]) private entriesByAgent;      // O(n) space
mapping(string => uint256[]) private entriesByTool;        // O(n) space
```

- Each index entry = 8-32 bytes (pointer to entry index)
- With 10k entries/day across N agents/M tools:
  - Agent index: 10k entries × 8 bytes = 80 KB/day = 2.4 MB/month
  - Tool index: 10k entries × 8 bytes = 80 KB/day = 2.4 MB/month
  - **Total indexes: 4.8 MB/month** (but includes duplicates across mappings)

---

### 1.3 Block Space Limits

**Hedera Consensus Network Constraints:**

| Limit | Value | Impact on Zuul |
|-------|-------|---|
| **Throughput** | 10,000+ TPS | Can handle 10k audit entries/day easily |
| **Transaction Size** | ~3-4 KB max | Encrypted payloads fit (avg 1KB) |
| **Smart Contract State** | Unlimited (in theory) | Hedera doesn't have block/state gas limit like Ethereum |
| **Network Bandwidth** | 10 Mbps consensus | 10k entries × 1KB = 10 MB/day ✓ Fine |

**Actual Bottleneck:** Query gas cost in getEntriesByTimeRange

```solidity
// Lines 157-193: O(n) sequential scan
for (uint256 i = 0; i < entries.length; i++) {
    if (entries[i].timestamp >= startTime && entries[i].timestamp <= endTime) {
        count++;  // First pass: count all matches
    }
}
// Second pass: iterate again to collect results
```

**Cost of time-range query:**
- Array of 1M entries: must scan all 1M entries
- Gas cost: 1M × ~100 gas per iteration = **100M+ gas**
- Cost on Hedera: Hedera doesn't charge for view functions, but RPC node may timeout

---

## Part 2: Batch Saving Optimization

### 2.1 Opportunity: Reduce Transaction Count by 85%

**Current:** Each entry = 1 transaction

```
10,000 entries/day = 10,000 transactions
Cost: 10,000 × $0.004 = $40/day = $1,200/month
```

**Proposed:** Batch N entries per transaction

```
10,000 entries/day ÷ 10 entries/batch = 1,000 transactions
Cost: 1,000 × $0.004 = $4/day = $120/month
Savings: 90% cost reduction!
```

### 2.2 Implementation: Batch Write Strategy

**Option A: Time-based batching**

Current code (queue flushes every 5 seconds):

```typescript
// src/audit/store.ts line 27
this.flushInterval = setInterval(() => {
  this.flush().catch(...)
}, flushIntervalMs);  // default 5000ms
```

**Proposal:**

```typescript
// New flush logic with batching
private async flush(): Promise<void> {
  if (this.isFlushing || this.queue.length === 0) return;
  this.isFlushing = true;

  try {
    // Process in batches of 10
    const BATCH_SIZE = 10;
    const entries = [...this.queue];
    this.queue = [];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await this.writeBatch(batch);  // NEW: Single tx for batch
    }
  } finally {
    this.isFlushing = false;
  }
}

private async writeBatch(entries: AuditEntry[]): Promise<void> {
  // Call new recordBatch() function in contract
  // instead of recordEntry() for each item
  const result = await this.contractWriter.logAuditBatch(entries, this.chainDriver);
  // ... retry logic ...
}
```

**Option B: Count-based batching**

```typescript
// Flush when queue reaches threshold
const BATCH_THRESHOLD = 10;
if (this.queue.length >= BATCH_THRESHOLD) {
  this.flush();
}
```

**Option C: Hybrid (what we should do)**

```typescript
// Flush when:
// 1. Queue has 10+ entries, OR
// 2. Timer expires (5 seconds)
// 3. Process is shutting down

private startFlushTimer() {
  this.flushTimer = setInterval(() => {
    if (this.queue.length > 0) {
      this.flush(); // Time-based fallback
    }
  }, 5000);
}

enqueue(entry) {
  this.queue.push(entry);
  if (this.queue.length >= 10) {
    this.flush(); // Eager flush on count threshold
  }
}
```

### 2.3 Contract Changes for Batch Writing

**Current Audit.sol:**

```solidity
function recordEntry(
    address agent,
    bytes memory encryptedPayload,
    bytes32 payloadHash,
    bool isSuccess,
    string memory tool,
    string memory errorType
) public {
    // Process single entry
    // ... 1 tx per call ...
}
```

**Proposed Audit.sol additions:**

```solidity
// NEW: Batch write function
struct AuditEntryInput {
    address agent;
    bytes encryptedPayload;
    bytes32 payloadHash;
    bool isSuccess;
    string tool;
    string errorType;
}

function recordBatch(
    AuditEntryInput[] memory entries
) public {
    for (uint256 i = 0; i < entries.length; i++) {
        AuditEntry memory entry = AuditEntry({
            agent: entries[i].agent,
            encryptedPayload: entries[i].encryptedPayload,
            payloadHash: entries[i].payloadHash,
            timestamp: block.timestamp,
            isSuccess: entries[i].isSuccess,
            tool: entries[i].tool,
            errorType: entries[i].errorType
        });

        uint256 entryIndex = entries.length;
        entries.push(entry);
        entriesByAgent[entry.agent].push(entryIndex);
        entriesByTool[entry.tool].push(entryIndex);

        emit AuditLogged(entry.agent, entry.payloadHash,
                        block.timestamp, entry.isSuccess,
                        entry.tool, entryIndex);
    }
}
```

### 2.4 Cost/Latency Trade-offs

| Batch Size | Transactions/Day | Cost/Day | Latency P95 | Use Case |
|---|---|---|---|---|
| **1 (current)** | 10,000 | $40 | <100ms | Real-time audit |
| **5** | 2,000 | $8 | ~2-5 seconds | Balanced |
| **10** | 1,000 | $4 | ~5 seconds | Cost-optimized |
| **50** | 200 | $0.80 | ~25 seconds | Archive-grade |

**Recommendation:** Batch size = 10
- **Cost:** $120/month (90% reduction)
- **Latency:** <5 seconds (acceptable for audit logs)
- **Trade-off:** Very reasonable

---

## Part 3: Storage Optimization (Event-Only Model)

### 3.1 Problem: Encrypted Payload Storage

**Current approach:**
- Store full encrypted payload in contract state
- Indexed by agent/tool for query
- **Result:** Contract state grows unboundedly

**Better approach:**
- Emit encrypted payload only in event log
- Contract state stores only hashes/references
- Query via event indexing service (Graph Protocol, Thegraph, Covalent)

### 3.2 Event-Only Architecture

**Audit.sol revised:**

```solidity
struct AuditEntryMeta {
    address agent;
    bytes32 payloadHash;
    uint256 timestamp;
    bool isSuccess;
    string tool;
    string errorType;
}

// Store only metadata (no full payload)
AuditEntryMeta[] public entries;

event AuditPayloadLogged(
    address indexed agent,
    bytes32 indexed payloadHash,
    uint256 indexed timestamp,
    bool isSuccess,
    string tool,
    string errorType,
    bytes encryptedPayload  // In event log, not state
);

function recordEntry(
    address agent,
    bytes memory encryptedPayload,
    bytes32 payloadHash,
    bool isSuccess,
    string memory tool,
    string memory errorType
) public {
    // Only store metadata on-chain
    AuditEntryMeta memory meta = AuditEntryMeta({
        agent: agent,
        payloadHash: payloadHash,
        timestamp: block.timestamp,
        isSuccess: isSuccess,
        tool: tool,
        errorType: errorType
    });
    entries.push(meta);

    // Emit full payload in event
    emit AuditPayloadLogged(
        agent, payloadHash, block.timestamp,
        isSuccess, tool, errorType, encryptedPayload
    );
}
```

### 3.3 Storage Reduction

**Before (current):**
- 10k entries/day × 1000 bytes = 10 MB/day
- Indexes: 4.8 MB/month
- Annual: 3.6 GB + overhead

**After (event-only):**
- 10k entries/day × 150 bytes metadata = 1.5 MB/day
- Indexes removed (query via event logs)
- Annual: 550 MB (85% reduction!)

**Monthly storage cost:**
- Before: Negligible (Hedera doesn't charge for contract storage)
- After: Negligible but much smaller surface area
- Benefit: Query performance doesn't degrade with data volume

### 3.4 Query Cost with Event Logs

**Current (contract state):**
```solidity
function getEntriesByTimeRange(...) {
    // O(n) scan of all entries
    // Cost: 100M+ gas for 1M entries
}
```

**With event logs:**
```
// No on-chain query!
// Instead, use off-chain indexer:
// 1. The Graph Protocol indexes events
// 2. Query via GraphQL
// 3. Return results in <100ms
// 4. Cost: $0/month (The Graph is free tier or paid indexing)
```

**Recommended indexing service:**
- **The Graph:** https://thegraph.com (decentralized, GraphQL)
- **Covalent:** https://covalent.api.com (centralized, REST API)
- **Alchemy:** https://www.alchemy.com/supernode (centralized, REST API)

---

## Part 4: Advanced Options (v2.0+)

### 4.1 Merkle Tree Rollup (Maximum Cost Reduction)

**Idea:** Batch 4000+ entries into single Merkle root on-chain

```
10,000 entries/day ÷ 4000 = 2.5 rollups/day
Cost: 2.5 × $0.004 = $0.01/day = $0.30/month
Savings: 99.98% cost reduction!
```

**But:**
- Requires off-chain storage (IPFS, S3, Arweave)
- Requires Merkle proof verification service
- Complex to implement
- Better for year 2.0+

### 4.2 Hedera File Service

**Alternative to smart contracts:**

```
Hedera File Service pricing:
- Upload: $0.001-0.005 per KB
- Storage: ~$0.0001 per MB/month

For 10k entries/day × 1 KB:
- Daily cost: $0.005-0.05
- Monthly: $0.15-1.50

Same cost as recordEntry, but:
✓ Better for large payloads
✓ Native Hedera service
✗ Harder to query
✗ Not EVM-compatible for other chains
```

### 4.3 Layer 2 Rollup (Compress Multiple Chains)

**Not applicable for MVP** (single chain per deployment)

---

## Part 5: Recommendations by Timeline

### MVP (Current)
- ✅ Keep current implementation
- Cost: $1,200-1,500/month
- Storage: 300 MB/month
- Focus: Auditability over cost

### v1.1 (Near-term: 2-4 weeks)
- ✅ **Implement batch saving** (90% cost reduction)
  - Time estimate: 1-2 days
  - Lines changed: ~50 lines in store.ts + ~30 lines in Audit.sol
  - New cost: $120-150/month
  - Risk: Low (backward compatible)

- ✅ **Switch to event-only model** (85% storage reduction)
  - Time estimate: 3-5 days
  - Lines changed: ~100 lines in Audit.sol
  - Query service: The Graph (free tier available)
  - Risk: Medium (need indexing service integration)

**v1.1 Final Numbers:**
- Cost: $120-150/month (90% reduction from MVP)
- Storage: 45 MB/month (85% reduction from MVP)
- Latency: <5 seconds P95 (acceptable for audit)

### v2.0 (Long-term: 3-6 months)
- 🔄 Consider Merkle tree rollup (if volume justifies)
- 🔄 Add pruning/archival (30-day retention on-chain, archive older entries)
- 🔄 Multi-chain deployment with consolidated audit log

### Production (Phase 4+)
- Add rate limiting at reverse proxy
- Implement storage pruning (quarterly archive to cold storage)
- Monitor actual Hedera storage costs (not yet published)

---

## Appendix: Implementation Checklist for v1.1

### Phase 1: Batch Saving (Priority: HIGH)

**Files to change:**
1. ✅ `src/audit/store.ts` — Update flush logic
2. ✅ `contracts/Audit.sol` — Add recordBatch() function
3. ✅ `src/audit/contract.ts` — New logAuditBatch() method
4. ✅ `tests/audit/test_batching.ts` — Unit tests for batch logic

**Steps:**
```typescript
// 1. Update AuditQueue.flush() to batch by 10
// 2. Create ContractWriter.logAuditBatch(entries: AuditEntry[])
// 3. Call new Audit.recordBatch() function
// 4. Test with 100+ simultaneous requests
// 5. Measure latency (should still be <5s)
```

### Phase 2: Event-Only Model (Priority: MEDIUM)

**Files to change:**
1. ✅ `contracts/Audit.sol` — Remove full payload storage
2. ✅ `src/api/handlers/admin.ts` — Query via indexing service
3. ✅ `.env.hedera` — Add THE_GRAPH_API_KEY
4. ✅ `tests/api/test_audit_query_indexer.ts` — Query via indexer

**Steps:**
```typescript
// 1. Refactor Audit.sol to emit events instead of storing payloads
// 2. Set up The Graph subgraph for Zuul Audit contract
// 3. Update admin audit query to fetch from Graph API
// 4. Remove admin.ts direct contract queries
// 5. Test decryption still works (payload in event)
```

---

## Cost Comparison Table (All Scenarios)

| Scenario | Setup Cost | Monthly Recurring | Annual | Complexity |
|----------|-----------|------------------|--------|------------|
| **MVP (current)** | $0 | $1,200-1,500 | $14,400-18,000 | Low |
| **MVP + Batching (v1.1)** | $0 | $120-150 | $1,440-1,800 | Low |
| **MVP + Batching + Events (v1.1)** | $100 (Graph setup) | $120-150 | $1,540-1,900 | Medium |
| **Merkle Rollup (v2.0)** | $1,000 (dev) | $5-10 | $60-120 | High |
| **Off-chain Archive (v2.0)** | $500 (dev) | $50-100 | $600-1,200 | Medium |

---

## Decision Matrix

**Choose batching if:** You want 90% cost reduction with minimal effort
**Choose events if:** You have >100k entries/month and need fast queries
**Choose Merkle if:** Cost is critical and you have engineering budget for v2.0
**Choose archival if:** You need all historical data but rarely query old entries

---

**Last Updated:** February 20, 2026
**Recommendation:** Implement v1.1 (batching + events) before mainnet deployment
