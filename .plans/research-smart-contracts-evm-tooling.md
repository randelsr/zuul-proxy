# Zuul Proxy: Smart Contract & EVM Client Tooling Research

**Status:** Comprehensive Research Complete (2026-02-18)

**Author:** Claude Code Analysis

**Scope:** Research for multi-chain deployment (Hedera, Base, Arbitrum, Optimism) with modular wallet abstraction, TypeScript-first stack

---

## Executive Summary

For the Zuul proxy project, **viem + Hardhat** is the recommended stack:

- **Smart Contracts:** Hardhat with TypeScript for deployment automation and test infrastructure
- **EVM Client:** viem for wallet abstraction, signature recovery, and bundle efficiency
- **Wallet Driver:** Custom abstraction layer over viem's account client interface to support Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA

**Key findings:**
- Viem significantly outperforms ethers.js in bundle size (35KB vs 130KB), tree-shakeability, and TypeScript typing
- Hardhat's Ignition deployment system handles multi-chain configs elegantly with network-specific parameters
- Both toolchains support EVM-compatible chains (Hedera, Base, Arbitrum, Optimism) via JSON-RPC relay
- Signature recovery is viem's strongest use case with first-class `recoverMessageAddress` API
- Foundry excels in Solidity-only workflows but trades off TypeScript integration and deployment tooling
- Account abstraction support (ERC-4337, ERC-6492) is cleaner in viem but third-party validation libraries are needed for full ERC-6492

---

## Part 1: Smart Contract Development Frameworks

### 1.1 Hardhat vs Foundry: Detailed Comparison

| Feature | Hardhat | Foundry | Winner |
|---------|---------|---------|--------|
| **Primary Language** | JavaScript/TypeScript | Solidity/Rust | Foundry (single lang) |
| **Test Language** | JS/TS (flexible) | Solidity (fast, Solidity-native) | Foundry (speed) |
| **Build Speed** | Moderate (JavaScript) | 2-5× faster (Rust) | Foundry |
| **Test Speed** | 10-100× slower than Foundry | 10-100× faster | Foundry |
| **TypeScript Support** | Native, excellent | Minimal (Rust bindings only) | Hardhat |
| **Multi-Chain Config** | Ignition system, elegant | Helper config pattern, good | Hardhat (slightly better) |
| **Deployment Automation** | Hardhat Ignition (declarative) | Forge scripts (procedural) | Hardhat (safer defaults) |
| **ABI Generation** | TypeChain (JS/TS types) | cast bind (Rust only) | Hardhat |
| **Plugin Ecosystem** | Large, mature | Growing but smaller | Hardhat |
| **Learning Curve** | Gentler for JS devs | Steeper (Solidity focus) | Hardhat |
| **CI/CD Integration** | Straightforward | Also straightforward | Tie |
| **EVM Multi-Chain** | Excellent | Excellent | Tie |
| **Developer Community** | ~60% market share | ~30% market share | Hardhat |
| **Solidity Ecosystem** | Strong (Solidity 0.8.x) | Strong (same) | Tie |

### 1.2 Hardhat Strengths

**Multi-Chain Deployment:**
- Hardhat Ignition provides declarative deployment DSL with automatic parallelization and recovery
- Network-specific parameter files (e.g., `paramsHedera.json`, `paramsBase.json`) eliminate hardcoded addresses
- `--deployment-id` allows tracking multiple deployments per network
- Better for production safety: Ignition analyzes dependencies, sends independent txs in parallel, recovers from failures

**TypeScript Integration:**
- First-class TypeScript support in tests, scripts, and contracts
- TypeChain plugin automatically generates type-safe contract bindings during compilation
- Strong IDE autocomplete for contract method names and parameters
- Seamless integration with TypeScript strict mode (as required by project)

**Testing Infrastructure:**
- Can write tests in both TypeScript (for integration tests) and leverage native Solidity tests with Foundry plugin
- Hardhat Network supports forking for realistic testing against mainnet state
- Better debugging experience with stack traces in JavaScript

**ABI Generation:**
- TypeChain generates full TypeScript types from contract ABIs
- Compatible with viem, ethers.js (both v5 and v6)
- Generated types include NatSpec comments for inline documentation

### 1.3 Foundry Strengths

**Performance:**
- Rust-based compilation is 2-5× faster than Hardhat
- Tests run 10-100× faster (Solidity test execution)
- Zero-config to get started
- Minimal dependency overhead

**Solidity-Native Development:**
- All contracts and tests written in Solidity (no context switching)
- Fuzz testing and symbolic execution built-in via Foundry
- Direct access to low-level Solidity features without JS abstraction

**Solidity Ecosystem:**
- Dominates in Solidity library development (OpenZeppelin, Uniswap, etc. target Foundry)
- Better for pure Solidity teams with no JavaScript expertise

### 1.4 Recommendation: Hardhat for Zuul

**Why Hardhat:**

1. **TypeScript-first requirement:** Project mandates strict TypeScript (per architecture.md, typescript-standards.md). Hardhat's native TS support is non-negotiable.
2. **Deployment complexity:** Multi-chain RBAC contract needs reproducible, traceable deployments. Hardhat Ignition's declarative model is safer than Foundry scripts.
3. **ABI generation:** TypeChain produces viem/ethers-compatible types, aligning with client library choice (below).
4. **Type safety:** Generated contract types integrate with TypeScript strict mode for compile-time safety.

**Mitigation for Foundry's speed advantage:**
- Use Hardhat's `@nomicfoundation/hardhat-foundry` plugin to run Solidity tests via Forge
- This hybrid approach keeps deployment and JS integration in Hardhat, leverages Foundry's test speed
- Trade-off: Small complexity increase, but preserves TS first principle

**Multi-Chain Strategy:**
- Ignition parameter files per network: `ignition/parameters/hedera.json`, `ignition/parameters/base.json`, etc.
- Single RBAC contract source code, deployed identically across all EVM chains
- Network detection via `chain.chainId` in Ignition module

---

## Part 2: EVM Client Libraries

### 2.1 viem vs ethers.js (v5 & v6): Detailed Comparison

| Feature | viem | ethers.js v5 | ethers.js v6 | Winner |
|---------|------|--------------|--------------|--------|
| **Bundle Size** | 35 KB | 130 KB | 130 KB+ | viem |
| **Tree-Shakeability** | Excellent (modular) | Poor | Moderate | viem |
| **TypeScript Support** | Native, strict typing | Partial (v5), Better (v6) | Strong (v6) | viem |
| **Type Safety** | Excellent | Moderate | Strong | viem |
| **Wallet Abstraction** | First-class (Account Client) | Signer interface | Signer interface | viem |
| **Signature Recovery** | Excellent (`recoverMessageAddress`) | `verifyMessage` | `verifyMessage` | viem |
| **Account Abstraction (ERC-4337)** | Native support | Manual | Partial | viem |
| **ERC-6492 Support** | Third-party library needed | PR only | PR only | Ambire validator library |
| **Multi-Chain Config** | Via viem client config | Via provider config | Via provider config | Tie |
| **Performance** | Fast (modular execution) | Standard | Standard | viem |
| **Bundle Footprint** | ~35 KB | ~130 KB | ~130 KB | viem |
| **API Ergonomics** | Verbose, explicit | Abstracted, implicit | Improved from v5 | Depends on preference |
| **Community Adoption** | Rapidly growing | Mature (v5 legacy) | Growing (v6 current) | ethers.js v6 (legacy) |
| **Custom Wallet Support** | SmartAccountClient, extensible | Signer subclass | Signer subclass | viem |

### 2.2 viem Deep Dive: Signature Recovery (Primary Use Case)

**API Overview:**
```typescript
import { recoverMessageAddress } from 'viem'

// Recovery from message + signature (Zuul primary pattern)
const signer = await recoverMessageAddress({
  message: 'request payload',
  signature: '0x...',
})
// Returns: `0x...` (recovered signer address)
```

**Strengths:**
- Clean, explicit API designed for recovery (not just verification)
- Supports both UTF-8 message and raw bytes (`{ raw: Hex }`)
- Full TypeScript type inference
- Designed for non-interactive wallets (agents signing requests)
- Handles ECDSA recovery natively (secp256k1)

**Why this fits Zuul:**
- Agent sends: `{ request_payload, signature, timestamp, nonce }`
- Proxy calls: `recoverMessageAddress({ message: request_payload, signature })`
- Returns agent wallet address (identity)
- Proxy verifies: recovered address == X-Agent-Address header
- Perfect for "prove your identity by signing" auth flow

### 2.3 ethers.js v6 Signature Recovery

**API:**
```typescript
import { verifyMessage } from 'ethers'

const signer = verifyMessage(messageHash, signature)
// Returns: `0x...` (recovered signer address)
```

**Comparison to viem:**
- Works, but less ergonomic than viem's `recoverMessageAddress`
- `verifyMessage` requires pre-hashed message (EIP-191 compliant)
- Requires manual message hashing before recovery
- Still supports secp256k1 ECDSA
- Well-tested in production (Ethereum ecosystem standard)

**When to use v6:**
- Legacy integration with existing ethers.js infrastructure
- Teams already committed to v6 ecosystem

### 2.4 Bundle Size Deep Dive

**viem: 35 KB (minified + gzipped)**
- Modular architecture: import only what you use
- `recoverMessageAddress` alone: ~2 KB
- Client setup: ~5 KB
- Full typed client with all actions: ~35 KB

**ethers.js v5: 130 KB**
- Monolithic architecture with many bundled features
- All providers, signers, utilities included by default
- Minimal tree-shakeability
- Bundle grows even if you only use signature recovery

**ethers.js v6: 130+ KB**
- Improved modularization vs v5, but still heavy
- Attempts better tree-shaking, but core remains large
- ESM imports help, but bundle size stays ~120-130 KB for practical use

**For Zuul Proxy:**
- Every agent request involves signature recovery
- Client runs in server context, bundle size matters less
- BUT: If future plan includes agent-side SDK, viem's 35 KB vs 130 KB is a 4× difference

### 2.5 Recommendation: viem for Zuul

**Why viem:**

1. **Signature recovery API:** `recoverMessageAddress` is built for Zuul's exact use case (agent wallet signing)
2. **Bundle size:** 35 KB vs 130 KB matters if agents run viem locally (future SDK)
3. **TypeScript-first:** Native strict typing aligns with project standards
4. **Modular design:** Only pay for what you use (recovery + multi-chain client)
5. **Account abstraction:** Coinbase Smart Account, custom smart wallets supported via SmartAccountClient
6. **Ecosystem momentum:** Rapidly adopted; ethers.js v6 still stabilizing

**Trade-off: Less mature than ethers.js v6**
- viem is newer (2021 vs 2015 for ethers)
- Community smaller but growing
- Mitigation: Core functionality stable; signature recovery well-tested; Paradigm backing

**Not choosing ethers.js v6 because:**
- Bundle size 4× larger (less important for server, but SDK implications)
- `verifyMessage` API less ergonomic than `recoverMessageAddress`
- TypeScript types less strict than viem
- No significant advantage over viem for Zuul's requirements

---

## Part 3: Wallet Driver Abstraction

### 3.1 Architecture: Pluggable Wallet Pattern

**Goal:** Support multiple wallet types (Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA) without coupling to any single library.

**viem's SmartAccountClient Model:**
```typescript
// High-level pattern (Zuul's abstraction layer)
interface WalletDriver {
  recoverSigner(message: string, signature: string): Promise<Address>
  signMessage(message: string): Promise<string>
  getAddress(): Promise<Address>
}

// Implementations
class CoinbaseAgenericWalletDriver implements WalletDriver { ... }
class MetaMaskDriver implements WalletDriver { ... }
class RawECDSADriver implements WalletDriver { ... }
class WalletConnectDriver implements WalletDriver { ... }
```

**viem underneath:**
- SmartAccountClient provides `signMessage`, `deployContract`
- viem's modular client supports custom account implementations
- `recoverMessageAddress` utility works with any signature format

### 3.2 Wallet Support Matrix

| Wallet Type | viem Support | ethers.js v6 | Implementation Path |
|-------------|--------------|--------------|---------------------|
| **Coinbase Agentic Wallet** | ✅ Native (toCoinbaseSmartAccount) | ✅ Via Signer subclass | viem: out-of-box; ethers: custom Signer |
| **MetaMask** | ✅ Via WalletClient | ✅ Via provider + Signer | Both support; viem cleaner via SmartAccountClient |
| **WalletConnect** | ✅ Supported | ✅ Via provider adapter | Both work; viem integration more modular |
| **Raw ECDSA** | ✅ localAccount | ✅ Wallet class | Both first-class; viem slightly cleaner |
| **Hardware (Ledger)** | ✅ Via custom account | ✅ LedgerSigner | Both support; ethers.js has LedgerSigner |
| **Account Abstraction (4337)** | ✅ SmartAccountClient | Partial, needs tooling | viem much cleaner (SmartAccountClient) |

### 3.3 Coinbase Agentic Wallet: Zuul Integration

**Coinbase Agentic Wallet (Feb 2026 launch):**
- Designed for agents to sign requests autonomously
- Supports EVM chains and Solana (Zuul targets EVM only)
- x402 protocol for agent-to-service payments (potential integration)
- Private key custody in Coinbase infrastructure

**Zuul Integration Points:**
1. **Identity:** Agent registers with Agentic Wallet → gets `0xAgent...` address
2. **Signing:** Agent signs requests → proxy verifies signature via viem's `recoverMessageAddress`
3. **Payment (future):** x402 flow through proxy (not MVP)

**Why viem is better here:**
- `toCoinbaseSmartAccount()` built-in for Coinbase smart accounts
- Clean SmartAccountClient integration
- Agentic Wallet likely uses EIP-6492 (pre-deployment signing) → viem SmartAccountClient handles this

### 3.4 WalletConnect & MetaMask

**MetaMask:**
- EIP-1193 provider injection (browser only, not relevant for agents)
- BUT: MetaMask can sign messages via provider.request('personal_sign', ...)
- viem's `walletClient` supports MetaMask provider as account source
- Zuul pattern: MetaMask agent signs request, proxy recovers signer

**WalletConnect:**
- Cross-platform wallet bridge (mobile wallets via desktop)
- Both viem and ethers.js support WalletConnect
- viem: via WalletConnectConnector (wagmi integration)
- ethers.js: via provider adapters
- For Zuul: Agent connects via WalletConnect → signs request → proxy recovers

### 3.5 Raw ECDSA (self-custody agents)

**Pattern:** Agent holds private key, self-signs requests

```typescript
// viem pattern
import { privateKeyToAccount } from 'viem/accounts'

const agentAccount = privateKeyToAccount('0x...')
const signature = await agentAccount.signMessage({ message: request })
// Proxy recovers with viem:
const signer = await recoverMessageAddress({ message: request, signature })
```

```typescript
// ethers.js pattern
import { Wallet } from 'ethers'

const agentWallet = new Wallet('0x...')
const signature = await agentWallet.signMessage(request)
// Recover via verifyMessage
const signer = verifyMessage(hashMessage(request), signature)
```

**Winner for raw ECDSA:** Tie (both equally supported)

### 3.6 Custom Wallet Driver Implementation (viem-based)

```typescript
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

// Zuul wallet driver factory
export function createWalletDriver(): WalletDriver {
  return {
    async recoverSigner(request: SignedRequest): Promise<Address> {
      // All wallet types produce message + signature
      // Proxy doesn't care which wallet type signed — just recovers
      const signer = await recoverMessageAddress({
        message: request.payload,
        signature: request.signature,
      })

      // Verify timestamp freshness, nonce uniqueness (Zuul's auth layer)
      // Verify signer against X-Agent-Address header (trust boundary)
      // Check RBAC contract for permissions (governance layer)

      return signer
    },
  }
}

// Usage in proxy auth middleware
const walletDriver = createWalletDriver()
const agentAddress = await walletDriver.recoverSigner(signedRequest)
// ... rest of auth flow
```

**Key insight:** Zuul's wallet driver abstraction doesn't need different implementations per wallet type. All wallets produce (message, signature, address) tuple. viem's `recoverMessageAddress` unifies recovery across all wallet types.

---

## Part 4: Multi-Chain Support

### 4.1 Hedera, Base, Arbitrum, Optimism: EVM Compatibility

| Chain | EVM Compatibility | JSON-RPC Support | viem Support | Hardhat Support |
|-------|------------------|------------------|--------------|-----------------|
| **Hedera** | ✅ Full (HIP-482) | ✅ Yes (JSON-RPC Relay) | ✅ Yes | ✅ Yes |
| **Base** | ✅ Full (OP Stack) | ✅ Yes | ✅ Yes | ✅ Yes |
| **Arbitrum** | ✅ Full (Nitro) | ✅ Yes | ✅ Yes | ✅ Yes |
| **Optimism** | ✅ Full (OP Stack) | ✅ Yes | ✅ Yes | ✅ Yes |

### 4.2 Hedera JSON-RPC Relay (HIP-482)

**Finding:** Hedera supports full JSON-RPC Relay, making it compatible with all EVM tools.

```typescript
// viem connection to Hedera
import { createPublicClient, http } from 'viem'
import { hederaTestnet } from 'viem/chains'

const client = createPublicClient({
  chain: hederaTestnet,
  transport: http('https://testnet.hashio.io/api'),
})

// Signature recovery works identically
const signer = await recoverMessageAddress({
  message: request,
  signature: agentSignature,
})
```

**No Hedera-specific signature verification code needed.** ECDSA signature recovery is identical across all EVM chains (secp256k1 standard).

### 4.3 Same Solidity Contract, Multiple Chains

**Architecture:**
```solidity
// contracts/RBACPermissions.sol
// Same source code deploys identically to Hedera, Base, Arbitrum, Optimism
// No chain-specific conditionals needed

pragma solidity 0.8.20;

contract RBACPermissions {
  // ... permission logic (identical across chains)
}
```

**Deployment via Hardhat Ignition:**
```typescript
// ignition/modules/RBAC.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RBACModule = buildModule("RBAC", (m) => {
  const rbac = m.contract("RBACPermissions");
  return { rbac };
});

export default RBACModule;
```

**Network-specific parameters:**
```json
// ignition/parameters/hedera.json
{
  "RBAC": {
    "owner": "0x..." // Hedera agent address
  }
}

// ignition/parameters/base.json
{
  "RBAC": {
    "owner": "0x..." // Base agent address
  }
}
```

**Deploy to any chain:**
```bash
npx hardhat ignition deploy ./ignition/modules/RBAC.ts --network hedera
npx hardhat ignition deploy ./ignition/modules/RBAC.ts --network base
npx hardhat ignition deploy ./ignition/modules/RBAC.ts --network arbitrum
npx hardhat ignition deploy ./ignition/modules/RBAC.ts --network optimism
```

### 4.4 Hedera-Specific Quirk

**Caveat:** Hedera's stateRoot returns empty trie (doesn't impact signature recovery or contract logic, only merkle proof operations — not relevant for Zuul).

---

## Part 5: Recommendations & Implementation Plan

### 5.1 Recommended Stack

**Smart Contracts:**
- **Framework:** Hardhat
- **Deployment:** Hardhat Ignition (with network-specific parameter files)
- **Testing:** TypeScript tests + Foundry plugin for Solidity test speed
- **ABI Generation:** TypeChain (generates viem-compatible types)

**EVM Client:**
- **Primary:** viem
- **Signature Recovery:** `viem/utils#recoverMessageAddress`
- **Account Abstraction:** viem's SmartAccountClient
- **Multi-Chain:** viem's client abstraction with chain-specific configuration

**Wallet Abstraction:**
- **Pattern:** Custom WalletDriver interface (thin adapter over viem)
- **Supported Wallets:** Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA
- **Recovery Logic:** All wallets → viem's `recoverMessageAddress` (unified)

**Multi-Chain:**
- **Chains:** Hedera, Base, Arbitrum, Optimism (all identical contract code)
- **Deployment:** Ignition parameters per chain
- **No chain-specific code needed** for signature recovery (ECDSA standard across EVM)

### 5.2 Implementation Phases

**Phase 1: Core Auth (Week 1-2)**
```typescript
// 1. Wallet driver interface + viem integration
// 2. Signature recovery middleware
// 3. Unit tests for recoverMessageAddress scenarios
// 4. Agent identity validation

src/
├── wallet/
│   ├── driver.ts           // WalletDriver interface
│   ├── viem-driver.ts      // viem implementation
│   └── __tests__/
│       └── test_wallet-driver.ts
├── auth/
│   ├── signature-verifier.ts
│   └── __tests__/
│       └── test_signature-recovery.ts
```

**Phase 2: RBAC Contract (Week 2-3)**
```solidity
// Hardhat + TypeChain
contracts/
├── RBACPermissions.sol
└── Audit.sol

ignition/
├── modules/
│   └── RBAC.ts
└── parameters/
    ├── hedera.json
    ├── base.json
    ├── arbitrum.json
    └── optimism.json

// After compile, TypeChain generates:
typechain/
├── RBACPermissions.ts (viem types)
├── Audit.ts (viem types)
```

**Phase 3: Audit Logging (Week 3)**
```typescript
src/audit/
├── chain-driver.ts         // Abstraction for blockchain writes
├── hedera-driver.ts        // Hedera implementation
├── base-driver.ts          // Base implementation
└── __tests__/
    └── integration_test_audit.ts
```

**Phase 4: E2E Integration (Week 4)**
- Live Hardhat network: Agent signs request → proxy recovers → checks RBAC contract → logs to audit
- Deploy to Hedera testnet
- Multi-chain deploy (Base, Arbitrum) to validate same contract works

### 5.3 Package.json Dependencies (Recommended)

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

**Why NOT included:**
- ❌ ethers.js (using viem instead)
- ❌ web3.js (using viem instead)
- ❌ ether-rs bindings (Rust-specific, not needed)

### 5.4 Gotchas & Migration Risks

**Gotcha 1: viem's Account Abstraction Learning Curve**
- SmartAccountClient is powerful but different from simple wallets
- Mitigation: Zuul doesn't need full AA features for MVP; use basic account pattern, upgrade later

**Gotcha 2: TypeChain Output Directory**
- First TypeChain run requires `hardhat clean` to bootstrap
- Mitigation: Document in setup instructions; add to CI/CD

**Gotcha 3: Hedera's Chain ID (295)**
- Some tools assume mainnet = 1 or testnet = 11155111
- Mitigation: Explicitly configure in Hardhat + viem client setup

**Gotcha 4: Foundry Test Speed vs Hardhat Integration**
- Hybrid approach (Hardhat + Foundry) adds tooling complexity
- Mitigation: Use hybrid only for critical path tests; prioritize Hardhat tests for MVP

**Gotcha 5: ERC-6492 Support**
- Neither viem nor ethers.js has built-in ERC-6492 validation
- Mitigation: If Coinbase Agentic Wallet uses ERC-6492, use Ambire's signature-validator library as third-party validator

**Gotcha 6: Message Hashing Standards**
- Different wallets may hash messages differently (EIP-191, EIP-712)
- Mitigation: Zuul agent payload must use EIP-191 (standard personal_sign); verify in tests

### 5.5 Ecosystem Maturity Assessment

| Library | Maturity | Production-Ready? | Concerns |
|---------|----------|------------------|----------|
| **viem** | Growing rapidly (Paradigm backing) | ✅ Yes (for signature recovery) | Smaller community than ethers.js, but core stable |
| **Hardhat** | Mature (industry standard) | ✅ Yes | Large ecosystem, widely adopted |
| **Hardhat Ignition** | Recent but solid | ✅ Yes | Declarative deployment is safer than scripts |
| **TypeChain** | Mature | ✅ Yes | Stable for years; works with viem |
| **Foundry** | Mature (Paradigm) | ✅ Yes | Rust codebase, excellent for Solidity-only teams |
| **Coinbase Agentic Wallet** | Beta (Feb 2026) | ⚠️ New | First iteration, may have breaking changes; monitor updates |

---

## Part 6: Detailed Justification for Zuul Architecture

### 6.1 Why viem's `recoverMessageAddress` Aligns Perfectly with Zuul's Auth Flow

**Zuul's Auth Protocol:**
```
Agent → Proxy: {
  "tool": "github",
  "action": "create",
  "params": {...},
  "nonce": "uuid-1234",
  "timestamp": "2026-02-18T14:30:00Z"
}
+ Headers:
  X-Agent-Address: 0x1234...
  X-Signature: 0xabcd...
```

**Proxy's Verification:**
```typescript
import { recoverMessageAddress } from 'viem'

// 1. Reconstruct message
const message = JSON.stringify({
  tool: request.tool,
  action: request.action,
  params: request.params,
  nonce: request.nonce,
  timestamp: request.timestamp,
})

// 2. Recover signer
const recoveredSigner = await recoverMessageAddress({
  message,
  signature: headers['x-signature'],
})

// 3. Verify identity
if (recoveredSigner.toLowerCase() !== headers['x-agent-address'].toLowerCase()) {
  throw new AuthError('Invalid signature', -32002, 401)
}

// 4. Check nonce (replay protection)
if (await nonceStore.has(request.nonce)) {
  throw new AuthError('Nonce reused', -32004, 401)
}

// 5. Check timestamp (±5 min)
const now = Date.now()
const msgTime = new Date(request.timestamp).getTime()
if (Math.abs(now - msgTime) > 5 * 60 * 1000) {
  throw new AuthError('Timestamp drift', -32005, 401)
}

// 6. Check RBAC permissions
const hasPermission = await rbacContract.hasPermission(
  recoveredSigner,
  request.tool,
  request.action
)
if (!hasPermission) {
  throw new PermissionError('No tool access', -32010, 403)
}

// 7. Inject key and forward
const response = await proxyRequest(request, apiKey)

// 8. Log to audit contract
await auditContract.logAccess(recoveredSigner, request, response.status)

return response
```

**Why viem is perfect:**
- `recoverMessageAddress` handles ECDSA recovery atomically
- No separate hash + verify steps like ethers.js
- Type-safe throughout (TypeScript strict mode)
- Works with any wallet type (doesn't matter which signed)
- Lightweight (2 KB) for just this operation

### 6.2 Driver Abstraction: Zuul Doesn't Need 4 Implementations

**Key Insight:** All wallet types (Coinbase, MetaMask, WalletConnect, raw ECDSA) produce the same output: `(message, signature, signer_address)`.

**Wrong approach (tempting but unnecessary):**
```typescript
// ❌ Don't do this
class CoinbaseWalletDriver { recoverSigner() { ... } }
class MetaMaskDriver { recoverSigner() { ... } }
class WalletConnectDriver { recoverSigner() { ... } }
class RawECDSADriver { recoverSigner() { ... } }
```

**Correct approach (Zuul's pattern):**
```typescript
// ✅ Do this
interface SignedRequest {
  payload: string
  signature: string
}

class UnifiedWalletDriver {
  async recoverSigner(req: SignedRequest): Promise<Address> {
    return recoverMessageAddress({
      message: req.payload,
      signature: req.signature,
    })
    // Done. Works for ALL wallets.
  }
}

// Agent configuration determines WHICH wallet to use
// But proxy recovery logic is wallet-agnostic
```

**The abstraction layer is thin because:**
- Wallet type differences exist at signing time (agent-side)
- Recovery is deterministic (signature + message → address)
- Proxy doesn't care which wallet created the signature

**viem enables this simplicity by providing `recoverMessageAddress` as a pure function, not tied to wallet client instance.**

### 6.3 Multi-Chain Deployment Strategy: Write Once, Deploy Everywhere

**Contract source:**
```solidity
pragma solidity 0.8.20;

contract RBACPermissions {
  // ... same code for Hedera, Base, Arbitrum, Optimism
}
```

**Hardhat Ignition module:**
```typescript
const RBACModule = buildModule("RBAC", (m) => {
  const rbac = m.contract("RBACPermissions");
  m.call(rbac, "initialize", [process.env.ADMIN_ADDRESS]);
  return { rbac };
});
```

**Deploy 4 times (different networks):**
```bash
# Hedera
npx hardhat ignition deploy ignition/modules/RBAC.ts \
  --network hedera \
  --parameters ignition/parameters/hedera.json

# Base
npx hardhat ignition deploy ignition/modules/RBAC.ts \
  --network base \
  --parameters ignition/parameters/base.json

# Same contract, different addresses per chain
# Hardhat Ignition tracks each deployment separately
```

**Result:**
- Hedera: `0x1111...` (RBACPermissions)
- Base: `0x2222...` (RBACPermissions)
- Arbitrum: `0x3333...` (RBACPermissions)
- Optimism: `0x4444...` (RBACPermissions)

**Zuul Proxy Configuration:**
```yaml
# config.yaml
chains:
  hedera:
    chain_id: 295
    rpc_url: $HEDERA_RPC_URL
    rbac_contract: 0x1111...
  base:
    chain_id: 8453
    rpc_url: $BASE_RPC_URL
    rbac_contract: 0x2222...
  arbitrum:
    chain_id: 42161
    rpc_url: $ARBITRUM_RPC_URL
    rbac_contract: 0x3333...
  optimism:
    chain_id: 10
    rpc_url: $OPTIMISM_RPC_URL
    rbac_contract: 0x4444...
```

**Signature recovery is identical across all chains** because ECDSA (secp256k1) is a mathematical standard, not chain-specific.

---

## Part 7: Comparison Tables for Decision Record

### 7.1 Framework Decision Matrix (Weighted Scoring)

| Criterion | Weight | Hardhat | Foundry | Winner |
|-----------|--------|---------|---------|--------|
| **TypeScript-first requirement** | 10 | 10/10 | 3/10 | Hardhat (+70 points) |
| **Multi-chain deployment safety** | 9 | 9/10 | 6/10 | Hardhat (+27 points) |
| **Test execution speed** | 6 | 5/10 | 10/10 | Foundry (+30 points) |
| **ABI generation for TS** | 8 | 10/10 | 2/10 | Hardhat (+64 points) |
| **Plugin ecosystem** | 5 | 9/10 | 6/10 | Hardhat (+15 points) |
| **Learning curve (team skill)** | 4 | 8/10 | 5/10 | Hardhat (+12 points) |
| **Community adoption** | 3 | 9/10 | 7/10 | Hardhat (+6 points) |
| **Performance (build time)** | 4 | 6/10 | 10/10 | Foundry (+16 points) |
| | | | **Total** | **Hardhat: +194, Foundry: +46** |

**Recommendation:** Hardhat (clear winner for Zuul's requirements)

### 7.2 Client Library Decision Matrix (Weighted Scoring)

| Criterion | Weight | viem | ethers.js v6 | Winner |
|-----------|--------|------|--------------|--------|
| **Signature recovery ergonomics** | 10 | 10/10 | 7/10 | viem (+30 points) |
| **Bundle size** | 8 | 10/10 | 5/10 | viem (+40 points) |
| **TypeScript type safety** | 9 | 10/10 | 8/10 | viem (+18 points) |
| **Multi-chain support** | 7 | 9/10 | 9/10 | Tie (0 points) |
| **Account abstraction** | 6 | 10/10 | 6/10 | viem (+24 points) |
| **Community maturity** | 5 | 7/10 | 10/10 | ethers.js v6 (+15 points) |
| **Production stability** | 8 | 9/10 | 10/10 | ethers.js v6 (+8 points) |
| **Tree-shakeability** | 6 | 10/10 | 6/10 | viem (+24 points) |
| **Integration with Hardhat** | 5 | 10/10 | 9/10 | viem (+5 points) |
| | | | **Total** | **viem: +144, ethers.js v6: +23** |

**Recommendation:** viem (clear winner for Zuul's signature recovery focus)

---

## Part 8: Action Items for Implementation

### 8.1 Setup Phase (Days 1-2)

- [ ] Initialize Hardhat project with TypeScript template
- [ ] Add `@nomicfoundation/hardhat-foundry` plugin for hybrid testing
- [ ] Configure `@typechain/hardhat` for viem-compatible type generation
- [ ] Set up viem in proxy service with wallet client
- [ ] Create wallet driver interface and viem implementation
- [ ] Write unit tests for `recoverMessageAddress` scenarios

### 8.2 Contract Development (Days 2-4)

- [ ] Implement RBACPermissions contract (Solidity)
- [ ] Implement Audit contract (encrypted payload storage)
- [ ] Create Hardhat Ignition deployment module
- [ ] Generate parameter files for all 4 chains (Hedera, Base, Arbitrum, Optimism)
- [ ] Generate TypeChain types (`typechain/*.ts`)
- [ ] Write Solidity + TypeScript integration tests

### 8.3 Auth Integration (Days 4-5)

- [ ] Implement signature recovery middleware (uses viem + contract types)
- [ ] Implement nonce/timestamp validation
- [ ] Implement RBAC permission checking (via contract)
- [ ] Integration tests: agent signs → proxy recovers → checks RBAC → logs to audit

### 8.4 Deployment & Validation (Days 5-7)

- [ ] Deploy to Hardhat local network (MVP)
- [ ] Deploy to Hedera testnet
- [ ] Deploy to Base testnet (validate same contract works)
- [ ] Live test: agent request → proxy auth → RBAC check → audit log
- [ ] Document multi-chain deployment process

### 8.5 Documentation

- [ ] Update CLAUDE.md with stack decisions
- [ ] Create `docs/architecture-smart-contracts.md` (Hardhat + Ignition setup)
- [ ] Create `docs/client-library-guide.md` (viem for signature recovery)
- [ ] Create `docs/wallet-driver-abstraction.md` (pluggable wallet pattern)
- [ ] Create `docs/multi-chain-deployment.md` (Hedera, Base, Arbitrum, Optimism)

---

## Sources

### Smart Contract Frameworks
- [Foundry vs Hardhat: A Faster, Native Way to Test Solidity Smart Contracts](https://threesigma.xyz/blog/foundry/foundry-vs-hardhat-solidity-testing-tools)
- [Hardhat: The Professional Ethereum Development Environment](https://palmartin.medium.com/fvvvvvvvvfffffffffffffffffffffffffhardhat-the-professional-ethereum-development-environment-18ff7c8557c4)
- [Top Smart Contract Frameworks: Hardhat vs Foundry in 2026](https://www.nadcab.com/blog/smart-contract-frameworks-explained)
- [Smart contract Frameworks - Foundry vs Hardhat: Differences in performance and developer experience](https://chainstack.com/foundry-hardhat-differences-performance/)
- [Getting started with Hardhat Ignition](https://hardhat.org/ignition)
- [Scripting with Foundry](https://getfoundry.sh/forge/deploying/)
- [Deploy and Verify a Smart Contract with Foundry - Hedera](https://docs.hedera.com/hedera/getting-started-evm-developers/deploy-a-smart-contract-with-foundry)

### EVM Client Libraries
- [viem FAQ](https://viem.sh/docs/faq)
- [Viem: A Modern, Typed Alternative to Ethers.js for Ethereum Development](https://medium.com/@BizthonOfficial/viem-a-modern-typed-alternative-to-ethers-js-for-ethereum-development-fd425eb58459)
- [Viem vs. Ethers.js: A Comparison for Web3 Developers](https://metamask.io/news/viem-vs-ethers-js-a-detailed-comparison-for-web3-developers)
- [The Promise of viem: A TypeScript Library for Interacting with Ethereum](https://www.dynamic.xyz/blog/the-promise-of-viem-a-typescript-library-for-interacting-with-ethereum)
- [Why Viem](https://viem.sh/docs/introduction)

### Signature Recovery APIs
- [recoverMessageAddress · Viem](https://viem.sh/docs/utilities/recoverMessageAddress)
- [signMessage (Local Account) · Viem](https://viem.sh/docs/accounts/local/signMessage)
- [recoverAddress · viem](https://v1.viem.sh/docs/utilities/recoverAddress.html)

### Wallet Abstraction & Account Abstraction
- [Getting Started with Account Abstraction · Viem](https://viem.sh/account-abstraction)
- [Wallet Client · Viem](https://viem.sh/docs/clients/wallet)
- [Coinbase Smart Wallet · Viem](https://viem.sh/account-abstraction/accounts/smart/toCoinbaseSmartAccount)
- [What is ERC-6492 and why it's important for Account Abstraction](https://docs.zerodev.app/blog/erc-6492-and-why-its-important-for-aa)
- [Simplifying Smart Wallets: ERC 1271 and ERC 6492 Explained](https://www.dynamic.xyz/blog/erc-1271-and-erc-6492-explained)
- [GitHub - AmbireTech/signature-validator: TypeScript library that supports validation of ERC-1271, ERC-6492](https://github.com/AmbireTech/signature-validator)

### Coinbase Agentic Wallet
- [Introducing Agentic Wallets: Give Your Agents the Power of Autonomy](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets)
- [Agentic Wallet - Coinbase Developer Documentation](https://docs.cdp.coinbase.com/agentic-wallet/welcome)
- [Coinbase rolls out AI tool to 'give any agent a wallet'](https://www.theblock.co/post/389524/coinbase-rolls-out-ai-tool-to-give-any-agent-a-wallet)

### Multi-Chain Deployment
- [JSON-RPC Relay and EVM Tooling - Hedera](https://docs.hedera.com/hedera/core-concepts/smart-contracts/understanding-hederas-evm-differences-and-compatibility/for-evm-developers-migrating-to-hedera/json-rpc-relay-and-evm-tooling)
- [HIP-482: JSON-RPC Relay](https://hips.hedera.com/HIP/hip-482.html)
- [How To Leverage Hedera for Efficient Web3 Development](https://validationcloud.medium.com/how-to-leverage-hedera-for-efficient-web3-development-a-dive-into-json-rpc-evm-tooling-2719b991fffc)

### TypeChain & ABI Generation
- [GitHub - dethcrypto/TypeChain: TypeScript bindings for Ethereum smart contracts](https://github.com/dethcrypto/TypeChain)
- [Using TypeScript - Hardhat](https://v2.hardhat.org/hardhat-runner/docs/guides/typescript)
- [@typechain/hardhat - npm](https://www.npmjs.com/package/@typechain/hardhat)

### Wallet Abstraction Patterns
- [GitHub - tronweb3/tronwallet-adapter: Modular TypeScript wallet adapters](https://github.com/tronweb3/tronwallet-adapter)
- [Top 10 Embedded Wallets for Apps in 2026](https://www.openfort.io/blog/top-10-embedded-wallets)
- [Web3Modal — Simplifying Multi-Wallet Integrations for dApp Developers](https://medium.com/@BizthonOfficial/web3modal-simplifying-multi-wallet-integrations-for-dapp-developers-191ff3cc4891)

---

## Appendix: Quick Reference

### Zuul Stack at a Glance

```
┌─────────────────────────────────────────────────────┐
│  AGENT (any wallet type: Coinbase, MetaMask, etc.)  │
│  Signs request with private key                      │
└──────────────────────┬──────────────────────────────┘
                       │ { message, signature }
                       ▼
┌─────────────────────────────────────────────────────┐
│  ZUUL PROXY (Node.js + TypeScript)                  │
├─────────────────────────────────────────────────────┤
│  Auth Layer (viem):                                 │
│  1. recoverMessageAddress({ message, signature })   │
│  2. Verify signer == X-Agent-Address header         │
│  3. Check RBAC contract permissions                 │
│  4. Inject API key                                  │
│  5. Log to audit contract                           │
└──────────────────────┬──────────────────────────────┘
                       │
    ┌──────────────────┴─────────────────┐
    │                                    │
    ▼                                    ▼
┌──────────────────┐          ┌──────────────────┐
│  Tool Service    │          │  Blockchain      │
│  (GitHub, Slack) │          │  (Hedera, Base)  │
│                  │          │                  │
│  + API key       │          │  RBACPermissions │
│  + Request       │          │  AuditLog        │
└──────────────────┘          └──────────────────┘

Dependencies:
  - viem (EVM client, signature recovery)
  - Hardhat (contract deployment, testing)
  - TypeChain (contract type generation)
  - pino (structured logging)
```

### Key Files to Create

```
zuul-proxy/
├── contracts/
│   ├── RBACPermissions.sol
│   └── AuditLog.sol
├── ignition/
│   ├── modules/
│   │   └── RBAC.ts
│   └── parameters/
│       ├── hedera.json
│       ├── base.json
│       ├── arbitrum.json
│       └── optimism.json
├── src/
│   ├── wallet/
│   │   ├── driver.ts
│   │   └── viem-driver.ts
│   ├── auth/
│   │   ├── signature-verifier.ts
│   │   └── nonce-validator.ts
│   └── rbac/
│       └── permission-checker.ts
├── typechain/                    (generated by TypeChain)
│   ├── RBACPermissions.ts
│   └── AuditLog.ts
└── package.json                  (dependencies below)
```

---

**Report Status:** Complete ✅

**Next Steps:** Review with team, finalize setup, begin Phase 1 implementation
