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
        ┌──────────────────────────────┐
        │ UNTRUSTED: Agent             │
        │ - May be compromised         │
        │ - May be malicious           │
        │ - May attempt replay attacks │
        │ - Cannot be trusted beyond   │
        │   signature verification     │
        └──────────────────────────────┘

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
