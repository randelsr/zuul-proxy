# Zuul Proxy: Smart Contract & EVM Tooling - Executive Summary

**Research Conducted:** 2026-02-18
**Scope:** Multi-chain deployment (Hedera, Base, Arbitrum, Optimism) + modular wallet abstraction
**Audience:** Technical decision-makers for ETHDenver 2026 hackathon

---

## The Recommendation (One Slide)

```
SMART CONTRACTS:  Hardhat + TypeScript
EVM CLIENT:       viem (for signature recovery)
WALLETS:          Unified abstraction (all wallets use same recovery API)
MULTI-CHAIN:      Same contract, config-driven deployment
```

**Why:** TypeScript-first requirement + elegant multi-chain support + perfect API fit for agent signing

---

## Problem Statement

Zuul's architecture requires:

1. **High-volume agent signing:** Every request signed by agent wallet → recovered by proxy
2. **Multi-chain support:** Identical contracts on Hedera, Base, Arbitrum, Optimism
3. **Type safety:** Strict TypeScript per project standards
4. **Wallet agnosticism:** Support Coinbase, MetaMask, WalletConnect, raw ECDSA without different code paths
5. **Safety-first deployments:** Reproducible, auditable multi-chain rollouts

**Challenge:** Finding the right balance between developer productivity (TypeScript) and performance (multi-chain, high-volume signing).

---

## The Comparison (Side-by-Side)

### Smart Contract Frameworks

| | Hardhat | Foundry |
|---|---------|---------|
| **Best for** | Teams needing TypeScript + multi-chain safety | Teams doing pure Solidity optimization |
| **Speed** | Moderate (JS-based) | 2-5× faster (Rust-based) |
| **TypeScript** | Native ✅ | Not supported ❌ |
| **Deployments** | Ignition (safe, declarative) | Scripts (fast, manual) |
| **Contract Types** | TypeChain (auto-generated TS types) | cast bind (Rust only) |
| **Zuul Fit** | ✅ Perfect | ⚠️ Needs hybrid approach |

**Winner: Hardhat** (TypeScript requirement non-negotiable)

### EVM Client Libraries

| | viem | ethers.js v6 |
|---|------|--------------|
| **Bundle Size** | 35 KB | 130 KB |
| **Signature Recovery** | `recoverMessageAddress()` (explicit) | `verifyMessage()` (implicit) |
| **TypeScript** | Excellent | Strong |
| **Account Abstraction** | SmartAccountClient (first-class) | Custom Signer (manual) |
| **Community** | Growing (Paradigm) | Mature (10+ years) |
| **Zuul Fit** | ✅ Perfect | ⚠️ Heavier, less ergonomic |

**Winner: viem** (signature recovery API purpose-built for agent signing)

### Wallet Abstraction Approaches

| | Per-Wallet Drivers | Unified Abstraction |
|---|-------------------|-------------------|
| **Code** | 4+ implementations (Coinbase, MetaMask, WalletConnect, ECDSA) | 1 implementation |
| **Maintenance** | High (each wallet has quirks) | Low (ECDSA is standard) |
| **Extensibility** | Easy to add new wallet | Just works for new wallets |
| **Zuul Fit** | ❌ Unnecessary complexity | ✅ Perfect |

**Winner: Unified** (all wallets produce same message+signature+address tuple)

---

## Key Insight: Wallet Recovery is Universal

```typescript
// This works for ALL wallet types:
const signer = await recoverMessageAddress({
  message: request.payload,
  signature: request.signature,  // Works whether signed by Coinbase, MetaMask, ECDSA, etc.
})

// Proxy doesn't care which wallet signed.
// Signature recovery is pure math (secp256k1), not wallet-specific.
```

**Implication:** Zuul needs exactly ONE wallet driver implementation that works for all wallet types.

---

## Multi-Chain Strategy: Write Once, Deploy Everywhere

### The Pattern

```solidity
// contracts/RBACPermissions.sol
// SAME SOURCE CODE for Hedera, Base, Arbitrum, Optimism
pragma solidity 0.8.20;
contract RBACPermissions { ... }
```

```bash
# Deploy to Hedera
npx hardhat ignition deploy ... --network hedera

# Deploy to Base
npx hardhat ignition deploy ... --network base

# Deploy to Arbitrum
npx hardhat ignition deploy ... --network arbitrum

# Deploy to Optimism
npx hardhat ignition deploy ... --network optimism
```

**Result:** Same bytecode, different addresses, one review, universal governance.

**Why this works:**
- All 4 chains support EVM (identical bytecode semantics)
- Hedera's JSON-RPC Relay means no special handling
- Signature recovery (secp256k1 ECDSA) is identical across all EVM chains
- Hardhat Ignition tracks deployments per chain

---

## Bundle Size Matters (Or Does It?)

**viem:** 35 KB (minified + gzipped)
**ethers.js v6:** 130 KB

**For Zuul Proxy:**
- Server-side code → bundle size less critical than for client libraries
- BUT: If future plan includes agent-side SDK, 4× difference matters
- Recommendation: Use viem now, pay 35 KB instead of 130 KB

---

## Ecosystem Maturity: Risk Assessment

| Component | Maturity | Risk to Zuul |
|-----------|----------|--------------|
| **Hardhat** | Mature (industry standard) | None |
| **viem** | Growing (Paradigm backing) | Low (core features stable) |
| **Hardhat Ignition** | Solid (declarative design) | Low (conservative approach) |
| **TypeChain** | Stable 3+ years | None |
| **Foundry** | Mature | None (used for tests only) |
| **Coinbase Agentic Wallet** | Beta (Feb 2026) | Medium (monitor for changes) |

**Overall:** LOW RISK. Proceed with confidence.

---

## Timeline: Can This Happen in 4 Days?

### Breakdown

| Phase | Days | Effort | Deliverable |
|-------|------|--------|-------------|
| **Setup + Auth** | 1-2 | 16 hours | Hardhat project, viem signature recovery middleware, unit tests |
| **RBAC Contract** | 2-3 | 12 hours | RBACPermissions.sol, Hardhat Ignition module, TypeChain types |
| **Audit Logging** | 3 | 8 hours | AuditLog.sol, chain driver, integration tests |
| **Multi-Chain + Demo** | 4 | 16 hours | Hedera + Base deployments, live demo, presentation |

**Total:** 52 hours (3-4 person team, parallel work) = **Achievable in 4 days**

---

## Implementation Blueprint

```
Day 1 (Setup + Auth)
├── Hardhat project with TypeScript template
├── viem integration + recoverMessageAddress tests
├── Auth middleware (signature verification, nonce, timestamp)
└── Unit tests passing ✅

Day 2 (RBAC Contract)
├── RBACPermissions.sol contract
├── Hardhat Ignition deployment module
├── TypeChain type generation (automatic)
├── Integration tests on Hardhat local network
└── Contract deployed locally ✅

Day 3 (Audit + Polish)
├── AuditLog.sol contract
├── Chain driver abstraction
├── End-to-end integration tests
├── Deploy to Hedera testnet
├── Deploy to Base testnet (validate same contract)
└── All deployments verified ✅

Day 4 (Demo + Presentation)
├── Live demo: agent request → proxy auth → RBAC → audit log
├── Documentation + walkthrough
├── Presentation prep
└── Ready for judging ✅
```

---

## The Stack (Technical Spec)

```json
{
  "dependencies": {
    "viem": "^2.0.0",
    "pino": "^8.0.0"
  },
  "devDependencies": {
    "hardhat": "^2.20.0",
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@nomicfoundation/hardhat-foundry": "^1.0.0",
    "@typechain/hardhat": "^9.0.0",
    "typechain": "^8.3.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Total size:** ~250 MB (node_modules after pnpm install)

---

## Mitigation Strategies (Risks)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **viem smaller community** | Medium | Medium | Core features stable; signature recovery well-tested; Paradigm backing |
| **Hybrid Hardhat+Foundry complexity** | Low | Low | Use Foundry only for critical tests; keep TypeScript tests in Hardhat |
| **Coinbase Agentic Wallet breaking changes** | Medium | Medium | Test early with Coinbase (Feb 2026 beta); monitor GitHub releases |
| **Hedera JSON-RPC quirks** | Low | Low | Full EVM compatibility via HIP-482; no special code needed |
| **Multi-chain deployment errors** | Low | High | Test deployments on local first, then testnet; Ignition auto-recovers |

**Mitigation strategy:** Test early with Coinbase; deploy to Hedera testnet first (lowest risk), then Base.

---

## Decision Records (Why These Choices)

### Decision 1: Hardhat over Foundry

**Context:** TypeScript-first architecture
**Options Considered:** Hardhat, Foundry, Hybrid
**Chosen:** Hardhat (+ Foundry plugin for tests)
**Rationale:** Ignition deployment system safer than scripts; TypeChain gives type safety; hybrid approach leverages test speed
**Trade-off:** Slight tooling complexity worth it for safety + TS integration

### Decision 2: viem over ethers.js v6

**Context:** Signature recovery as primary use case
**Options Considered:** viem, ethers.js v6, ethers.js v5
**Chosen:** viem
**Rationale:** `recoverMessageAddress` API perfect for agent signing; 4× smaller bundle; SmartAccountClient for future AA support
**Trade-off:** Smaller community than ethers.js v6, but core features stable

### Decision 3: Unified Wallet Abstraction

**Context:** Support multiple wallet types without coupling
**Options Considered:** Per-wallet drivers, unified abstraction
**Chosen:** Unified
**Rationale:** All wallets produce same (message, signature, address) tuple; recovery is deterministic; viem's `recoverMessageAddress` unifies all
**Trade-off:** No per-wallet customization needed (wallets already standardized)

### Decision 4: Same Contract, Multi-Chain Config

**Context:** Deploy to Hedera, Base, Arbitrum, Optimism
**Options Considered:** One contract per chain, same contract with different deployments, cross-chain contracts
**Chosen:** Same contract with Ignition parameters per chain
**Rationale:** Single code review; Ignition handles multi-chain elegantly; EVM compatibility identical across chains
**Trade-off:** Contract addresses differ per chain (managed via config)

---

## Success Definition (MVP)

- [ ] Agent signs request (any wallet type)
- [ ] Proxy recovers signer via viem (1 millisecond latency)
- [ ] RBAC contract checks permissions (on-chain)
- [ ] Audit contract logs access (encrypted payload, public timestamp)
- [ ] Same contract deployed to Hedera + Base + Arbitrum + Optimism
- [ ] Live demo works end-to-end
- [ ] Zero TypeScript errors
- [ ] Documentation complete

---

## Next Steps

1. **Approval:** Confirm this stack with team
2. **Setup:** Initialize Hardhat project with TypeScript template (30 minutes)
3. **Phase 1:** Signature recovery middleware + tests (Day 1)
4. **Phase 2:** RBAC contract + Ignition (Day 2)
5. **Phase 3:** Audit logging + integration (Day 3)
6. **Phase 4:** Multi-chain deployments + demo (Day 4)

---

## FAQs

**Q: Why not use Foundry exclusively?**
A: Foundry is Solidity-only. Project requires TypeScript-first stack. Hybrid approach (Hardhat + Foundry plugin for tests) gets best of both worlds.

**Q: Why not use ethers.js v6 (more mature)?**
A: viem's `recoverMessageAddress` API is purpose-built for signature recovery (Zuul's use case). ethers.js's `verifyMessage` requires pre-hashing. 4× smaller bundle also matters if agents run SDK. Risk is low (Paradigm backing, stable core).

**Q: What if Coinbase Agentic Wallet doesn't work?**
A: Wallet must support EIP-191 message signing (standard). viem's recovery works with any EIP-191-compatible signature. Test early with Coinbase beta; fallback to MetaMask if needed.

**Q: Why same contract for all 4 chains?**
A: Different chains = different deployments (different addresses), but same bytecode. This way: single security review, zero maintenance divergence, identical permissions model everywhere. EVM compatibility is standardized.

**Q: Can we migrate to Foundry later?**
A: Yes. Foundry and Hardhat both support Solidity 0.8.20. Contracts are portable. TypeScript tests can stay in Hardhat; only Solidity tests would move to Foundry.

**Q: What about network latency across chains?**
A: RPC latency is per-chain, not affected by Hardhat vs Foundry choice. All EVM chains expose JSON-RPC, so latency is similar (30-100ms typically). Proxy-side signature recovery adds ~1ms (negligible).

---

## Confidence Level

**Overall Confidence: HIGH (90%)**

- Smart contracts: Very confident (Hardhat is industry standard)
- EVM client: Very confident (viem's signature recovery is purpose-built)
- Wallet abstraction: Very confident (ECDSA is standardized)
- Multi-chain: Very confident (all 4 chains are EVM-compatible)
- Delivery: Confident (timeline achievable with 3-4 person team)

**Biggest Risk:** Coinbase Agentic Wallet beta stability. Mitigation: Test early; monitor releases.

---

## Resources

**Setup Guides:**
- [Hardhat Getting Started](https://hardhat.org/getting-started)
- [viem Installation](https://viem.sh/docs/getting-started)
- [Hardhat Ignition Tutorial](https://hardhat.org/ignition)

**Detailed Research:**
See `.plans/research-smart-contracts-evm-tooling.md` for comprehensive analysis.

**Implementation Guide:**
See `.plans/implementation-recommendations.md` for step-by-step guide.

---

**Status:** READY TO IMPLEMENT ✅

**Date Prepared:** 2026-02-18
**Prepared By:** Claude Code Analysis
**Review Status:** Pending team approval
