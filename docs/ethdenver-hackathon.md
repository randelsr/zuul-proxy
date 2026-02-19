# ETHDenver 2026 Hackathon Project

**Status:** ✅ COMMITTED (as of 2026-02-16)
**Event:** ETHDenver Feb 21-23, 2026 (BUIDL Week before)

## Project: On-Chain Agent Access Proxy

**One-liner:** "OpenRouter for agent tool access" with governance + immutable audit

### The Problem
Agents aren't trustworthy with keys and access. The OpenClaw/ClawHub security incidents (Feb 2026) prove the market timing is NOW.

### Market Validation (vulnu.com article, 2026-02-16)
Article: "The problem isn't OpenClaw. It's the architecture."

Key quotes that validate the project:
- "Agent + tools + marketplace is a new attack surface"
- "A prompt is not a security boundary. It's a suggestion."
- "We're deploying autonomous execution engines faster than we're defining the security model around them"
- The "lethal trifecta": agent can access private data + ingest untrusted content + communicate externally

The article's "grown-up agent security" checklist maps DIRECTLY to the project:
| Their Recommendation | Your Solution |
|---------------------|---------------|
| Scope credentials like you mean it | On-chain RBAC permissions contract |
| Restrict tools, don't "ask nicely" | Proxy enforces hard controls |
| Log actions, not just the chat | Blockchain audit trail (immutable) |
| Treat skills like dependencies | Governance layer for all tool access |

### Core Solution
1. **Proxy holds all keys** - agents never see them, injected at request time
2. **On-chain RBAC contract** - permissions granted per agent, agent-aware
3. **Blockchain audit log** - every access request published (encrypted), immutable
4. **Third-party viewer** - decode audit log for compliance/verification
5. **ZK proofs** (roadmap) - prove authorization without revealing what was accessed

### Market Gap
| Feature | SecretAgent | Kite AI | **This Project** |
|---------|-------------|---------|------------------|
| API key proxy | ✅ | ❌ | ✅ |
| RBAC permissions | ❌ | ✅ (spending) | ✅ (access) |
| Permissions on-chain | ❌ | Partial | ✅ |
| Audit log on blockchain | ❌ | ❌ | ✅ |
| ZK privacy | ❌ | ❌ | ✅ (roadmap) |

### MVP User Stories (Committed 2026-02-16)

**Agent Stories:**
| # | As a... | I want to... | So that... |
|---|---------|--------------|------------|
| 1 | Agent | Authenticate to the proxy (wallet sig / credential) | Proxy can verify my identity before any request |
| 2 | Agent | Use a standard interface contract for requests and responses | Any agent can integrate without custom implementation |
| 3 | Agent | Query my available permissions at runtime | I know what I can do before attempting |
| 4 | Agent | Never have direct access to keys | Keys can't leak through my context |
| 5 | Agent | Use proxy endpoint for all 3rd party tools | Access is governed and logged |
| 6 | Agent | Receive clear errors on denied access | I can handle failures gracefully |

**Admin Stories:**
| # | As a... | I want to... | So that... |
|---|---------|--------------|------------|
| 7 | Admin | Add and configure tool endpoints (GitHub, Slack, etc.) | Proxy knows which tools exist and how to reach them |
| 8 | Admin | Create roles and define permissions for each role | I can set up access policies before assigning agents |
| 9 | Admin | Register agents and assign roles | Control who can do what |
| 10 | Admin | Configure keys by role | Manage access at scale |
| 11 | Admin | See all calls through proxy (success + rejected) | Full visibility |
| 12 | Admin | Search and filter audit logs (by agent, tool, time, status) | I can investigate specific events |
| 13 | Admin | Decrypt audit logs | Investigate sensitive details when needed |
| 14 | Admin | Configure audit driver (local / blockchain) | Flexibility per deployment |
| 15 | Admin | Configure RBAC driver (local / on-chain) | Flexibility per deployment |
| 16 | Admin | Emergency-revoke an agent | Kill switch for rogue agents |

**Key Decisions:**
- Admin interface: Config file + CLI (no UI for hackathon)
- ZK proofs: **CUT** — pitch as roadmap, not MVP
- **Wallet identity: MODULAR** — Interface-driven, supports any wallet (Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA). Agent registers with any supported wallet, proxy doesn't care which.
- **Chain layer: MODULAR (EVM only)** — Same Solidity contracts deploy to any EVM chain. Chain driver is config-driven. Hedera for demo (bounty alignment), pitch portability to Base/Arbitrum as feature. Solana = different VM, cut from scope.
- **Auth flow: PER-REQUEST SIGNING (MVP)** — Every request signed by agent wallet. Signature = cryptographic proof of intent. ~1-5ms overhead acceptable for agents. Audit log contains irrefutable evidence of each action. **STRETCH:** Short-lived JWT option for high-throughput/low-risk tools (configurable per-tool).
- **Protocol scope: HTTP/HTTPS only** — covers 90%+ of tool APIs (GitHub, Slack, OpenAI, etc.). WebSocket, gRPC, SSH are post-hackathon extensions.
- **Demo agent: OpenClaw integration** — write an OpenClaw skill so the demo is hyper-relevant to the security narrative. "Everyone's talking about OpenClaw security. Here's the fix, running ON OpenClaw."
- **RBAC caching: Lazy TTL for MVP** — cache permissions with configurable TTL, read from chain only on cache miss/expiry. Event-based invalidation is stretch goal.
- **MVP Communication Protocol: HTTP API with MCP semantics** — Zuul exposes an HTTP API (POST endpoint) using JSON-RPC 2.0 request/response pattern. Supports tool discovery (`tools/list`) and execution (`tools/call`). **Agent MUST explicitly configure Zuul as HTTP endpoint.** This is NOT the MCP protocol (which uses STDIO/Streamable HTTP) — it's HTTP with MCP-like semantics for discoverability and governance. **Known Limitation:** Governance is opt-in (agent chooses to route through Zuul). Documented in demo as assumption.
- **Transparent HTTP interception (STRETCH)** — Future (2.0): Add `HTTP_PROXY` environment variable support so agents make normal HTTP calls that transparently route through Zuul. Requires network isolation to prevent bypass.
- **Native MCP server support (STRETCH)** — Future (2.0): Support agents connecting to native MCP servers (GitHub MCP, Slack MCP) with governance enforcement via MCP gateway logic. Requires network isolation.
- **Observability: OpenTelemetry (OTEL)** — **STRETCH**. Industry standard for traces, metrics, logs. MVP focuses on blockchain audit log (the differentiator).

### Auth Flow: Per-Request Signing (Decided 2026-02-18)

**MVP:** Every request signed by agent wallet. No session tokens.

```
┌─────────────────────────────────────────────────────┐
│ EVERY REQUEST                                       │
│                                                     │
│ Agent builds request:                               │
│   {                                                 │
│     "tool": "github",                               │
│     "action": "create_issue",                       │
│     "params": { ... },                              │
│     "nonce": "unique-per-request",                  │
│     "timestamp": "2026-02-18T14:19:00Z"             │
│   }                                                 │
│                                                     │
│ Agent signs: signature = wallet.sign(hash(request)) │
│                                                     │
│ Agent sends:                                        │
│   POST /proxy                                       │
│   X-Agent-Address: 0x1234...                        │
│   X-Signature: 0x9876...                            │
│   Body: { request }                                 │
│                                                     │
│ Proxy verifies:                                     │
│   1. Recover signer from signature                  │
│   2. Check signer matches X-Agent-Address           │
│   3. Check nonce not reused (replay protection)     │
│   4. Check timestamp fresh (±5 min)                 │
│   5. Check wallet has permission (RBAC contract)    │
│   6. Execute request, log to audit (with sig)       │
└─────────────────────────────────────────────────────┘
```

**Why this works for agents:**
- Signing is a function call, not UX friction (~1-5ms)
- Network latency to tools (50-500ms) dwarfs signing overhead
- Every audit log entry has cryptographic proof of intent
- Legally defensible for compliance use cases

**STRETCH: JWT mode**
- Configurable per-tool: `require_signature: true/false`
- High-risk tools: signed
- Low-risk/high-throughput tools: JWT after initial wallet verify

### Key Mapping & Permission Model (Decided 2026-02-18)

**Model:** Agent → Role → Permission → Key

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT                                                      │
│  - Wallet address (identity)                                │
│  - Assigned to one Role                                     │
├─────────────────────────────────────────────────────────────┤
│  ROLE                                                       │
│  - Name (e.g., "developer", "admin")                        │
│  - Has many Permissions                                     │
├─────────────────────────────────────────────────────────────┤
│  PERMISSION                                                 │
│  - tool: "github"                                           │
│  - actions: ["read", "create", "update"]                    │
│  - active_key: "key_123"                                    │
│  - available_keys: ["key_123", "key_456"]  // for rotation  │
└─────────────────────────────────────────────────────────────┘
```

**Gateway Responsibilities:**

| Layer | What Gateway Does | What Gateway Does NOT Do |
|-------|-------------------|--------------------------|
| **Authentication** | Verify agent wallet signature | — |
| **Authorization** | Check if role has permission for tool + action | Validate key actually has those scopes at service |
| **Enforcement** | Map actions → HTTP methods, reject mismatches | Understand service-specific auth models |
| **Key Injection** | Inject key from Permission into request | Expose key to agent |

**HTTP Method Inference (MVP):**

| Permission Action | Allowed HTTP Methods |
|-------------------|---------------------|
| `read` | GET, HEAD |
| `create` | POST |
| `update` | PUT, PATCH |
| `delete` | DELETE |

**Request Flow:**
```
1. Agent signs request: { tool: "github", action: "create", endpoint: "/repos/issues", body: {...} }
2. Gateway verifies signature, recovers wallet
3. Gateway lookups: Agent → Role → Permission for "github"
4. Gateway checks: Does permission include "create"? ✅
5. Gateway infers: "create" → POST allowed? ✅
6. Gateway injects: active_key from permission
7. Gateway forwards: POST /repos/issues with key in header
8. GitHub authorizes based on key scopes (gateway doesn't care)
9. Gateway logs: agent, tool, action, result, signature (audit trail)
```

**Why This Works:**

1. **Separation of concerns:** Gateway handles access governance, services handle their own auth. No need to understand every service's permission model.

2. **Key custody maintained:** Agent never sees the key. Can't leak what you don't have.

3. **Flexible granularity:** Permissions are action-level (read/create/update/delete), but key is per-tool. Admin assigns appropriately-scoped keys.

4. **Key rotation built-in:** `available_keys` pool allows rotation without config change. Just swap `active_key`.

5. **Audit trail complete:** Signature proves intent, permission proves authorization, key proves which credential was used.

**Caveats (Future Concerns):**

| Caveat | Impact | Mitigation |
|--------|--------|------------|
| REST doesn't always map to CRUD | `POST /search` is a read, GraphQL everything is POST | **STRETCH:** Per-tool config override for action → method mapping |
| Admin misconfiguration | Permission says "create", key is read-only → gateway allows, service rejects | Admin's responsibility. Add optional "test permission" CLI command post-MVP. |
| Action granularity varies | Some APIs have 4 actions, some have 20 | Start with CRUD. Extend to custom actions per-tool post-MVP. |
| Non-HTTP protocols | WebSocket, gRPC don't have methods | Out of scope for MVP (HTTP/HTTPS only). Extend later. |

**STRETCH: Per-Tool Config Override**
```yaml
tools:
  github:
    action_mapping:
      read: [GET, HEAD]
      create: [POST]
      update: [PUT, PATCH]
      delete: [DELETE]
  graphql:
    action_mapping:
      read: [POST]    # GraphQL queries via POST
      create: [POST]  # GraphQL mutations via POST
    # Additional logic: inspect query vs mutation in body (future)
```

### Error Responses (Decided 2026-02-18)

**Principle:** HTTP status code for transport, JSON-RPC error code + message for semantics.

**Error Mapping:**

| Scenario | HTTP | JSON-RPC Code | Message | `_governance.error_type` |
|----------|------|---------------|---------|--------------------------|
| **Success** | 200 | *(none - result field present)* | — | — |
| **Auth: Missing signature** | 401 | -32001 | "Missing signature" | `auth/missing_signature` |
| **Auth: Invalid signature** | 401 | -32002 | "Invalid signature" | `auth/invalid_signature` |
| **Auth: Wallet not registered** | 401 | -32003 | "Wallet not registered" | `auth/unknown_wallet` |
| **Auth: Nonce expired/reused** | 401 | -32004 | "Invalid nonce" | `auth/invalid_nonce` |
| **Permission: No tool access** | 403 | -32010 | "Permission denied: no access to tool" | `permission/no_tool_access` |
| **Permission: No action access** | 403 | -32011 | "Permission denied: action not allowed" | `permission/no_action_access` |
| **Permission: Wallet revoked** | 403 | -32012 | "Wallet revoked" | `permission/revoked` |
| **Request: Malformed** | 400 | -32600 | "Invalid request" | `request/malformed` |
| **Request: Tool not found** | 404 | -32013 | "Tool not found" | `request/unknown_tool` |
| **Service: Upstream error** | 502 | -32020 | "Service error" | `service/upstream_error` |
| **Service: Timeout** | 504 | -32021 | "Service timeout" | `service/timeout` |
| **Service: Unavailable** | 503 | -32022 | "Service unavailable" | `service/unavailable` |
| **Rate: Limit exceeded** | 429 | -32030 | "Rate limit exceeded" | `rate/exceeded` |
| **Internal: Gateway error** | 500 | -32603 | "Internal error" | `internal/error` |

**Code Ranges:**
- `-32001 to -32009`: Auth errors
- `-32010 to -32019`: Permission errors
- `-32020 to -32029`: Service/upstream errors
- `-32030 to -32039`: Rate limiting
- `-32600, -32603`: Standard JSON-RPC (malformed, internal)

**Success Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": { ... },
  "_governance": {
    "agent": "0x1234...",
    "tool": "github",
    "action": "create",
    "latency_ms": 142,
    "audit_tx": "0xabcd..."
  }
}
```

**Error Response (Permission Denied):**
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32011,
    "message": "Permission denied: action not allowed",
    "data": {
      "tool": "github",
      "action": "delete",
      "allowed_actions": ["read", "create"]
    }
  },
  "_governance": {
    "agent": "0x1234...",
    "error_type": "permission/no_action_access",
    "audit_tx": "0xabcd..."
  }
}
```

**Error Response (Auth Failure):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32002,
    "message": "Invalid signature",
    "data": {
      "expected_signer": "0x1234...",
      "recovered_signer": "0x5678..."
    }
  },
  "_governance": {
    "error_type": "auth/invalid_signature"
  }
}
```

**Error Response (Service Error):**
```http
HTTP/1.1 502 Bad Gateway
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32020,
    "message": "Service error",
    "data": {
      "tool": "github",
      "upstream_status": 500,
      "upstream_message": "Internal Server Error"
    }
  },
  "_governance": {
    "agent": "0x1234...",
    "error_type": "service/upstream_error",
    "audit_tx": "0xabcd..."
  }
}
```

**Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| HTTP codes for transport | Load balancers, proxies, monitoring tools understand HTTP |
| JSON-RPC codes for semantics | Agent can programmatically handle specific errors |
| `_governance` on ALL responses | Consistent audit trail, even on errors |
| `error.data` for context | Agent knows what went wrong + what's allowed |
| Audit logged on errors too | "Agent X attempted Y, denied" is valuable signal |

### Audit Content (Decided 2026-02-18)

**Principle:** Timestamp public, everything else encrypted. Only authorized parties can read audit details.

**Why encrypt?**

| Audience | Should they see audit details? |
|----------|-------------------------------|
| Admin (deployed the agent) | ✅ Yes |
| Compliance auditor | ✅ Yes (authorized) |
| Random blockchain observers | ❌ No |
| Competitors | ❌ Definitely not |

Plaintext metadata on public chain = leaking competitive intelligence:
- What tools agents use
- Activity patterns
- Endpoint paths (could reveal projects, repos, etc.)

**On-Chain Structure:**

```json
{
  "audit_id": "uuid-1234",
  "timestamp": "2026-02-18T15:25:00Z",
  "encrypted_payload": "<encrypted blob>",
  "payload_hash": "0xabc123...",
  "agent_signature": "0x9876..."
}
```

| Field | Visibility | Purpose |
|-------|------------|---------|
| `audit_id` | Public | Unique identifier |
| `timestamp` | Public | When it happened |
| `encrypted_payload` | Private (encrypted) | All audit details |
| `payload_hash` | Public | Verify decrypted content matches |
| `agent_signature` | Public | Prove agent committed to this payload |

**Encrypted Payload Contents (decrypted by admin):**

```json
{
  "agent": "0x1234...",
  "tool": "github",
  "action": "create",
  "endpoint": "/repos/secret-project/issues",
  "status": "success",
  "latency_ms": 142,
  "request_hash": "0xdef...",
  "response_hash": "0xghi...",
  "error_type": null
}
```

**Verification Flow:**

```
1. Admin decrypts encrypted_payload with key
2. Hash decrypted content
3. Compare hash to on-chain payload_hash
4. If match → content is authentic and unmodified
5. Agent signature on payload_hash → agent committed to this exact content
```

**Security Properties:**

| Property | How It's Achieved |
|----------|-------------------|
| **Privacy** | Payload encrypted. Only admin with key can read. |
| **Immutability** | On-chain. Can't be deleted or modified. |
| **Non-repudiation** | Agent signed `payload_hash`. Can't deny commitment. |
| **Verifiability** | Decrypt → hash → compare. Proves no tampering. |
| **Third-party audit** | Admin shares key (or decrypted logs) with auditor. |

**What's Public:**
- Timestamp (when something happened)
- That an audit entry exists
- The hash and signature (integrity proof)

**What's Private:**
- Agent identity
- Tool and action
- Endpoint path
- Status and latency
- Request/response hashes

**Key Management:**

| Concern | Approach |
|---------|----------|
| Key generation | Admin generates at gateway setup |
| Key storage | Vault, KMS, HSM (enterprise) |
| Key loss | Can prove entries exist, can't read them |
| **STRETCH:** Key escrow/backup | Enterprise feature for key recovery |

**Full Request/Response Content:**

Not stored on-chain (too expensive, too much data). Options:
- **MVP:** Hashes only (`request_hash`, `response_hash` in encrypted payload)
- **Enterprise:** Off-chain encrypted store, linked by hash for verification

### Tool Discovery (Decided 2026-02-18)

**Mechanism:** MCP `tools/list`, filtered by agent's permissions.

Agent calls `tools/list` → sees only tools/actions they have access to:

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": {
    "tools": [
      {
        "name": "github",
        "description": "GitHub API",
        "actions": ["read", "create"],
        "endpoints": [
          {
            "path": "/repos/{owner}/{repo}/issues",
            "methods": ["GET", "POST"],
            "schema": { ... }
          }
        ]
      },
      {
        "name": "slack",
        "description": "Slack API",
        "actions": ["read"],
        "endpoints": [
          {
            "path": "/conversations.list",
            "methods": ["GET"],
            "schema": { ... }
          }
        ]
      }
    ]
  },
  "_governance": {
    "agent": "0x1234...",
    "role": "developer"
  }
}
```

**Response fields:**

| Field | Purpose |
|-------|---------|
| `name` | Tool identifier |
| `description` | Human-readable description |
| `actions` | What this agent can do (filtered by permission) |
| `endpoints` | Available paths + methods (filtered by actions) |
| `schema` | Input/output schema for each endpoint |

**Why filter by permission?**
- Security: Agent doesn't know about tools it can't access
- UX: Agent only sees relevant options
- Least privilege: No temptation to try unauthorized tools

### Gateway Configuration & Key Storage (Decided 2026-02-18)

**Principle:** Separate tool config from secrets. Keys never in config files.

**Config file (safe to commit):**
```yaml
tools:
  github:
    description: "GitHub API"
    base_url: "https://api.github.com"
    key_ref: "GITHUB_API_KEY"  # env var reference
    endpoints:
      - path: "/repos/{owner}/{repo}/issues"
        methods: [GET, POST]
        schema: { ... }
  slack:
    description: "Slack API"
    base_url: "https://slack.com/api"
    key_ref: "SLACK_API_KEY"
    endpoints:
      - path: "/conversations.list"
        methods: [GET]

roles:
  developer:
    permissions:
      - tool: github
        actions: [read, create]
      - tool: slack
        actions: [read]
  admin:
    permissions:
      - tool: github
        actions: [read, create, update, delete]
      - tool: slack
        actions: [read, create]
```

**Key storage (MVP): `.env` file (gitignored)**
```bash
# .env (never committed)
GITHUB_API_KEY=ghp_abc123...
SLACK_API_KEY=xoxb-789xyz...
AUDIT_ENCRYPTION_KEY=<32-byte-key>
```

**At startup:** Gateway loads `.env`, resolves `key_ref` → actual key.

**What goes where:**

| Data | Location | Committed? |
|------|----------|------------|
| Tool definitions (endpoints, schemas) | `config.yaml` | ✅ Yes |
| Role → permission mappings | `config.yaml` | ✅ Yes |
| API keys | `.env` | ❌ Never |
| Audit encryption key | `.env` | ❌ Never |

**Enterprise (post-hackathon):** Vault, AWS Secrets Manager, KMS integration.

### Chain Modularity (Researched 2026-02-18)

**Finding:** All EVM-compatible chains (Base, Arbitrum, Optimism, Hedera) can share the same Solidity contracts. Chain interaction is abstracted behind a driver interface.

| Chain | Solidity | Tooling | Chain ID | Notes |
|-------|----------|---------|----------|-------|
| Base | ✅ Same | viem/ethers | 8453 | OP Stack L2 |
| Arbitrum | ✅ Same | viem/ethers | 42161 | Nitro L2 |
| Optimism | ✅ Same | viem/ethers | 10 | OP Stack L2 |
| Hedera | ✅ Same | viem/ethers via JSON-RPC Relay | 295 | Minor quirk: stateRoot returns empty trie |

**Solana:** Different VM (SVM), uses Rust not Solidity. Would require parallel implementation. **CUT from hackathon.**

**Architecture:**
```
┌─────────────────────────────────────────┐
│  ChainDriver Interface                  │
│  - deploy_contract(bytecode) → address  │
│  - call_contract(address, method, args) │
│  - read_events(address, filter)         │
│  - get_rpc_url() → string               │
├─────────────────────────────────────────┤
│  Implementations (config-driven):       │
│  - HederaDriver (demo, bounty)          │
│  - BaseDriver (Coinbase ecosystem)      │
│  - ArbitrumDriver                       │
│  - OptimismDriver                       │
└─────────────────────────────────────────┘
```

**Hackathon strategy:** Demo on Hedera (bounty alignment). Pitch multi-chain portability as differentiation. "Deploy once, govern everywhere."

### Enforcement Model

**Key Insight:** Custody IS enforcement — agents can't leak keys they don't have. But custody only covers keyed services. Full governance requires network control.

**Three Enforcement Layers:**

| Layer | What it does | Scope | Status |
|-------|--------------|-------|--------|
| **1. Key Custody** | Agent never has keys. Proxy injects at request time. | Keyed APIs (GitHub, Slack, OpenAI) | ✅ **MVP** |
| **2. Proxy Allowlist** | Only approved endpoints reachable through proxy | HTTP traffic through proxy | 🔮 Future |
| **3. Network Isolation** | Intercept ALL traffic (not just HTTP) at network level. Agent can't reach internet directly. | Full governance, no exfiltration | 🔮 Future |

**MVP Focus:** Key custody as proxy. Agents can't leak keys they don't have.

**Future State:** Full network interception for complete governance — all protocols, all traffic, no bypass possible.

**Why custody alone isn't enough:**
- Public APIs need no keys — agent could access freely
- Arbitrary HTTP (scraping, exfiltration) needs no keys
- Agent could POST data to `evil.com` without any credentials

**Full governance architecture:**
```
┌────────────────────────────────────────────┐
│  Sandboxed Agent Environment               │
│                                            │
│  Agent → can ONLY reach → Proxy            │
│          (network isolated)                │
│                                            │
│  Proxy:                                    │
│   - Allowlist of permitted endpoints       │
│   - Key injection for keyed services       │
│   - Audit all requests                     │
│   - Block everything else                  │
└────────────────────────────────────────────┘
```

**The pitch:**
> "Agents don't have keys. They can't leak what they don't have. The only way to access tools is through the governance layer. Production deployments add network isolation — agents can only reach endpoints you approve."

### Protocol Architecture (MVP)

**HTTP API with MCP-like semantics:**

```
┌─────────────────────────────────────────────────┐
│  HTTP POST Endpoint (Agent → Zuul)              │
│  JSON-RPC 2.0 request/response pattern          │
│  - tools/list — discover available tools       │
│  - tools/call — execute a tool                 │
│  - Custom: governance/*, audit/*               │
├─────────────────────────────────────────────────┤
│  Governance Layer (Zuul Proxy Logic)            │
│  - Signature verification (wallet auth)         │
│  - RBAC check (on-chain permissions)            │
│  - Key injection (API keys from .env)           │
│  - Request forwarding to tool backend           │
│  - _governance metadata on response             │
├─────────────────────────────────────────────────┤
│  Blockchain Audit Trail                         │
│  - Every request logged (immutable)             │
│  - Encrypted payload + signature                │
│  - On-chain via Hedera Consensus Service        │
└─────────────────────────────────────────────────┘
```

**Assumptions/Limitations (MVP):**
- Agent MUST explicitly route HTTP service calls through Zuul proxy
- Governance is opt-in (agent chooses which services to access through Zuul)
- No transparent HTTP interception (stretch goal for 2.0)
- No native MCP server support (stretch goal for 2.0)

**API Endpoints (MVP):**
- `POST /proxy` — Accept JSON-RPC 2.0 requests
  - Method: `tools/list` — discover tools
  - Method: `tools/call` — execute tool
  - Method: `governance/permissions` — query agent permissions
  - Method: `governance/audit` — query audit history

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {...} or "error": {...},
  "_governance": {
    "agent": "0x1234...",
    "tool": "github",
    "action": "create",
    "latency_ms": 142,
    "audit_tx": "0xabcd..."
  }
}
```

### Hackathon Scope (4 days)
| Component | Time | Priority |
|-----------|------|----------|
| Proxy service (with lazy TTL cache) | 1 day | MVP |
| On-chain permissions contract | 1 day | MVP |
| Audit log to chain | 0.5 days | MVP |
| OpenClaw skill (Agent SDK) | 0.5 days | MVP |
| Demo agent (OpenClaw) | 0.5 days | MVP |
| Polish/presentation | 0.5 days | MVP |
| Event-based cache invalidation | 0.5 days | **STRETCH** |
| OTEL instrumentation | 0.5 days | **STRETCH** |
| ZK proofs | 2-3 days | **CUT** (pitch as roadmap) |

**Ship the 80%. Pitch the 100%.**

### Target Bounties

**Total Upside: $40,000** across 5 confirmed alignments

#### TIER 1: Core Submissions (Highest Confidence)
**Combined prize: $30,000**

**1. Hedera - "Killer App for Agentic Society"** ($10,000) - PRIMARY
- **Why:** Perfect alignment. Hedera's brief: "autonomous agents use Hedera services for discovery, trading, and value exchange autonomously"
- **Your fit:** Your proxy IS the governance layer that makes agents trustworthy enough to operate autonomously on-chain
- **Pitch angle:** Frame as "Agents can autonomously transact on Hedera when they're governed by your proxy"
- **Deliverable:** On-chain RBAC contract on Hedera Testnet, audit log on Consensus Service, live demo of agent requesting → denied → revoke → denied

**2. Base - "Self-Sustaining Autonomous Agents"** ($10,000) - STRONG
- **Why:** Base wants agents that operate independently without human intervention. Your project solves this.
- **Your fit:** Permission contract lets agents query boundaries at runtime → no approval loops → truly self-sustaining
- **Pitch angle:** "Self-sustaining means agents know their constraints before attempting actions. Our proxy prevents the friction."
- **Deliverable:** Deployment on Base, demo of agent operating autonomously within permission guardrails, x402 integration narrative
- **Bonus:** Synergizes with Coinbase Agentic Wallet (Feb 2026 launch) for agent identity layer

**3. Kite AI - "Agent-Native Payments & Identity on Kite AI (x402-Powered)"** ($10,000) - VERY STRONG
- **Why:** Kite is THE agentic payments infrastructure. x402 is their core protocol. Your project complements perfectly.
- **Your fit:** Your proxy = governance + key custody layer. Agents authenticate via wallet signature (identity), proxy injects payment credentials (x402), charges per call
- **Pitch angle:** "Kite handles the payment rail. We govern how agents access it. Identity → Permission → Payment → Audit (all on-chain)"
- **Deliverable:** MCP-based agent that autonomously pays for API calls through x402 on Kite network, full permission + audit trail
- **Strength:** This is your strongest technical fit—Kite's problem (agents need trustworthy access to payment infrastructure) is exactly what your proxy solves

#### TIER 2: Secondary Submissions (Medium Confidence)
**Combined prize: $10,000**

**4. Hedera - "SDK-Only Development"** ($5,000) - MEDIUM
- **Why:** You're already building on Hedera (RBAC contract). Show additional depth with SDK-only workflows.
- **Your fit:** Leverage Hedera SDKs for Consensus Service (audit log writes), Token Service (potential agent identity via tokens)
- **Deliverable:** Pure SDK-based implementation showing Hedera-native integrations

**5. Hedera - "Schedule Service Automation"** ($5,000) - MEDIUM
- **Why:** Contract-driven scheduled transactions. Your governance contract could control which transactions agents are allowed to schedule.
- **Your fit:** Governance layer determines which scheduled actions agents can create
- **Deliverable:** Demo of agent submitting scheduled transaction → governance contract approves/denies based on RBAC

#### NOT RECOMMENDED
- **ETHDenver Generic Tracks ($2k each):** Too small, too generic
- **ADI Foundation, Canton Network, 0g Labs:** Orthogonal focus areas
- **QuickNode:** Requires Monad/Hyperliquid integration outside scope

### Strategic Positioning: The Trust Layer (2026-02-16)

**Core insight:** Crypto isn't just the payment rail. It's the **trust rail** for the agentic economy.

**Differentiation from Kong/nginx/Caddy:**
| | Traditional Gateway | This Project |
|---|---------------------|--------------|
| Trust model | Client has credentials → trusted | Agent is untrusted → contained |
| Key handling | Pass-through or header injection | Full custody, agent never sees |
| Permissions | Config file / DB | On-chain contract |
| Audit | Logs (mutable) | Blockchain (immutable) |
| Identity | API key / JWT | Wallet-based agent identity |
| Target user | DevOps | Agent deployers / compliance |

**Positioning:** "Kong routes traffic. We govern agents." / "Not a gateway. A trust boundary."

**Crypto as Agent Infrastructure:**
| Layer | What Crypto Provides | This Project's Role |
|-------|---------------------|---------------------|
| **Identity** | Wallet = agent identity (self-sovereign) | Agent registers with wallet, signs requests |
| **Payments** | x402, stablecoins, micropayments | Future: proxy charges agent wallet per call |
| **Governance** | On-chain permissions, DAOs | RBAC contract IS this layer |
| **Audit** | Immutable, verifiable, trustless | Blockchain audit log |
| **Composability** | Other protocols can read contracts | Permissions become interoperable |

**Wallet-Native Architecture:**
- Agent identity IS a wallet address (not API keys)
- Requests signed by agent wallet
- Permissions granted to wallet addresses
- Other protocols can verify agent permissions on-chain

**Future Extensions (post-hackathon):**
- **Payment integration** — Charge per call (x402 style), governance + metering in one layer
- **Token-gated permissions** — Permissions as NFTs, transferable/tradeable/revocable
- **DAO-controlled agents** — Permission contract owned by DAO, community governs agent behavior
- **Agent-to-agent trust** — Agents verify each other's permissions on-chain before collaborating
- **Encrypted key storage** — Keys shouldn't be stored plaintext. Vault-style encryption (AWS Secrets Manager, HashiCorp Vault, encrypted-at-rest with master key / KMS)
- **Multi-tenant proxy** — Single proxy infrastructure serving multiple orgs/clients with isolated permissions, keys, and audit logs
- **Full network isolation** — Intercept ALL traffic (not just HTTP) at network level for complete governance

**The Vision:**
> "The trust layer for the agentic economy. Identity, authorization, and accountability — all on-chain."

**Coinbase Agentic Wallet (released Feb 2026):**
- Solves: wallet custody + payments for agents (x402)
- Does NOT solve: access governance, immutable audit trail, third-party tool key custody
- **Integration angle:** Use Agentic Wallet for agent identity (wallet address), your proxy governs access, payment flows through x402
- This makes Coinbase/Base bounty pitch stronger

### Core Problem Statement
**"Prompts are not policies."**

You can't tell an agent "never leak credentials" and expect enforcement. The moment it gets prompt-injected or reads malicious content — the prompt is bypassed.

From the vulnu.com article:
> "Restrict tools, don't 'ask nicely.' 'Ask before doing risky things' is not a control. It's a UX preference."

> "We're deploying autonomous execution engines faster than we're defining the security model around them."

**The insight:** The architecture must enforce security — not the model, not the prompt. The infrastructure.

### Pitch Structure

**1. PROBLEM (30 sec)**
> "Prompts are not policies. You can't tell an agent 'don't leak credentials' and expect enforcement. The architecture must enforce security — the model can't. 341 malicious skills on ClawHub proved this isn't theoretical."

**2. SOLUTION (90 sec)**
> "We moved enforcement to infrastructure. Hard controls. On-chain permissions. Immutable audit. The agent never sees the key."
> *[Live demo: auth → request → proxy injects key → logged on-chain → revoke → denied]*

**3. VISION (60 sec)**
> "Security is the first layer. Same architecture scales to cost governance, compliance, observability — every dimension flows through one enforcement point. The trust layer for the agentic economy."

### Narrative Angle
"Prompts are not policies. We built enforcement that is."

### Marketing & Framing (2026-02-18)

**The MCP Gateway Question:**

Architecturally, Zuul IS an MCP gateway. But "MCP gateway" undersells the value.

| Framing | Perception | Risk |
|---------|------------|------|
| "MCP gateway" | Commodity infrastructure | Undersells governance/audit/custody value |
| "MCP gateway with governance" | Clearer, but still gateway-first | May anchor on "gateway" not "trust" |
| "Trust layer for agents" | Value-first, differentiated | May need explanation |
| "Agent governance proxy" | Accurate, enterprise-friendly | Less catchy |

**The Interface vs Value distinction:**

```
Plain MCP Gateway:
  Agent → MCP request → Gateway → HTTP call → Tool

Zuul:
  Agent → MCP request → [SIGNED] → Gateway → [RBAC] → [KEY INJECT] → Tool
                                      ↓
                                [AUDIT ON-CHAIN]
```

MCP is the **interface** (how agents talk to us).
Governance, audit, key custody is the **value** (what we do that others don't).

**Analogy for positioning:**
| Product | Interface | Value-Add |
|---------|-----------|-----------|
| nginx | HTTP | Reverse proxy, load balancing |
| Cloudflare | HTTP | Security, CDN, analytics |
| Kong | HTTP | Auth, rate-limiting, plugins |
| **Zuul** | **MCP** | **Governance, audit, key custody** |

**Drop-in pitch:** "Add governance to your agent in one line: point MCP at Zuul."

**TODO:** Finalize positioning language. "MCP gateway" is accurate but may not be the lead. Consider leading with problem/value, MCP as implementation detail.

### Business Model (post-hackathon)
- Per-request pricing ($0.001/call, OpenRouter style)
- Subscription per agent seat
- Protocol fee on audit log writes
- Enterprise self-hosted license

### Use Cases
- Enterprise AI deployment (SOC2, HIPAA compliance)
- Agent platform providers (LangChain Cloud, etc.)
- Regulated industries (finance, healthcare, legal)
- DAO/Web3 agent governance
- Multi-tenant agent hosting

---

## Outstanding Questions (for next session)

**Critical for MVP:**
| Question | Options | Decision |
|----------|---------|----------|
| **Auth flow** | Per-request wallet sig? Session token? | ✅ **Per-request signing.** Every request signed. Signature = proof of intent. JWT is stretch goal for high-throughput. |
| **Request format** | MCP `tools/call` structure? Custom? | ✅ **MCP (JSON-RPC 2.0).** Standard tools/list, tools/call + custom governance/* extensions. Decided 2026-02-16. |
| **Key mapping** | One key per tool? Per tool per role? | ✅ **Role → Permission → Key.** See Key Mapping section below. |
| **Error responses** | How does agent see auth fail, permission denied, tool error? | ✅ **HTTP status + JSON-RPC error code.** See Error Responses section below. |
| **Request ID** | UUID per request for audit correlation? | ✅ **Yes, UUID.** Generated by gateway, included in audit log + response. |
| **Audit content** | Full request/response? Metadata only? PII handling? | ✅ **Encrypted payload on-chain.** Timestamp public, all else encrypted. See Audit Content section. |
| **Tool discovery** | How does agent learn what tools exist + schemas? | ✅ **MCP `tools/list`, permission-filtered.** Agent only sees tools/actions they have access to. |

**Can defer:**
- Streaming responses
- Retry logic
- Response caching
- Concurrent request handling

## Bounty Strategy (Committed 2026-02-18)

**Primary Chain:** Hedera (aligns with 3/5 target bounties + $25k pool)

**Secondary Chain Integration:** Base (self-sustaining agents, Agentic Wallet synergy)

**Payment Protocol:** x402 via Kite AI (critical differentiator for Kite bounty)

**Submission Approach:**
1. Build core MVP on Hedera (RBAC contract, audit log on Consensus Service, proxy service)
2. Deploy governance contract on Base for self-sustaining agent demo
3. Integrate x402 for Kite submission (payment metering through proxy)
4. Single unified demo running across all three targets, showcasing governance boundaries enforcement

**Competitive Advantage:**
- Nobody else is building the **infrastructure enforcement layer** that all three bounties need
- Hedera sees you as the trust layer for their agentic society vision
- Base sees you as the tech enabling truly self-sustaining agents
- Kite sees you as the critical governance + metering partner for agentic payments
- Your core insight ("Prompts are not policies") solves a problem all three acknowledge but haven't addressed

## TODO
- [x] ~~Understand wallet identity model~~ — **DECIDED:** Modular. Interface-driven. Any wallet supported.
- [x] ~~Tech stack decisions (which chain?)~~ — **DECIDED:** EVM-only, chain driver is config. Demo on Hedera (bounty), pitch multi-chain.
- [x] ~~Project name~~ — **DECIDED:** Zuul (hackathon only). Rename post-ETHDenver (Netflix Zuul conflict).
- [x] ~~Auth flow~~ — **DECIDED:** Per-request signing (MVP). JWT as stretch for high-throughput tools.
- [x] ~~Key mapping~~ — **DECIDED:** Role → Permission → Key. Gateway enforces action → HTTP method. Per-tool override is stretch.
- [x] **Research all ETHDenver 2026 bounties and target alignment** (completed 2026-02-18)
- [x] ~~Error responses~~ — **DECIDED:** HTTP status + JSON-RPC error codes. Full mapping documented.
- [x] ~~Audit content~~ — **DECIDED:** Encrypted payload on-chain. Timestamp public, all else private. Hash + signature for verification.
- [x] ~~Tool discovery~~ — **DECIDED:** MCP `tools/list`, permission-filtered. Keys in `.env` (never config).
- [x] ~~Request ID~~ — **DECIDED:** UUID per request.
- [x] ~~Chain confirmation~~ — **DECIDED:** Hedera for demo (bounty), multi-chain is the pitch.
- [ ] Finalize narrative/pitch deck
- [ ] Build plan day-by-day (4-day hackathon breakdown)
- [ ] *(Deferred)* x402 integration — payment metering, post-MVP or during build if time

---
*Created: 2026-02-16*
*MVP Scope Committed: 2026-02-16 1241 MST*
*Trust Layer Positioning Added: 2026-02-16 1625 MST*
*Agentic Wallet Integration Angle Added: 2026-02-16 1644 MST*
*User Stories Expanded + HTTP-only Scope: 2026-02-16 1824 MST*
*Core Problem Statement + Pitch Structure: 2026-02-16 1920 MST*
*Protocol Architecture (MCP + OTEL): 2026-02-16 2034 MST*
*Enforcement Model (3 Layers): 2026-02-16 2049 MST*
*MVP Scope Clarified (Key Custody Only): 2026-02-16 2051 MST*
*Future Vision + Outstanding Questions: 2026-02-16 2100 MST*
*Target Bounties Committed + Deep Research: 2026-02-18 (Hedera primary, Base + Kite AI secondary, $40k total upside)*
