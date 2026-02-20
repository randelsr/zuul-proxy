# Getting Started with Zuul Proxy

**Complete guide to understanding, setting up, and deploying Zuul Proxy from the ground up.**

Last Updated: February 20, 2026

---

## What is Zuul Proxy?

**One-liner:** On-chain governance proxy for agent tool access — "OpenRouter for agent access" with RBAC enforcement and immutable audit trails.

**The Problem It Solves:**

Agents aren't trustworthy with credentials. You can't tell an agent "don't leak API keys" and expect enforcement — prompts aren't policies. The architecture must enforce security.

**How It Works:**

```
Agent → Signs Request with Wallet
       ↓
Zuul Proxy:
  1. Verify signature (EIP-191)
  2. Check permissions (on-chain RBAC)
  3. Inject API key (key custody)
  4. Forward HTTP request
  5. Log to blockchain (immutable audit)
       ↓
Tool (GitHub, Slack, OpenAI, etc.)
       ↓
Response + Governance Metadata back to Agent
```

**Key Features:**

✅ **Wallet-based identity** — Agents authenticate with EIP-191 signatures
✅ **On-chain RBAC** — Permissions stored in smart contracts, checked per request
✅ **Key custody** — Agents never see API keys, proxy injects at request time
✅ **Immutable audit** — Every request logged to blockchain with encryption
✅ **Permission caching** — 5-minute TTL reduces chain reads
✅ **Fail-closed** — Returns 503 on chain outage, never 403 (security default)
✅ **Multi-chain** — Deploy same contracts to Hedera, Base, Arbitrum, Optimism

---

## Documentation Roadmap

Choose your path based on what you need:

### 🚀 **I want to run it locally (5 minutes)**
→ **[QUICKSTART.md](./QUICKSTART.md)** — Get Zuul running with demo agent locally

**What you'll do:**
1. Clone repo
2. Run `pnpm setup:dev`
3. Run `pnpm demo`
4. See full end-to-end flow with blockchain audit trail

**Time:** 5 minutes
**Prerequisites:** Node.js 22+, pnpm

---

### 🎯 **I want to understand the architecture**
→ **[docs/architecture.md](./docs/architecture.md)** — System design, trust boundaries, module breakdown

**What you'll learn:**
- High-level system design (Agent → Proxy → Tool)
- Key separation of concerns (Auth, RBAC, Key Custody, Audit)
- How permissions flow from config → on-chain → request enforcement
- Fail-closed security model

**Time:** 15 minutes
**Prerequisite:** Basic understanding of smart contracts

---

### 🔌 **I want to use the HTTP API**
→ **[docs/api.md](./docs/api.md)** — Complete API reference with request/response examples

**What you'll find:**
- `/rpc` endpoint: `tools/list`, `tools/call`
- `/forward/{target_url}` endpoint: HTTP forwarding with signature
- Request headers: `X-Agent-Address`, `X-Signature`, `X-Nonce`, `X-Timestamp`
- Response format: JSON-RPC 2.0 + `_governance` metadata
- Error codes: `-32001` to `-32039` (auth, permission, service, rate limit)
- Admin endpoints: `/admin/audit/search`, `/admin/rbac/revoke` (localhost-only)

**Time:** 20 minutes
**Prerequisite:** Basic HTTP knowledge

---

### 🌍 **I want to deploy to Hedera testnet**
→ **[docs/hedera-deployment.md](./docs/hedera-deployment.md)** — Step-by-step Hedera testnet deployment

**What you'll do:**
1. Create Hedera testnet account
2. Fund with testnet HBAR
3. Deploy smart contracts
4. Register test agents
5. Start proxy on Hedera
6. Verify on Hashscan explorer

**Time:** 30 minutes
**Cost:** Free (testnet HBAR)
**Prerequisite:** QUICKSTART.md experience

---

### 💰 **I want to understand costs**
→ **[docs/gas-cost-analysis.md](./docs/gas-cost-analysis.md)** — Hedera vs Base pricing

**Key Finding:** Hedera is **100x cheaper** than Base for audit logging
- Hedera: $0.003-0.005 per write (fixed)
- Base: $0.30-0.60 per write (variable, gas-based)
- Monthly: $1,200-1,500 vs $135,000-210,000

**Time:** 10 minutes

**→ AND [.plans/cost-optimization-analysis.md](./.plans/cost-optimization-analysis.md)** — v1.1 optimization opportunities

**Key Finding:** Can reduce costs by 90% with batching
- Current MVP: $1,200-1,500/month
- After v1.1: $120-150/month
- Trade-off: +5 seconds latency (acceptable for audit)

**Time:** 30 minutes (detailed technical analysis)

---

### 🔒 **I want to understand security**
→ **[docs/security.md](./docs/security.md)** — Threat model, audit design, key custody

**What you'll learn:**
- Authentication: Signature recovery, nonce validation, replay protection
- Authorization: RBAC permission checks, fail-closed on chain outage
- Audit: Encrypted payloads on-chain, decryption for investigation
- Key custody: Why agents can't leak keys they don't have
- Limitations: Opt-in governance, no network isolation in MVP

**Time:** 20 minutes

---

### 📋 **I want to see the rules and standards**
→ **[CLAUDE.md](./CLAUDE.md)** — Project context, code standards, command reference

**Contains:**
- Project overview
- Directory structure
- Commands: `pnpm test`, `pnpm build`, `pnpm demo`
- Links to `.claude/rules/`: exceptions, API, architecture, TypeScript standards, testing, logging

**Time:** 15 minutes

---

### 🎪 **I want to understand the hackathon strategy**
→ **[docs/ethdenver-hackathon.md](./docs/ethdenver-hackathon.md)** — ETHDenver 2026 scope, bounty strategy, positioning

**What you'll find:**
- MVP scope and user stories (14 stories, 100% complete)
- Key decisions: Per-request signing, on-chain RBAC, encrypted audit
- Bounty targets: Hedera ($10k), Base ($10k), Kite AI x402 ($10k)
- Business positioning: "Trust layer for the agentic economy"
- Cost economics and v1.1 roadmap

**Time:** 25 minutes

---

## Quick Reference: Common Tasks

### Set Up Locally (5 min)
```bash
git clone https://github.com/example/zuul-proxy.git
cd zuul-proxy
pnpm install
pnpm contracts:build
pnpm contracts:dev      # Terminal 1
pnpm setup:dev          # Terminal 2
pnpm dev                # Terminal 3
pnpm demo               # Terminal 4
```

### Run Tests
```bash
pnpm test              # Unit tests
pnpm test:coverage     # With coverage report (must be ≥90%)
```

### Check Code Quality
```bash
pnpm typecheck         # TypeScript strict mode
pnpm lint              # ESLint
pnpm format            # Prettier
```

### Deploy to Hedera Testnet
```bash
# 1. Create Hedera testnet account: https://portal.hedera.com/register
# 2. Fund with HBAR: https://testnet.hedera.com/faucet
# 3. Create .env.hedera with HEDERA_PRIVATE_KEY
# 4. Deploy contracts
pnpm contracts:build
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet

# 5. Register agents
npx tsx scripts/register-agents.ts

# 6. Start proxy
source .env.hedera
pnpm dev
```

### Query Audit Logs (Admin)
```bash
# By agent
curl 'http://localhost:8080/admin/audit/search?agent=0x...'

# By tool
curl 'http://localhost:8080/admin/audit/search?tool=github'

# With decryption
curl 'http://localhost:8080/admin/audit/search?agent=0x...&decrypt=true'
```

### Emergency Revoke Agent (Admin)
```bash
curl -X POST http://localhost:8080/admin/rbac/revoke \
  -H 'Content-Type: application/json' \
  -d '{"agent_address": "0x..."}'
```

---

## Learning Paths by Role

### 👨‍💻 **Developer (You want to contribute code)**

1. Start here: [QUICKSTART.md](./QUICKSTART.md)
2. Read: [CLAUDE.md](./CLAUDE.md) for project structure
3. Study: [docs/architecture.md](./docs/architecture.md) for design patterns
4. Check: `.claude/rules/` for code standards
5. Explore: `tests/` for testing patterns
6. Pick an issue or feature

---

### 🏢 **DevOps Engineer (You want to deploy this)**

1. Start here: [QUICKSTART.md](./QUICKSTART.md)
2. Deep dive: [docs/hedera-deployment.md](./docs/hedera-deployment.md)
3. Review: [docs/deployment.md](./docs/deployment.md) for multi-chain
4. Plan: [docs/gas-cost-analysis.md](./docs/gas-cost-analysis.md)
5. Secure: [docs/security.md](./docs/security.md) for production hardening

---

### 🤖 **Agent Builder (You want to use Zuul for your agents)**

1. Start here: [docs/api.md](./docs/api.md)
2. Try: [QUICKSTART.md](./QUICKSTART.md) for demo
3. Study: `demo/agent.ts` for signature generation code
4. Integrate: Use Zuul as HTTP endpoint for your agent
5. Verify: Check blockchain audit trail on Hashscan

---

### 🏛️ **Security Auditor (You want to verify security)**

1. Start here: [docs/security.md](./docs/security.md)
2. Review: Smart contracts in `contracts/`
3. Check: `src/auth/` for signature verification
4. Trace: `src/api/middleware/` for authentication → authorization → key injection order
5. Verify: Test suite in `tests/` for coverage

---

### 📊 **Business (You want to understand the pitch)**

1. Quick read: [README.md](./README.md)
2. Deep dive: [docs/ethdenver-hackathon.md](./docs/ethdenver-hackathon.md)
3. Cost analysis: [docs/gas-cost-analysis.md](./docs/gas-cost-analysis.md) + [.plans/cost-optimization-analysis.md](./.plans/cost-optimization-analysis.md)
4. Positioning: "Trust layer for the agentic economy"

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT (Client)                                             │
│  - Wallet address (identity)                                │
│  - Private key (for signing)                                │
│  - Makes HTTP requests signed with EIP-191                  │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                              Signed HTTP Request
                                      ↓
┌─────────────────────────────────────────────────────────────┐
│  ZUUL PROXY                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. AUTHENTICATION (src/auth/)                      │   │
│  │     - Recover signer from signature (EIP-191)       │   │
│  │     - Validate nonce (replay protection)            │   │
│  │     - Check timestamp (±5 min freshness)            │   │
│  │     FAIL → 401 Unauthorized                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. AUTHORIZATION (src/rbac/)                       │   │
│  │     - Query RBAC contract for agent → role          │   │
│  │     - Check if role has permission for tool+action  │   │
│  │     - Cache with 5-min TTL (reduce chain reads)     │   │
│  │     FAIL → 403 Forbidden                            │   │
│  │     CHAIN ERROR → 503 Service Unavailable (fail-closed)
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. KEY INJECTION (src/custody/)                    │   │
│  │     - Fetch API key from .env for this tool         │   │
│  │     - Inject into upstream request header           │   │
│  │     (Agent NEVER sees the key)                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  4. HTTP FORWARD (src/proxy/)                       │   │
│  │     - Fetch from upstream tool                      │   │
│  │     - Time: 30s read timeout, 60s write timeout     │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  5. AUDIT LOG (src/audit/)                          │   │
│  │     - Encrypt payload with AES-256-GCM              │   │
│  │     - Hash with SHA-256                             │   │
│  │     - Write to blockchain (non-blocking)            │   │
│  │     - Include agent signature for non-repudiation   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  6. RESPONSE (src/api/server.ts)                    │   │
│  │     - Format: JSON-RPC 2.0                          │   │
│  │     - Add _governance metadata (agent, tool, action │   │
│  │       latency, audit_tx, chain_id)                  │   │
│  │     - Include audit transaction hash from step 5    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                         Response + Governance Metadata
                                      ↓
┌─────────────────────────────────────────────────────────────┐
│  UPSTREAM TOOL (GitHub, Slack, OpenAI, etc.)                │
│  - Received HTTP request with injected API key              │
│  - Returns response                                         │
│  - Authorization checked by tool's own access control       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  BLOCKCHAIN (Hedera, Base, Arbitrum, Optimism)              │
│  - RBAC.sol: agent → role mapping, emergency revoke         │
│  - Audit.sol: encrypted audit entries with indexes          │
│  - All queries: Read-only, fail-closed on chain outage      │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
zuul-proxy/
├── README.md                          ← Project overview
├── QUICKSTART.md                      ← 5-minute local setup
├── GETTING_STARTED.md                 ← You are here
├── CLAUDE.md                          ← Internal context (for Claude Code)
│
├── src/
│   ├── index.ts                       ← Entry point (loads .env, starts server)
│   ├── api/
│   │   ├── server.ts                  ← HTTP server, middleware pipeline
│   │   ├── handlers/                  ← RPC handlers, admin endpoints
│   │   └── middleware/                ← Auth, RBAC, key injection
│   ├── auth/                          ← Signature verification (EIP-191)
│   ├── rbac/                          ← Permission checking + caching
│   ├── custody/                       ← API key management
│   ├── proxy/                         ← HTTP forwarding
│   ├── audit/                         ← Blockchain logging
│   ├── chain/                         ← Chain drivers (Hedera, Base, etc.)
│   ├── config/                        ← Configuration loading
│   ├── errors.ts                      ← Error types + JSON-RPC codes
│   ├── types.ts                       ← Domain types
│   └── logging.ts                     ← Structured logging (pino)
│
├── contracts/
│   ├── RBAC.sol                       ← On-chain permissions
│   └── Audit.sol                      ← On-chain audit log
│
├── tests/
│   ├── auth/                          ← Signature verification tests
│   ├── rbac/                          ← Permission checking tests
│   ├── proxy/                         ← HTTP forwarding tests
│   ├── audit/                         ← Audit logging tests
│   └── chain/                         ← Chain driver tests
│
├── demo/
│   ├── agent.ts                       ← Demo agent (signature generation)
│   └── scenario.ts                    ← Demo workflow (14/14 user stories)
│
├── docs/
│   ├── architecture.md                ← System design
│   ├── api.md                         ← HTTP API reference
│   ├── deployment.md                  ← Multi-chain deployment
│   ├── hedera-deployment.md           ← Hedera testnet step-by-step
│   ├── security.md                    ← Threat model, audit, key custody
│   ├── gas-cost-analysis.md           ← Hedera vs Base pricing
│   ├── agents.md                      ← Test agent setup
│   ├── demo.md                        ← Demo workflow details
│   └── ethdenver-hackathon.md         ← Hackathon scope + bounties
│
├── .plans/
│   ├── mvp-prd.md                     ← Product requirements (14 user stories)
│   ├── cost-optimization-analysis.md  ← v1.1 optimization roadmap
│   └── phase_*.md                     ← 15 phase implementation plans
│
├── .claude/
│   └── rules/                         ← Code standards, architecture, testing
│
├── config.yaml                        ← Tool definitions + role→permission mapping
├── .env                               ← Secrets (gitignored)
├── .env.example                       ← Configuration template
├── hardhat.config.ts                  ← Hardhat + Ignition config
├── tsconfig.json                      ← TypeScript strict mode
├── package.json                       ← Dependencies
└── pnpm-lock.yaml                     ← Locked dependency versions
```

---

## Key Concepts

### EIP-191 Signature
Agent signs request with wallet private key using EIP-191 standard:
```
message = keccak256(METHOD + "\n" + TARGET_URL + "\n" + NONCE + "\n" + TIMESTAMP)
signature = wallet.sign(message)
```
Proxy recovers signer and compares to `X-Agent-Address` header.

### Role-Based Access Control (RBAC)
```
Agent → Role (on-chain, RBAC.sol)
Role → Permission (in config.yaml)
Permission = { tool: "github", actions: ["read", "create"] }
```

### Action to HTTP Method Mapping
```
read   → GET, HEAD
create → POST
update → PUT, PATCH
delete → DELETE
```

### Audit Entry
```json
{
  "agent": "0x1234...",
  "encryptedPayload": "0xabc123...",  // Full request details, AES-256-GCM
  "payloadHash": "0x...",               // SHA-256(plaintext)
  "timestamp": 1740000000,              // Block timestamp
  "isSuccess": true,                    // Request succeeded?
  "tool": "github",                     // Which tool
  "errorType": null                     // Error code if failed
}
```

### Permission Cache
RBAC permissions cached in-memory with 5-minute TTL:
- First request: Reads from chain (~300-500ms)
- Subsequent requests: Cache hit (~1ms)
- On expiry: Refreshes from chain

### Fail-Closed Security
On chain unavailability:
- Return 503 (Service Unavailable)
- Never return 403 (Forbidden)
- This prevents denying access when unable to verify permissions
- Agent knows to retry rather than assuming access denied

---

## User Stories (14/14 Complete)

### Agent Stories
| # | Description |
|---|---|
| 1 | Authenticate via wallet signature |
| 2 | Use standard request/response format |
| 3 | Query available permissions at runtime |
| 4 | Never have direct access to keys |
| 5 | Route all 3rd party tools through proxy |
| 6 | Receive clear errors on denied access |

### Admin Stories
| # | Description |
|---|---|
| 7 | Configure tool endpoints |
| 8 | Create roles and define permissions |
| 9 | Register agents and assign roles |
| 10 | Configure keys by role |
| 11 | View all calls (success + rejected) |
| 12 | Search/filter audit logs |
| 13 | Decrypt audit logs |
| 14 | Emergency-revoke agents |

---

## Commands Reference

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start server (watch mode)
pnpm build                # TypeScript compilation
pnpm demo                 # Run demo agent

# Testing
pnpm test                 # Unit tests
pnpm test:coverage        # Coverage report (must be ≥90%)

# Quality
pnpm typecheck            # TypeScript strict mode
pnpm lint                 # ESLint
pnpm format               # Prettier (check)
pnpm format:fix           # Prettier (apply)

# Smart Contracts
pnpm contracts:build      # Compile Solidity
pnpm contracts:dev        # Start local Hardhat node
pnpm hardhat compile      # Compile contracts
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost

# Deployment
pnpm setup:dev            # Deploy contracts + register agents (local)
npx tsx scripts/register-agents.ts  # Register agents on-chain
npx tsx scripts/get-test-account-keys.ts  # Get Hardhat test keys
```

---

## Next Steps

**Already in QUICKSTART.md?** You're done with local setup. Pick your next path:

- 🔍 **Explore:** `demo/agent.ts` and `demo/scenario.ts` to see signature generation
- 🏗️ **Deploy:** Follow [docs/hedera-deployment.md](./docs/hedera-deployment.md) for testnet
- 📖 **Learn:** Read [docs/architecture.md](./docs/architecture.md) for system design
- 💻 **Contribute:** Pick an issue or explore `.plans/` for feature ideas

**Not yet started?** Go to [QUICKSTART.md](./QUICKSTART.md) now.

---

## Troubleshooting

### "Can't connect to Hardhat"
```bash
# Start Hardhat in a separate terminal
pnpm contracts:dev
```

### "Port 8080 already in use"
```bash
PORT=8081 pnpm dev
```

### ".env file not found"
```bash
cp .env.example .env
```

### "Contract address not found"
```bash
# Redeploy contracts and register agents
pnpm setup:dev
```

### "No agents discovered"
```bash
# Make sure agents are registered
pnpm setup:agents
```

### "All tests failing"
```bash
# Check TypeScript errors first
pnpm typecheck

# Then run tests
pnpm test
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/index.ts` | Server entry point |
| `src/api/server.ts` | HTTP server + middleware pipeline |
| `src/auth/` | Signature verification (EIP-191) |
| `src/rbac/` | Permission checking + caching |
| `src/audit/store.ts` | Audit queue with retry logic |
| `contracts/RBAC.sol` | On-chain permission contract |
| `contracts/Audit.sol` | On-chain audit log contract |
| `demo/agent.ts` | Demo agent with signature signing |
| `config.yaml` | Tool and role definitions |
| `.env` | Secrets (API keys, encryption key) |

---

## Getting Help

- **Questions?** Check [docs/](./docs/) directory
- **Architecture decisions?** See [docs/architecture.md](./docs/architecture.md)
- **API format?** See [docs/api.md](./docs/api.md)
- **Security concerns?** See [docs/security.md](./docs/security.md)
- **Deployment?** See [docs/hedera-deployment.md](./docs/hedera-deployment.md)
- **Costs?** See [docs/gas-cost-analysis.md](./docs/gas-cost-analysis.md)
- **Code standards?** See [CLAUDE.md](./CLAUDE.md) and `.claude/rules/`

---

**Ready to start?** → Go to [QUICKSTART.md](./QUICKSTART.md) 🚀
