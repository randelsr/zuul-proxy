# Zuul Proxy: Implementation Recommendations

**Date:** 2026-02-18
**Status:** Decision Complete
**Prepared for:** ETHDenver 2026 Hackathon MVP

---

## TL;DR - Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Smart Contracts** | Hardhat + TypeScript | TypeScript-first requirement, Ignition for multi-chain deployment safety |
| **EVM Client** | viem | `recoverMessageAddress` API perfect for agent signing, 35KB bundle vs 130KB |
| **Contract Testing** | TypeScript + Foundry plugin | Fast feedback loop with both TS integration tests and Solidity unit tests |
| **ABI Generation** | TypeChain → viem types | Type-safe contract interaction, auto-generated from compile |
| **Wallet Abstraction** | Custom thin adapter over viem | All wallets (Coinbase, MetaMask, WalletConnect, ECDSA) produce same (message, signature, address) tuple |
| **Multi-Chain** | Same contract, config-driven | Hedera, Base, Arbitrum, Optimism all use identical Solidity + Hardhat Ignition parameters |

---

## Why This Stack Beats Alternatives

### Smart Contracts: Hardhat over Foundry

**The tradeoff:**
- Foundry: Faster builds (2-5×), Solidity-only
- Hardhat: TypeScript integration, safer deployments

**Why Hardhat wins for Zuul:**
1. Project mandates strict TypeScript (architecture.md requirement)
2. Hardhat Ignition's **declarative** deployment model is safer than Foundry's procedural scripts for multi-chain rollouts
3. TypeChain generates type-safe contract bindings (viem-compatible)
4. Hybrid: Use Foundry plugin for Solidity test speed without leaving Hardhat ecosystem

**One-line**: "Kong uses shell scripts. We use TypeScript with safety rails."

### EVM Client: viem over ethers.js v6

**The numbers:**
- viem: 35 KB bundle, tree-shakeable, explicit APIs
- ethers.js v6: 130 KB bundle, implicit abstractions, still excellent but larger

**Why viem wins for Zuul:**
1. Signature recovery API (`recoverMessageAddress`) is built for agent signing flows
2. 4× smaller bundle (matters if agents run SDK locally)
3. SmartAccountClient for Coinbase Agentic Wallet integration
4. TypeScript strict mode fully supported

**One-line**: "Agents signing requests. viem's `recoverMessageAddress` is purpose-built."

### Wallet Abstraction: Unified over Per-Wallet Drivers

**The insight:**
All wallets (Coinbase, MetaMask, WalletConnect, raw ECDSA) produce:
- `message`: request payload (string)
- `signature`: cryptographic proof (0x...)
- `signer`: recovered address (0x...)

**Why unified abstraction works:**
```typescript
// This works for ALL wallet types:
const signer = await recoverMessageAddress({
  message: request.payload,
  signature: request.signature,
})

// Proxy doesn't care which wallet signed.
// Recovery is deterministic.
```

**One-line**: "Wallet differences exist at signing time. Recovery is universal."

---

## Multi-Chain Strategy: Deploy Once, Govern Everywhere

### The Pattern

**Contract source (identical across chains):**
```solidity
pragma solidity 0.8.20;
contract RBACPermissions {
  // ... same code for Hedera, Base, Arbitrum, Optimism
}
```

**Deployment via Hardhat Ignition (network-specific parameters):**
```bash
# Hedera testnet
npx hardhat ignition deploy ignition/modules/RBAC.ts \
  --network hedera \
  --parameters ignition/parameters/hedera.json

# Base testnet (same contract, different network)
npx hardhat ignition deploy ignition/modules/RBAC.ts \
  --network base \
  --parameters ignition/parameters/base.json
```

**Result:**
- Same contract bytecode deploys to 4 chains
- Different addresses per chain (tracked in Ignition)
- Signature recovery is identical (ECDSA standard)

**Why this matters:**
- Zero contract maintenance across chains
- Security is constant (same code reviewed once)
- Governance is unified (same permissions model everywhere)

---

## Architecture: Wallet Driver Pattern

### Zuul's Wallet Abstraction (Thin Layer)

```typescript
// src/wallet/driver.ts
import { recoverMessageAddress, type Address } from 'viem'

export interface SignedRequest {
  payload: string
  signature: string
  timestamp: number
  nonce: string
}

export interface WalletDriver {
  recoverSigner(request: SignedRequest): Promise<Address>
}

// Single implementation (works for all wallet types)
export class UnifiedWalletDriver implements WalletDriver {
  async recoverSigner(request: SignedRequest): Promise<Address> {
    // All wallets produce same output: signer address
    return recoverMessageAddress({
      message: request.payload,
      signature: request.signature,
    })
  }
}
```

### Supported Wallet Types

| Wallet Type | Agent Setup | Signature Format | Proxy Recovery | Notes |
|-------------|-------------|------------------|----------------|-------|
| **Coinbase Agentic Wallet** | Agent registers with Coinbase | EIP-191 signed message | viem's `recoverMessageAddress` | Native support via ERC-4337 |
| **MetaMask** | Agent adds MetaMask extension | EIP-191 signed message | viem's `recoverMessageAddress` | Standard wallet integration |
| **WalletConnect** | Agent scans QR, signs on mobile | EIP-191 signed message | viem's `recoverMessageAddress` | Cross-platform via relay |
| **Raw ECDSA** | Agent holds private key | EIP-191 signed message | viem's `recoverMessageAddress` | Self-custody agents |
| **Hardware (Ledger/Trezor)** | Agent adds hardware wallet | EIP-191 signed message | viem's `recoverMessageAddress` | Via hardware provider |

**Key point:** Proxy doesn't need different code per wallet type. Recovery is universal.

---

## Implementation Phases (4-Day Hackathon)

### Phase 1: Auth (Days 1-2)
- Hardhat project with TypeScript template
- viem wallet driver + signature recovery middleware
- Unit tests for recovery scenarios
- Est. **16 hours** → **Complete by Day 2 EOD**

### Phase 2: RBAC Contract (Days 2-3)
- RBACPermissions.sol contract
- Hardhat Ignition deployment module
- TypeChain type generation (automatic)
- Local Hardhat network testing
- Est. **12 hours** → **Complete by Day 3 EOD**

### Phase 3: Audit & Logging (Day 3)
- AuditLog.sol contract
- Chain driver abstraction (Hedera implementation first)
- Integration tests: sign → verify → check RBAC → log
- Est. **8 hours** → **Complete by Day 3 EOD**

### Phase 4: Multi-Chain & Demo (Day 4)
- Deploy to Hedera testnet
- Deploy to Base testnet (validate same contract works)
- Live demo: agent request → proxy auth → RBAC → audit
- Polish & presentation
- Est. **16 hours** → **Complete by Day 4 EOD**

**Total:** 52 hours of focused work (4-person team with 3 days parallel work = achievable)

---

## Key Decisions Explained

### Decision 1: Hardhat over Foundry

**Context:** Project requires TypeScript-first stack + multi-chain safety.

**Options:**
1. **Hardhat** - JS/TS-native, Ignition for deployments, TypeChain for types
2. **Foundry** - Rust-fast, Solidity-only, no TypeScript
3. **Hybrid** - Hardhat + Foundry plugin (best of both)

**Chosen:** Hardhat with Foundry plugin for tests

**Rationale:**
- TypeScript requirement non-negotiable (per architecture.md)
- Ignition's declarative model safer for multi-chain than Foundry scripts
- TypeChain integrates seamlessly for type-safe contracts
- Foundry plugin lets us leverage test speed without leaving TypeScript ecosystem

**Risk:** Hybrid adds tooling complexity. Mitigation: Document setup; use Foundry tests only for critical path.

---

### Decision 2: viem over ethers.js v6

**Context:** Proxy needs signature recovery as primary use case.

**Options:**
1. **viem** - Newer, lighter (35KB), explicit APIs, SmartAccountClient
2. **ethers.js v6** - Mature (130KB), implicit abstractions, larger community

**Chosen:** viem

**Rationale:**
- `recoverMessageAddress` API is purpose-built for agent signing flows
- 4× smaller bundle (matters if agents run SDK locally)
- SmartAccountClient for Coinbase Agentic Wallet integration
- Better TypeScript typing aligns with project standards
- Growing community; Paradigm backing ensures stability

**Risk:** Smaller community than ethers.js v6. Mitigation: Core functionality stable; signature recovery is well-tested; monitor GitHub issues.

---

### Decision 3: Unified Wallet Abstraction (not per-wallet drivers)

**Context:** Project supports multiple wallet types (Coinbase, MetaMask, WalletConnect, ECDSA).

**Options:**
1. **Separate drivers** - CoinbaseDriver, MetaMaskDriver, etc. (4+ implementations)
2. **Unified abstraction** - Single `recoverMessageAddress` call (1 implementation)

**Chosen:** Unified

**Rationale:**
- All wallets produce same output: (message, signature, signer)
- Recovery is deterministic (math, not wallet-specific)
- Proxy doesn't care which wallet signed
- Wallet choice matters at agent setup time, not proxy time

**One implementation:** `recoverMessageAddress(message, signature) → signer_address`

**Risk:** If wallet produces non-standard signature format, recovery fails. Mitigation: Test with Coinbase Agentic Wallet (Feb 2026 launch) to verify EIP-191 compatibility.

---

### Decision 4: Same Contract, Config-Driven Multi-Chain

**Context:** Deploy identical RBAC contract to Hedera, Base, Arbitrum, Optimism.

**Options:**
1. **One contract per chain** - 4 separate deployments, harder maintenance
2. **Same contract, different addresses** - Hardhat Ignition + network parameters
3. **Single cross-chain contract** - Not applicable (each chain is independent)

**Chosen:** Option 2 (same contract, config-driven)

**Rationale:**
- Single contract source reviewed once, reduces security risk
- Hardhat Ignition handles multi-chain elegantly
- Network-specific parameters file per chain (clean separation)
- ECDSA signature recovery identical across EVM chains

**Hedera JSON-RPC Relay:** Hedera supports full JSON-RPC (HIP-482), no special handling needed.

**Risk:** Contract addresses differ per chain. Mitigation: Store addresses in config; document mapping.

---

## Ecosystem Maturity Assessment

| Library | Maturity | Status | Zuul Risk |
|---------|----------|--------|-----------|
| **viem** | Growing (Paradigm backing) | ✅ Production-ready for core features | Low (signature recovery is stable) |
| **Hardhat** | Mature | ✅ Industry standard | None (widely adopted) |
| **Hardhat Ignition** | Recent, solid | ✅ Safe for multi-chain | Low (declarative design is conservative) |
| **TypeChain** | Stable for 3+ years | ✅ No issues expected | None (mature tooling) |
| **Foundry** | Mature (Paradigm) | ✅ Excellent for Solidity | None (only used for tests) |
| **Coinbase Agentic Wallet** | Beta (Feb 2026) | ⚠️ New | Medium (monitor for breaking changes) |
| **Hedera JSON-RPC Relay** | Stable (HIP-482) | ✅ Fully supported | None (standard EVM API) |

**Overall Risk:** LOW. Core stack (Hardhat, viem, TypeChain) is mature. Coinbase Agentic Wallet is newest piece; test early.

---

## Package.json Dependencies (Minimal)

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

**Not included:**
- ❌ ethers.js (using viem instead)
- ❌ web3.js (using viem instead)

---

## Gotchas & Mitigation

| Gotcha | Impact | Mitigation |
|--------|--------|-----------|
| **viem's SmartAccountClient learning curve** | New pattern if team unfamiliar | Start with basic account pattern; upgrade later. Docs available. |
| **TypeChain first run requires `hardhat clean`** | Setup confusion | Document in README; add to CI/CD checklist. |
| **Hedera chain ID is 295** | Tools assume mainnet=1 | Explicit config in Hardhat + viem. Test both testnet + mainnet setup. |
| **Foundry hybrid adds tooling complexity** | Maintenance burden | Use Foundry tests only for critical path (contract logic). Keep TypeScript tests in Hardhat. |
| **ERC-6492 support not built-in** | Coinbase Agentic Wallet might use ERC-6492 | Use Ambire's signature-validator library if needed; test early with Coinbase. |
| **Message hashing standards** | Different wallets might hash differently | Enforce EIP-191 standard; test with each wallet type (Coinbase, MetaMask, etc.). |
| **Contract addresses per chain** | Deployment tracking | Store in config.yaml or env vars; document mapping. |

---

## Quick Start Script

```bash
# 1. Initialize Hardhat with TypeScript
npx hardhat init --typescript

# 2. Install dependencies
pnpm install viem hardhat @nomicfoundation/hardhat-foundry @typechain/hardhat typechain typescript vitest pino

# 3. Create contract
mkdir contracts
echo "pragma solidity 0.8.20; contract RBACPermissions { ... }" > contracts/RBACPermissions.sol

# 4. Compile (generates TypeChain types automatically)
npx hardhat compile
# Output: typechain/RBACPermissions.ts (viem-compatible)

# 5. Create Hardhat Ignition module
mkdir -p ignition/modules ignition/parameters
echo "export default buildModule(...)" > ignition/modules/RBAC.ts

# 6. Deploy to Hedera testnet
npx hardhat ignition deploy ignition/modules/RBAC.ts \
  --network hedera \
  --parameters ignition/parameters/hedera.json

# 7. Use in proxy (TypeScript)
import { RBACPermissions } from '../typechain' // viem-compatible types
import { recoverMessageAddress } from 'viem'

const signer = await recoverMessageAddress({ message, signature })
const hasPermission = await rbacContract.read.hasPermission([signer, tool, action])
```

---

## Success Criteria (MVP Definition)

- [ ] Hardhat project compiles cleanly (zero TypeScript errors)
- [ ] Agent signs request → Proxy recovers signer via viem
- [ ] RBACPermissions contract deployed to Hardhat local network
- [ ] Permission check works: agent with permission → approved, denied → rejected
- [ ] Audit contract logs access to blockchain
- [ ] Deploy same contract to Hedera testnet + Base testnet
- [ ] Live demo: agent request flow end-to-end
- [ ] Documentation: setup guide + architecture decisions

---

## Timeline (Committed)

| Phase | Days | Deliverable |
|-------|------|-------------|
| Setup + Auth | 1-2 | Hardhat project, viem signature recovery, auth middleware |
| RBAC Contract | 2-3 | RBACPermissions.sol, Ignition deployment, TypeChain types |
| Audit Logging | 3 | AuditLog.sol, chain driver abstraction, integration tests |
| Multi-Chain + Demo | 4 | Hedera + Base deployments, live demo, presentation |

**Completion Target:** ETHDenver 2026 (Feb 23)

---

## Resources

**Official Documentation:**
- [Hardhat Docs](https://hardhat.org)
- [viem Docs](https://viem.sh)
- [Hardhat Ignition](https://hardhat.org/ignition)
- [TypeChain](https://github.com/dethcrypto/TypeChain)
- [Hedera JSON-RPC Relay](https://docs.hedera.com/hedera/core-concepts/smart-contracts/understanding-hederas-evm-differences-and-compatibility/for-evm-developers-migrating-to-hedera/json-rpc-relay-and-evm-tooling)

**Community:**
- viem Discord: https://discord.gg/m87FQqk5fE
- Hardhat Discord: https://hardhat.org/discord
- Hedera Dev: https://discord.gg/hedera

---

**Status:** ✅ Ready for Implementation

**Next Step:** Begin Phase 1 (Day 1 morning)
