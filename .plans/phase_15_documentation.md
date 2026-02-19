# Phase 15: Documentation

**Duration:** ~3-4 hours
**Depends on:** Phases 1-14
**Deliverable:** Complete user-facing and developer documentation
**Success Criteria:** All docs complete and accurate

---

## Objective

Create comprehensive documentation: README, architecture guide, API reference, deployment guide, security guide.

---

## Implementation

### README.md

```markdown
# Zuul Proxy

On-chain governance proxy for agent tool access.

Zuul is an HTTP gateway that enforces role-based access control via Ethereum-compatible smart contracts. Agents explicitly route tool calls through Zuul, which verifies signatures, checks permissions, injects API keys, and audits every request to an immutable blockchain log.

**MVP: Opt-in governance for HTTP tools. No transparent interception.**

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm
- Hardhat (for local testing)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Compile smart contracts
pnpm contracts:build

# 3. Start Hardhat local node
pnpm contracts:dev

# 4. (In another terminal) Start Zuul proxy
pnpm dev

# 5. (In another terminal) Run demo agent
pnpm demo
```

### First Request

```bash
# Discover available tools
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0x1234..." },
    "id": 1
  }'

# Execute tool call (see demo/agent.ts for signature generation)
curl -X GET http://localhost:8080/forward/https://api.github.com/repos/owner/repo \
  -H "X-Agent-Address: 0x1234..." \
  -H "X-Signature: 0xsignature..." \
  -H "X-Nonce: abc-123" \
  -H "X-Timestamp: 1708000000"
```

## Documentation

- **[Architecture](./docs/architecture.md)** — System design, module breakdown, trust boundaries
- **[API Reference](./docs/api.md)** — Endpoint specs, error codes, signature format
- **[Deployment](./docs/deployment.md)** — Configuration, secrets, multi-chain setup
- **[Security](./docs/security.md)** — Threat model, audit trail, key custody

## Features

✅ EIP-191 wallet signature verification
✅ On-chain RBAC (Ethereum-compatible chains)
✅ Async audit logging (immutable blockchain record)
✅ AES-256-GCM encryption (audit privacy)
✅ Permission caching (5-min TTL)
✅ Fail-closed on chain outage (503, never 403)
✅ Multi-chain support (Hedera, Base, Arbitrum, Optimism)
✅ HTTP forwarding with key injection
✅ JSON-RPC 2.0 API semantics

## MVP Limitations

| Limitation | Rationale | Future |
|-----------|-----------|--------|
| **Opt-in governance** | Explicit routing, no transparent interception | HTTP_PROXY + DNS interception in 2.0 |
| **HTTP-only** | Focus on core governance | WebSocket/gRPC in 2.0 |
| **Nonce storage in-memory** | MVP simplicity | Redis/SQLite persistence in 2.0 |
| **Audit queue loss on crash** | Trade-off for simplicity | Write-ahead log in 2.0 |
| **Tool-level RBAC** | MVP scope | Path-level permissions in 2.0 |
| **.env for secrets** | No external infrastructure | Vault/AWS Secrets Manager in 2.0 |

## Tech Stack

- **Runtime**: Node.js 22
- **Language**: TypeScript (strict mode)
- **HTTP**: Hono
- **Wallet**: viem (EIP-191 signatures)
- **Blockchain**: Hardhat (local), Hedera/Base/Arbitrum/Optimism (production)
- **Testing**: Vitest (90%+ coverage)
- **Logging**: pino (structured)
- **Encryption**: Node.js crypto (AES-256-GCM)

## Architecture

```
Agent (Client)
    ↓ (signs request with EIP-191)
    ↓
Zuul Proxy
    ├─ Signature Verification (auth)
    ├─ RBAC Permission Check (authz)
    ├─ Key Injection (custody)
    ├─ HTTP Forwarding
    └─ Audit Logging (async)
    ↓
Smart Contracts (Hedera/EVM)
    ├─ RBAC.sol (permission truth)
    └─ Audit.sol (immutable log)
    ↓
Upstream Tool (GitHub, Slack, etc.)
```

## Error Codes

All errors follow JSON-RPC 2.0 format:

- **-32001 to -32009**: Authentication errors (401)
- **-32010 to -32019**: Permission errors (403)
- **-32020 to -32029**: Service errors (502/503/504)
- **-32030 to -32039**: Rate limiting (429)

[Full error reference](./docs/api.md#error-codes)

## Development

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Test (unit)
pnpm test

# Test (coverage)
pnpm test:coverage

# Build
pnpm build

# Demo
pnpm demo
```

## Contributing

We follow strict code standards:

- TypeScript strict mode
- 90%+ test coverage
- No `any` types
- Structured logging (pino)
- Fail-closed security (deny on error)

## License

MIT

## Resources

- [ETHDenver 2026 Hackathon](https://www.ethdenver.com/)
- [Zuul Architecture Principles](./docs/architecture.md)
- [Smart Contract ABIs](./artifacts/)
```

### docs/architecture.md

```markdown
# Architecture

## System Overview

Zuul Proxy is a **governance layer** for agent tool access. Agents must explicitly route HTTP tool calls through Zuul, where:

1. **Authentication** verifies the agent's wallet signature (EIP-191)
2. **Authorization** checks on-chain RBAC permissions (Solidity contracts)
3. **Key Injection** inserts API keys into upstream requests
4. **Forwarding** sends the request to the real tool (GitHub, Slack, etc.)
5. **Auditing** writes an immutable record to blockchain (async, non-blocking)

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ TRUSTED: Zuul Proxy (runs in secure environment)            │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ API Keys (in-memory, never exposed)                   │  │
│ │ Encryption Keys (from env vars)                       │  │
│ │ Wallet Private Keys (runtime only, from env vars)     │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           ↑ (HTTPS only in production)
           |
        ┌──────────────────────────────────┐
        │ UNTRUSTED: Agent                 │
        │ - May be compromised             │
        │ - May be malicious               │
        │ - May attempt replay attacks     │
        │ - Cannot be trusted beyond sig   │
        └──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TRUSTED-BUT-EXTERNAL: Blockchain (Hedera/EVM)              │
│ - RBAC contract (source of truth for permissions)           │
│ - Audit contract (append-only log with dual signatures)     │
│ - Tamper-proof by consensus                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ UNTRUSTED: Upstream Tools (GitHub, Slack, etc.)             │
│ - May be compromised                                        │
│ - May timeout or error                                      │
│ - Results must be audited                                   │
└─────────────────────────────────────────────────────────────┘
```

## Module Breakdown

### 1. Authentication (`src/auth/`)

- **Signature Recovery**: EIP-191 signature verification via viem
- **Nonce Validation**: Prevents replay attacks (per-agent, 5-min TTL)
- **Timestamp Check**: Prevents stale requests (±5 minutes)

### 2. Authorization (`src/rbac/`)

- **Permission Cache**: 5-minute lazy TTL, cache miss triggers chain read
- **Contract Reader**: Reads agent role and permissions from RBAC.sol
- **Fail-Closed**: On chain outage, returns 503, never 403

### 3. Key Custody (`src/custody/`)

- **Key Loader**: Load API keys from .env at startup (fail fast on missing)
- **Key Vault**: Opaque API key handles (never exposed outside module)
- **Key Injection**: Only place where actual keys are unwrapped

### 4. Proxy Executor (`src/proxy/`)

- **Tool Registry**: Longest-prefix URL matching
- **Action Mapper**: HTTP method → RBAC action (read/create/update/delete)
- **Executor**: Forward request with key injection, parse response (JSON/binary/SSE)

### 5. Audit Logging (`src/audit/`)

- **Payload Builder**: Capture request/response context with hashes
- **Encryption**: AES-256-GCM with IV prepend (audit privacy)
- **Durable Queue**: In-memory queue with exponential backoff retry
- **Blockchain Writer**: Submit to Audit.sol with dual signatures

### 6. Chain Driver (`src/chain/`)

- **Interface**: Abstraction over blockchain interactions (chainId, RPC URL, contract calls)
- **Local Mock**: In-memory simulation for testing
- **Hedera**: Testnet via JSON-RPC relay
- **EVM**: Generic driver for Base, Arbitrum, Optimism

### 7. HTTP API (`src/api/`)

- **Hono Server**: Framework for routing and middleware
- **Middleware Pipeline**: Strict order: signature → rbac → audit → forward
- **Handlers**: `/rpc` (discovery), `/forward/*` (execution), `/health` (liveness)
- **Error Handler**: Global error catcher with JSON-RPC formatting

## Data Flow

```
Agent Signs Request
    ↓
    POST /forward/{target_url}
        + X-Agent-Address
        + X-Signature (EIP-191)
        + X-Nonce (UUID)
        + X-Timestamp (Unix seconds)
    ↓
Middleware: Signature Verification
    ↓
    Chain: Recover signer from signature
    ↓
    Nonce store: Check for reuse (replay prevention)
    ↓
    Timestamp validator: Check freshness (±5 min)
    ↓
    ✓ recoveredAddress attached to context
    ✓ NEVER use claimed address again
    ↓
Middleware: RBAC Permission Check
    ↓
    Tool registry: Extract tool from target URL (longest prefix)
    ↓
    Action mapper: Infer action from HTTP method (GET → read)
    ↓
    Permission cache: Check (tool, action) for agent (cached or chain read)
    ↓
    ✓ If cache miss + chain error: 503 -32022 (fail closed)
    ✓ If permission denied: 403 -32011 (with allowed_actions)
    ✓ If revoked: 403 -32012 (emergency)
    ↓
Middleware: Audit Setup
    ↓
    Capture request/response for later auditing
    ↓
Middleware: Key Injection
    ↓
    Key vault: Unwrap opaque key handle
    ↓
    Add Authorization header to upstream request
    ↓
Handler: Forward Request
    ↓
    HTTP call to upstream tool (GitHub, Slack, etc.)
    ↓
    ✓ Timeout enforcement (30s read, 60s write)
    ↓
    Parse response (JSON/binary/SSE)
    ↓
Middleware: Audit (Post-Response, Async)
    ↓
    Encrypt audit payload (AES-256-GCM)
    ↓
    Queue for blockchain (non-blocking)
    ↓
    Background: Retry with exponential backoff (3 attempts, 100ms base, full jitter)
    ↓
Response Wrapping
    ↓
    JSON: { result, _governance }
    Binary: body + X-Governance header
    SSE: inject _governance as first event
    ↓
Agent Receives Response
    ↓
    Verify requestId matches audit
    ↓
    Check governance metadata for audit_tx (blockchain reference)
```

## Fail-Closed Principle

**Security Invariant**: On any verification failure, deny access. Never grant access due to error.

### Examples

1. **Chain Outage**: Return 503 -32022 (fail closed)
   - NOT 403 (which would mean "permission denied")
   - Forces agent to retry later when chain recovers

2. **Nonce Reuse**: Return 401 -32004 (replay attack)
   - Reject immediately, even if nonce is valid by other metrics

3. **Timestamp Drift**: Return 401 -32005 (stale request)
   - Reject immediately, regardless of signature validity

## MVP Assumptions (Documented)

- **Opt-in governance**: Agent must explicitly route through Zuul (no transparent interception)
- **HTTP-only**: No WebSocket, gRPC, SSH in MVP
- **No native MCP**: Agent cannot use GitHub MCP, Slack MCP directly; only HTTP tools
- **In-memory RBAC cache**: Loss on restart (acceptable for hackathon MVP)
- **In-memory nonce store**: Loss on restart (acceptable for short-lived demo)
- **Audit queue loss on crash**: No write-ahead log (acceptable for MVP)
- **Tool-level RBAC**: No path-level permissions (e.g., `/repos/*/admin` vs `/repos/*/read`)
- **.env for secrets**: No Vault/AWS Secrets Manager (acceptable for testnet)

## Stretch Goals (2.0)

- **Transparent HTTP Interception**: Set HTTP_PROXY env var on agent, intercept all HTTP calls
- **Native MCP Support**: Zuul acts as MCP gateway for GitHub, Slack MCP servers
- **Path-Level RBAC**: Fine-grained permissions per endpoint (e.g., `/repos/{owner}/{repo}/issues` vs `/repos/{owner}/{repo}/pulls`)
- **WebSocket/gRPC/SSH**: Non-HTTP protocol support
- **Redis/SQLite Persistence**: Durable nonce and cache storage
- **Vault Integration**: External secrets management
- **Multi-Sig Audit**: Multiple validators sign audit entries

## Performance Characteristics

- **Signature Recovery**: ~10ms (viem)
- **Cache Hit**: ~1ms (in-memory Map)
- **Cache Miss + Chain Read**: ~200-500ms (chain latency + retry backoff)
- **Key Injection**: <1ms (in-memory table lookup)
- **HTTP Forward**: Depends on upstream (typically 100-1000ms)
- **Audit Queueing**: <1ms (non-blocking enqueue)
- **Total P50 Latency**: ~100-200ms (with cache hit)
- **Total P95 Latency**: ~500-1000ms (with chain read or upstream latency)

## Security Considerations

1. **Signature Verification**: Always use recovered signer, never claimed address
2. **Nonce Replay**: Scoped to agent address, not global
3. **Timestamp Freshness**: ±5 minutes window (prevents old request acceptance)
4. **Key Storage**: Opaque branded types, never serialized, only in-memory
5. **Audit Encryption**: Private to proxy, only timestamp + hashes on-chain
6. **Fail-Closed**: Chain outage returns error, never grants access
7. **Rate Limiting**: Reserved for Phase 2.0 (not in MVP)
8. **Transport Security**: HTTPS-only in production (enforced in config)
```

### docs/api.md

(See Phase 11 for full API specification)

### docs/deployment.md

```markdown
# Deployment Guide

## Local Development

### Prerequisites

- Node.js 22+
- pnpm
- Hardhat

### Setup

```bash
pnpm install
pnpm contracts:build
pnpm contracts:dev  # Terminal 1: Hardhat local node
pnpm dev            # Terminal 2: Zuul proxy
pnpm demo           # Terminal 3: Demo agent
```

## Testnet Deployment (Hedera)

### Environment Setup

Create `.env`:

```bash
# Hedera Testnet
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=0xprivatekey...
HEDERA_RPC_URL=https://testnet.hashio.io/api

# Zuul Configuration
PROXY_HOST=0.0.0.0
PROXY_PORT=8080
PROXY_LOG_LEVEL=info

# API Keys
GITHUB_API_KEY=github_pat_xxxxx
SLACK_BOT_TOKEN=xoxb-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Audit
AUDIT_ENCRYPTION_KEY=0123456789abcdef...
```

### Deploy Contracts

```bash
pnpm contracts:build
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet
```

### Start Proxy

```bash
pnpm build
PORT=8080 pnpm start
```

### Verify Deployment

```bash
curl http://localhost:8080/health
```

## Docker Deployment

### Build Image

```bash
docker build -t zuul-proxy:latest .
```

### Run Container

```bash
docker run -d \
  -p 8080:8080 \
  -e HEDERA_ACCOUNT_ID=0.0.xxxxx \
  -e HEDERA_PRIVATE_KEY=0x... \
  -e GITHUB_API_KEY=github_pat_... \
  zuul-proxy:latest
```

## Multi-Chain Deployment

Zuul supports deploying to multiple EVM-compatible chains:

### Supported Chains

| Chain | Chain ID | RPC | Status |
|-------|----------|-----|--------|
| Hedera Testnet | 295 | https://testnet.hashio.io/api | ✅ MVP |
| Base Testnet | 84532 | https://sepolia.base.org | ✅ MVP |
| Arbitrum Testnet | 421614 | https://sepolia-rollup.arbitrum.io/rpc | ✅ MVP |
| Optimism Testnet | 11155420 | https://sepolia.optimism.io | ✅ MVP |

### Deploy to Multiple Chains

```bash
# Deploy to Hedera
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet

# Deploy to Base
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network baseTestnet

# Deploy to Arbitrum
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network arbitrumTestnet
```

Contracts maintain identical bytecode across chains. Deployment addresses are stored in `ignition/deployments/{chain}/deployed_addresses.json`.

## Configuration File

See `config.yaml.example`:

```yaml
server:
  host: 0.0.0.0
  port: 8080
  readTimeoutMs: 30000
  writeTimeoutMs: 60000

chain:
  name: hedera
  chainId: 295
  rpcUrl: https://testnet.hashio.io/api

cache:
  ttlSeconds: 300

tools:
  - key: github
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
    description: GitHub API
    endpoints:
      - path: /repos/{owner}/{repo}/issues
        methods: [GET, POST]
        description: Manage issues

  - key: slack
    baseUrl: https://slack.com/api
    keyRef: SLACK_BOT_TOKEN
    description: Slack API
    endpoints:
      - path: /conversations.list
        methods: [GET]
        description: List conversations

roles:
  - id: developer
    description: Developer role
    permissions:
      github: [read, create]
      slack: [read]

  - id: admin
    description: Admin role
    permissions:
      github: [read, create, update, delete]
      slack: [read, create, update, delete]
```

## Monitoring

### Health Check

```bash
curl http://localhost:8080/health
```

### Logs

View structured logs:

```bash
pnpm dev | jq '.msg, .requestId, .agent, .tool, .action'
```

### Metrics

Check audit queue metrics:

```bash
curl http://localhost:8080/metrics
```

(Deferred to Phase 2.0)
```

### docs/security.md

```markdown
# Security

## Threat Model

### Adversaries

1. **Compromised Agent**: May have stolen private key, attempt replay attacks
2. **Network Attacker**: May intercept requests (HTTPS prevents in production)
3. **Malicious Tool**: May return false data, timeout, or error
4. **Chain Validator**: May (extremely unlikely) attempt to rewrite audit log

### Attack Vectors

| Attack | Mitigation | Status |
|--------|-----------|--------|
| Replay attack | Nonce validation (per-agent, 5-min TTL) | ✅ |
| Stale request | Timestamp check (±5 min window) | ✅ |
| Signer mismatch | Use recovered signer, not claimed address | ✅ |
| Permission escalation | RBAC cache with fail-closed | ✅ |
| Key exposure | Opaque handles, never logged/serialized | ✅ |
| Chain outage | Return 503 error (fail-closed), never grant access | ✅ |
| Audit tampering | Blockchain immutability + dual signatures | ✅ |
| HTTPS bypass | HTTPS-only enforcement in production (config) | ✅ |

## Signature Verification

All requests are verified using EIP-191:

```
Message Format: {METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}
Hash Algorithm: keccak256 (via viem)
Signature Format: EIP-191 standard
Recovery: viem.recoverMessageAddress()
```

### Verification Steps

1. Parse X-Agent-Address, X-Signature, X-Nonce, X-Timestamp headers
2. Build canonical payload: `{METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}`
3. Recover signer address from signature
4. Verify recovered address matches claimed address
5. Check nonce not used before (replay prevention)
6. Check timestamp within ±5 minutes (freshness)
7. **Use recovered address for all future checks (NOT claimed address)**

### Why Not Claimed Address?

Agents might claim a different address in X-Agent-Address than what actually signed. We must use the recovered (proven) address, otherwise:

- Attacker could claim different agent to bypass permissions
- Audit would record wrong agent

## RBAC and Fail-Closed

Permission checks follow **fail-closed** principle:

1. **Cache Hit (5-min TTL)**: Use cached permissions (fast)
2. **Cache Miss + Chain Success**: Read from RBAC contract, cache result
3. **Cache Miss + Chain Error**: Return 503 SERVICE_UNAVAILABLE (fail closed)
   - NOT 403 Forbidden (which implies permission denied)
   - Signals temporary issue, not permanent denial
   - Forces agent to retry when chain recovers

This ensures that chain outages never accidentally grant access.

## Audit Trail

Every request (success or failure) is audited:

### What's Recorded

- Agent address (recovered, not claimed)
- Tool name
- Action (read/create/update/delete)
- Target URL
- HTTP method and response status
- Latency (milliseconds)
- Request hash (SHA-256 of body)
- Response hash (SHA-256 of body)
- **Error type** (if applicable)

### What's Encrypted

All audit payloads are encrypted with AES-256-GCM before writing to blockchain:

- Plaintext: Full request/response context
- Ciphertext: Stored on blockchain
- Decryption key: Stored securely (only admin can decrypt)

### What's Public (On-Chain)

- Timestamp
- Payload hash (SHA-256, non-invertible)
- Signature hashes (proof of agent + proxy)
- Agent address (**note**: not encrypted, allows querying audit trail)

### Dual Signatures

Each audit entry is signed twice:

1. **Agent Signature** (original X-Signature from request header)
2. **Proxy Signature** (proxy signs payload hash with private key)

This allows independent verification:

- Agent's crypto provider verified via signature recovery
- Proxy's authenticity verified via proxy signature

## Key Custody

API keys are handled with extreme care:

### Storage

- Loaded from `.env` at startup
- Fail fast if any key missing
- Never stored in config files or logs
- Kept in-memory Map with opaque handles

### Exposure

- Only `inject()` method unwraps actual keys
- Keys only exposed to HTTP library (in-memory)
- Never logged, serialized, or returned in responses
- Pino logger redacts `ApiKeyHandle` at transport level

### Rotation

To rotate API keys:

1. Update `.env`
2. Restart proxy
3. Keys are reloaded at startup

(Defer to Phase 2.0: Dynamic key rotation without restart)

## Transport Security

### Local Development

- HTTP allowed (http://localhost:8080)
- Useful for testing and demo

### Production

- HTTPS-only enforcement (config flag)
- If HTTP detected on production chain: 400 error
- TLS termination: Via reverse proxy (nginx, AWS ALB, etc.)

## Testing for Security

Unit test coverage includes:

- ✅ Valid signatures accept correct signer
- ✅ Invalid signatures rejected (401 -32002)
- ✅ Signer mismatch detected (401 -32002)
- ✅ Nonce reuse detected (401 -32004)
- ✅ Timestamp drift detected (401 -32005)
- ✅ Permission denied returns 403 -32011 with allowed_actions
- ✅ Emergency revoke returns 403 -32012
- ✅ Chain outage returns 503 -32022 (fail closed)
- ✅ Key injection verified (API key present in upstream headers)
- ✅ Audit entries queued and encrypted

## Incident Response

### Compromised Agent Private Key

1. Admin calls `emergencyRevoke(agentAddress)` in RBAC contract
2. Agent immediately denied all requests (403 -32012)
3. New agent can re-register with different private key

### Chain Outage

1. All permission checks return 503 SERVICE_UNAVAILABLE (fail-closed)
2. Agents know to retry later
3. Requests are blocked with 503 (temporary blockage, not permanent 403 denial)
4. Audit queue continues to accumulate (retry with backoff)

### API Key Compromise

1. Update key in `.env`
2. Restart proxy (key reloaded)
3. New requests use updated key
4. Old key can be revoked on upstream tool

## Compliance Notes

- **GDPR**: Audit logs contain agent addresses (public wallet addresses, not personally identifiable)
- **SOC 2**: Immutable audit trail on blockchain (3rd party validators)
- **Data Encryption**: AES-256-GCM (FIPS 140-2 compatible cipher)
- **Signature Algorithm**: EIP-191 (standardized by Ethereum community)
```

---

## Acceptance Criteria

- ✅ README.md complete with quickstart and feature overview
- ✅ docs/architecture.md explains system design and trust boundaries
- ✅ docs/api.md documents all endpoints and error codes
- ✅ docs/deployment.md guides local dev, testnet, Docker, multi-chain
- ✅ docs/security.md covers threat model, audit trail, key custody
- ✅ All docs use kebab-case filenames, no root-level docs (except README)
- ✅ Links in README point to docs/
- ✅ Planning documents in .plans/ only
- ✅ No duplicated content across files
- ✅ MVP limitations documented and justified

---

## Commands

```bash
touch README.md docs/{architecture,api,deployment,security}.md

# (Copy implementations above)

pnpm typecheck

git add README.md docs/
git commit -m "Phase 15: Documentation — README, architecture, API, deployment, security guides"
```

---

## What's NOT in Phase 15

- Video tutorials (defer to 2.0)
- Interactive API explorer (defer to 2.0)
- SDK documentation (no SDK in MVP)
- Governance token documentation (defer to 2.0)
