# Zuul Proxy — MVP Product Requirements Document

**Date:** February 2026
**Status:** In Development (ETHDenver 2026 Hackathon)
**Version:** 1.0 MVP

---

## Executive Summary

**Zuul** is an on-chain governance proxy for agent tool access. It solves the critical security problem that prompted the ClawHub security incidents (Feb 2026): **prompts are not policies**.

Agents cannot be trusted with keys. Zuul enforces hard controls at the infrastructure layer:
- **Key Custody**: Agents never see API keys; the proxy injects them at request time
- **On-Chain RBAC**: Permissions are enforced by a Solidity contract, immutable and verifiable
- **Blockchain Audit**: Every access request (success and denied) is logged on-chain with cryptographic proof
- **Wallet-Based Identity**: Agents authenticate via wallet signatures; identity is wallet address

**MVP ships governance + audit in 4 days.**

---

## Problem Statement

### The Security Crisis

**OpenClaw/ClawHub Incidents (Feb 2026):**
- 341 malicious skills deployed to public marketplace
- Agents executed unauthorized actions because "ask nicely" is not a control
- No immutable audit trail to prove what happened
- No way to revoke agent access programmatically

### Root Cause

The architecture trusts agents with credentials. Agent → has key → can do anything that key permits. When an agent gets compromised or prompt-injected, the key leaks.

**From vulnu.com (Feb 2026):**
> "Restrict tools, don't 'ask nicely.' 'Ask before doing risky things' is not a control. It's a UX preference."

> "A prompt is not a security boundary. It's a suggestion."

> "We're deploying autonomous execution engines faster than we're defining the security model around them."

### Zuul's Insight

**Move enforcement to infrastructure.** Not the model, not the prompt. The architecture.

1. **Agent never has keys** → can't leak what it doesn't have
2. **Proxy enforces permissions** → hard controls, not soft suggestions
3. **Blockchain records everything** → immutable proof of who did what
4. **Third parties can verify** → compliance auditors can check the audit log

---

## Solution Overview

Zuul is a **trust layer for the agentic economy**. It sits between agents and third-party tools (GitHub, Slack, OpenAI, etc.) and enforces:

```
Agent → [SIGNATURE] → Zuul Proxy → [RBAC CHECK] → [KEY INJECT] → Tool
                            ↓
                    [AUDIT TO BLOCKCHAIN]
```

### Core Components

| Component | Responsibility |
|-----------|-----------------|
| **HTTP Gateway** | Accept JSON-RPC requests, verify signatures, forward to tools, inject audit metadata |
| **RBAC Contract** | On-chain permissions (agent → role → action → tool) |
| **Audit Contract** | On-chain log of all accesses (encrypted payload, timestamp, signature) |
| **Chain Driver** | Abstract blockchain interactions; support Hedera/Base/Arbitrum/Optimism |
| **Key Custody** | Load API keys from environment, never expose to agents |
| **Config Layer** | Tool definitions, role policies, endpoint schemas |

### Security Properties

| Property | How It's Achieved |
|----------|-------------------|
| **Key Confidentiality** | Agents never receive keys; proxy injects at request time |
| **Access Enforcement** | On-chain RBAC contract validates every request |
| **Non-repudiation** | Agent signs every request; can't deny making it |
| **Immutability** | Blockchain audit log can't be deleted or modified |
| **Verifiability** | Admin can decrypt audit log, verify hash matches on-chain entry |
| **Compliance-Ready** | Third-party auditors can be given decryption key to verify governance |

---

## MVP Scope

### In Scope ✅

#### Core Proxy Service
- **HTTP API** with JSON-RPC 2.0 request/response semantics
- **Two endpoints:**
  - `POST /rpc` — Tool discovery (`tools/list`), agent metadata queries
  - `GET|POST|PUT|PATCH|DELETE /forward/{target_url}` — HTTP forwarding with signature verification
- **Authentication:** Per-request wallet signature verification (EIP-191)
- **Authorization:** Role-based permission checks (on-chain RBAC contract)
- **Key Injection:** API keys from `.env` file, injected into upstream requests
- **Request Pipeline:**
  1. Signature verification (recover signer, validate nonce, check timestamp)
  2. RBAC lookup (agent → role → permission for tool)
  3. HTTP method to action mapping (GET→read, POST→create, etc.)
  4. Key injection (inject credential into Authorization header)
  5. Forward to upstream tool (30s read timeout, 60s write timeout)
  6. Audit logging (non-blocking async write to blockchain)
  7. Response wrapping (inject `_governance` metadata)

#### On-Chain Contracts
- **RBAC Contract** (Solidity)
  - Register agents and assign roles
  - Define roles and their permissions
  - Permissions = (tool, action) pairs
  - Query interface: `hasPermission(agent, tool, action) → bool`
  - Admin interface: `grantPermission()`, `revokePermission()`, `emergencyRevoke(agent)`
  - Deployable to any EVM chain (Hedera, Base, Arbitrum, Optimism)

- **Audit Contract** (Solidity)
  - Log access events: (agent, tool, action, timestamp, encrypted_payload, payload_hash, signature)
  - Immutable record — entries can never be modified or deleted
  - Query interface: `getAuditEntry(audit_id)` returns log entry
  - Events emit for off-chain indexing

#### Configuration
- **`config.yaml`** (safe to commit)
  - Tool definitions (key, base_url, description, endpoints)
  - Role definitions (name, list of permissions)
  - Permission mappings (tool → allowed actions)
  - Action → HTTP method mappings (defaults: read→GET/HEAD, create→POST, update→PUT/PATCH, delete→DELETE)

- **`.env`** (gitignored, secrets only)
  - API keys: `GITHUB_API_KEY`, `SLACK_API_KEY`, etc.
  - Encryption key for audit payloads: `AUDIT_ENCRYPTION_KEY`
  - RPC URL with credentials: `HEDERA_RPC_URL`, `CHAIN_ID`

#### Audit & Logging
- **Encrypted Audit Payload**
  - Contents: agent, tool, action, endpoint, request_hash, response_hash, latency_ms, status, error_type
  - Encrypted with symmetric key (AES-256-GCM)
  - Timestamp remains public (when did it happen)
  - Payload hash and agent signature remain public (immutability proof)

- **Application Logging**
  - Structured logging via pino
  - Log at request entry: agent, tool, action, request_id
  - Log at request exit: status, latency_ms, audit_tx, error_type
  - Never log keys, signatures, decrypted audit payloads

#### Demo Agent (OpenClaw Integration)
- Implement as OpenClaw skill
- Demonstrates agent signing requests to Zuul
- Shows denied access (permission denied) → admin revokes → confirmed denied
- Runs against live Zuul proxy in demo


---

## User Stories

### Agent Stories

| # | As a... | I want to... | So that... | Acceptance Criteria |
|---|---------|--------------|------------|-------------------|
| **1** | Agent | Authenticate to Zuul proxy with my wallet signature | Zuul can verify my identity before any request | Can sign a request with wallet, proxy recovers my address and validates |
| **2** | Agent | Use a standard HTTP interface (JSON-RPC with MCP-like semantics) | Any agent SDK can integrate without custom implementation | `tools/list` and `tools/call` follow JSON-RPC 2.0 format; documented in OpenAPI |
| **3** | Agent | Discover available tools at runtime | I know what I can access before attempting | `tools/list` returns filtered list: only tools where agent has at least one permission |
| **4** | Agent | Never receive API keys directly | Keys can't leak through my context if I'm compromised | Proxy injects keys into Authorization header; response never includes keys |
| **5** | Agent | Use proxy endpoint for all third-party tool calls | All access is governed and logged | Make HTTP calls via `GET\|POST\|PUT\|PATCH\|DELETE /forward/{target_url}` |
| **6** | Agent | Receive clear error responses when access is denied | I can handle failures gracefully (e.g., retry with human approval) | JSON-RPC error codes: `-32010` (no tool access), `-32011` (no action access), `-32012` (revoked) |

### Admin Stories

| # | As a... | I want to... | So that... | Acceptance Criteria |
|---|---------|--------------|------------|-------------------|
| **7** | Admin | Configure tool endpoints (GitHub, Slack, OpenAI, etc.) | Zuul knows which tools exist and how to reach them | `config.yaml` defines tools with base_url, key_ref, description, endpoints |
| **8** | Admin | Create roles and define permissions | I can set up access policies before assigning agents | Roles in config.yaml with permission arrays (tool + actions) |
| **9** | Admin | Register agents and assign them to roles | Control who can do what | Deploy RBAC contract, call `registerAgent(agent_address, role_id)` |
| **10** | Admin | Configure API keys per tool | Manage credentials at scale | `.env` file with `TOOL_NAME_API_KEY` references in config.yaml `key_ref` |
| **11** | Admin | See all calls through Zuul (success + denied) | Full visibility into agent activity | Audit contract logs every access (successful and denied); query via contract or third-party UI |
| **12** | Admin | Search audit logs by agent, tool, time, status | Investigate specific events | Query audit contract; filter by agent address, tool name, timestamp range |
| **13** | Admin | Decrypt audit logs | Investigate sensitive details when needed | Decrypt encrypted audit payload with `AUDIT_ENCRYPTION_KEY` from `.env` |
| **14** | Admin | Emergency-revoke an agent | Kill switch for rogue/compromised agents | Call `emergencyRevoke(agent_address)` on RBAC contract; agent immediately denied all access |

---

## Technical Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Agent (e.g., OpenClaw Skill)                                │
│                                                             │
│ 1. Build request: { tool, action, params, nonce, timestamp} │
│ 2. Sign with wallet (EIP-191)                               │
│ 3. POST /forward/{target_url} with headers:                 │
│    X-Agent-Address: 0x1234...                               │
│    X-Signature: 0x5678...                                   │
│    X-Nonce: uuid                                            │
│    X-Timestamp: unix-seconds                                │
└─────────────────────────────────────────────┬───────────────┘
                                              │
┌─────────────────────────────────────────────▼───────────────┐
│ Zuul Proxy (HTTP Server)                                    │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 1. Signature Verification Middleware                │   │
│ │    - Recover signer from X-Signature                │   │
│ │    - Validate X-Agent-Address matches recovered     │   │
│ │    - Check nonce not replayed (scoped to agent)    │   │
│ │    - Check timestamp within ±5 minutes              │   │
│ │    - On failure: return 401 with JSON-RPC error    │   │
│ └─────────────────────────────────────────────────────┘   │
│                      ↓ (sig valid)                          │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 2. Tool Extraction & RBAC Lookup                    │   │
│ │    - Parse /forward/{target_url}                    │   │
│ │    - Longest prefix match against registered tools  │   │
│ │    - Infer action from HTTP method                  │   │
│ │    - Query RBAC contract: agent + tool + action     │   │
│ │    - On failure: return 403 with JSON-RPC error    │   │
│ └─────────────────────────────────────────────────────┘   │
│                      ↓ (permission ok)                      │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 3. Key Custody & Injection                          │   │
│ │    - Load API key from .env via key_ref             │   │
│ │    - Inject into Authorization header               │   │
│ │    - Never pass key to agent or log it              │   │
│ └─────────────────────────────────────────────────────┘   │
│                      ↓ (key injected)                       │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 4. Forward to Upstream Tool                         │   │
│ │    - POST/GET/PUT/PATCH/DELETE to target_url        │   │
│ │    - Preserve all headers except auth (re-inject)   │   │
│ │    - 30s read timeout, 60s write timeout            │   │
│ │    - Stream response back to agent                  │   │
│ └─────────────────────────────────────────────────────┘   │
│                      ↓ (response received)                  │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 5. Audit Logging (Async, Non-Blocking)             │   │
│ │    - Encrypt audit payload (agent, tool, action,    │   │
│ │      endpoint, status, latency, request_hash,       │   │
│ │      response_hash, error_type)                     │   │
│ │    - Compute payload hash (sha256)                  │   │
│ │    - Sign hash with agent's wallet signature        │   │
│ │    - Submit to audit contract on blockchain         │   │
│ │    - Return audit_tx in response (don't wait)       │   │
│ └─────────────────────────────────────────────────────┘   │
│                      ↓                                      │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 6. Response & Governance Metadata                   │   │
│ │    - Wrap response (JSON or passthrough)            │   │
│ │    - Inject _governance metadata:                   │   │
│ │      * request_id (uuid)                            │   │
│ │      * agent (0x1234...)                            │   │
│ │      * tool, action                                 │   │
│ │      * latency_ms, audit_tx                         │   │
│ │      * chain_id, timestamp                          │   │
│ │    - Return to agent                                │   │
│ └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────────┐    ┌──────▼──────┐    ┌────────▼─┐
   │ GitHub API  │    │  Slack API  │    │ OpenAI  │
   │ (upstream)  │    │ (upstream)  │    │(upstream)
   └─────────────┘    └─────────────┘    └─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────────────────┐    │    ┌────────────────▼───┐
   │ Blockchain (Hedera) │    │    │ Blockchain (Base)  │
   │                     │    │    │ (future/secondary) │
   │ RBAC Contract       │    │    │                    │
   │ Audit Contract      │    │    │ Same contracts     │
   │ (immutable log)     │    │    │ deployable to both │
   └─────────────────────┘    │    └────────────────────┘
                              │
```

### Module Breakdown

```
src/
├── api/
│   ├── handlers/          # HTTP endpoint handlers
│   │   ├── rpc.ts         # POST /rpc (tools/list, tools/describe)
│   │   └── forward.ts     # GET|POST|... /forward/{target_url}
│   ├── middleware/
│   │   ├── signature.ts   # Signature verification (auth)
│   │   ├── rbac.ts        # Permission check (authz)
│   │   └── audit.ts       # Audit logging (cross-cutting)
│   └── server.ts          # HTTP server setup (Hono)
│
├── auth/
│   ├── signature.ts       # EIP-191 signature recovery, nonce/timestamp validation
│   └── wallet.ts          # Wallet abstraction (ECDSA, any EIP-191 wallet)
│
├── rbac/
│   ├── permission.ts      # Permission model (Agent, Role, Permission types)
│   ├── cache.ts           # Permission cache (lazy TTL)
│   └── contract.ts        # Contract ABI bindings, read calls via ChainDriver
│
├── proxy/
│   ├── executor.ts        # Tool forwarding logic (inject key, forward, handle response)
│   ├── tool-registry.ts   # Tool definitions from config
│   └── action-mapper.ts   # HTTP method → action mapping
│
├── audit/
│   ├── payload.ts         # Audit entry structure, serialization
│   ├── encryption.ts      # AES-256-GCM encryption/decryption
│   ├── contract.ts        # Contract ABI bindings, write calls via ChainDriver
│   └── store.ts           # Async audit log writer (queue, batches to blockchain)
│
├── custody/
│   ├── key-loader.ts      # Load .env keys, never expose outside module
│   └── key-vault.ts       # In-memory key cache (future: Vault integration)
│
├── chain/
│   ├── driver.ts          # ChainDriver interface (deploy, call, read events)
│   ├── hedera.ts          # Hedera implementation
│   ├── evm.ts             # Generic EVM implementation (Base, Arbitrum, Optimism)
│   └── local.ts           # Local in-memory mock (testing)
│
├── config/
│   ├── loader.ts          # Load config.yaml, validate schema
│   ├── types.ts           # Config domain types
│   └── schema.ts          # JSON Schema validation
│
├── logging.ts             # Structured logging (pino)
├── types.ts               # Domain types (Agent, Role, Permission, AuditEntry)
├── errors.ts              # ZuulError hierarchy, JSON-RPC error codes
└── index.ts               # App entry point
```

### Key Data Models

#### Agent
```typescript
type Agent = {
  readonly address: AgentAddress;  // Wallet address (EIP-191)
  readonly roleId: RoleId;
  readonly status: 'active' | 'revoked';
  readonly registeredAt: Timestamp;
};
```

#### Role
```typescript
type Role = {
  readonly id: RoleId;
  readonly name: string;
  readonly permissions: ReadonlyArray<Permission>;
};
```

#### Permission
```typescript
type Permission = {
  readonly tool: ToolKey;
  readonly actions: ReadonlyArray<PermissionAction>;  // 'read' | 'create' | 'update' | 'delete'
};

type PermissionAction = 'read' | 'create' | 'update' | 'delete';
```

#### AuditEntry (On-Chain)
```typescript
type AuditEntry = {
  readonly auditId: AuditId;  // UUID
  readonly timestamp: Timestamp;  // Unix seconds (public)
  readonly encryptedPayload: EncryptedPayload;  // Private
  readonly payloadHash: Hash;  // SHA256 (public, for integrity)
  readonly agentSignature: Signature;  // EIP-191 (public, for non-repudiation)
};

// Decrypted payload (only admin can read)
type AuditPayload = {
  readonly agent: AgentAddress;
  readonly tool: ToolKey;
  readonly action: PermissionAction;
  readonly endpoint: string;  // e.g., "/repos/owner/repo/issues"
  readonly status: 'success' | 'denied';
  readonly errorType?: ErrorType;  // 'auth/invalid_signature', 'permission/no_action_access', etc.
  readonly latencyMs: number;
  readonly requestHash: Hash;  // SHA256 of request body
  readonly responseHash: Hash;  // SHA256 of response body
};
```

#### GovernanceMetadata (Injected into All Responses)
```typescript
type GovernanceMetadata = {
  readonly requestId: RequestId;  // UUID v4
  readonly agent: AgentAddress;  // Recovered from signature
  readonly tool?: ToolKey;  // From target URL match
  readonly action?: PermissionAction;  // From HTTP method
  readonly latencyMs?: number;  // Time to upstream
  readonly auditTx?: TransactionHash;  // Blockchain transaction ID
  readonly chainId: ChainId;  // Network ID
  readonly timestamp: Timestamp;  // Unix seconds
  readonly errorType?: ErrorType;  // On error: 'auth/invalid_signature', 'permission/no_tool_access', etc.
};
```

---

## HTTP API Specification

### Endpoint 1: Tool Discovery — `POST /rpc`

**Method:** `POST`
**Content-Type:** `application/json`
**Authentication:** Optional (agent address from request params)

#### Request

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {
    "agent_address": "0x1234567890123456789012345678901234567890"
  },
  "id": "req-uuid-v4"
}
```

#### Response (Success)

```json
{
  "jsonrpc": "2.0",
  "id": "req-uuid-v4",
  "result": {
    "tools": [
      {
        "key": "github",
        "description": "GitHub API",
        "base_url": "https://api.github.com",
        "allowed_actions": ["read", "create", "update"]
      },
      {
        "key": "slack",
        "description": "Slack API",
        "base_url": "https://slack.com/api",
        "allowed_actions": ["read"]
      }
    ]
  },
  "_governance": {
    "request_id": "req-uuid-v4",
    "agent": "0x1234567890123456789012345678901234567890",
    "timestamp": 1740000000,
    "chain_id": 295
  }
}
```

**Behavior:**
- Filter tools by agent's RBAC permissions
- Only return tools where agent has at least one permission
- Never include API keys in response
- No signature verification required for discovery

---

### Endpoint 2: HTTP Forwarding — `GET|POST|PUT|PATCH|DELETE /forward/{target_url}`

**Method:** Preserves client HTTP method
**Content-Type:** `application/json` (request), varies (response)
**Authentication:** Required (X-Signature, X-Agent-Address, X-Nonce, X-Timestamp headers)

#### Request Headers (Required)

| Header | Format | Example | Purpose |
|--------|--------|---------|---------|
| `X-Agent-Address` | `0x{40 hex chars}` | `0x1234...` | Agent wallet address |
| `X-Signature` | `0x{130 hex chars}` | `0x9876...` | EIP-191 signature |
| `X-Nonce` | UUID v4 | `550e8400-e29b-41d4-a716-446655440000` | Replay protection |
| `X-Timestamp` | Unix seconds | `1740000000` | Freshness check (±5 min) |

#### Signature Payload (Canonical)

The signature must cover:

```
{METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}
```

**Steps:**
1. Agent constructs canonical payload: `GET\nhttps://api.github.com/repos/owner/repo/issues\nabc-123\n1740000000`
2. Agent hashes: `hash = keccak256(payload)`
3. Agent signs with EIP-191: `signature = wallet.sign(hash)`
4. Agent includes signature in `X-Signature` header

**Proxy verifies:**
1. Extract message from `(agent_address, signature)`
2. Recover signer: `signer = recoverMessageAddress(message, signature)`
3. Confirm `signer == X-Agent-Address`
4. Confirm nonce not used before (per agent)
5. Confirm timestamp within ±5 minutes

#### Example Request

```bash
curl -X GET "http://localhost:8080/forward/https://api.github.com/repos/owner/repo/issues" \
  -H "X-Agent-Address: 0x1234567890123456789012345678901234567890" \
  -H "X-Signature: 0x9876543210987654321098765432109876543210..." \
  -H "X-Nonce: 550e8400-e29b-41d4-a716-446655440000" \
  -H "X-Timestamp: 1740000000"
```

#### Response (Success, JSON)

```json
{
  "result": {
    "id": 123,
    "title": "Fix authentication bug",
    "state": "open",
    "created_at": "2026-02-18T10:00:00Z"
  },
  "_governance": {
    "request_id": "res-uuid-v4",
    "agent": "0x1234567890123456789012345678901234567890",
    "tool": "github",
    "action": "read",
    "target_url": "https://api.github.com/repos/owner/repo/issues",
    "latency_ms": 142,
    "audit_tx": "0xDEF...",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

#### Response (Success, Binary/Text)

For non-JSON responses (images, binary data), governance metadata is injected in response header:

```http
HTTP/1.1 200 OK
Content-Type: image/png
X-Governance: eyJyZXF1ZXN0X2lkIjogIi4uLiJ9  # base64-encoded JSON

[binary image data]
```

#### Response (Error — Auth Failure)

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32002,
    "message": "Invalid signature",
    "data": {
      "expected_signer": "0x1234567890123456789012345678901234567890",
      "recovered_signer": "0x5678901234567890123456789012345678901234"
    }
  },
  "_governance": {
    "request_id": "res-uuid-v4",
    "error_type": "auth/invalid_signature",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

**HTTP Status:** `401 Unauthorized`

#### Response (Error — Permission Denied)

```json
{
  "jsonrpc": "2.0",
  "id": null,
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
    "request_id": "res-uuid-v4",
    "agent": "0x1234567890123456789012345678901234567890",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "audit_tx": "0xDEF...",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

**HTTP Status:** `403 Forbidden`

---

## HTTP Method to Action Mapping

| HTTP Method | RBAC Action | Example |
|-------------|-------------|---------|
| `GET`, `HEAD` | `read` | `GET /api/repos/owner/repo` requires `github.read` permission |
| `POST` | `create` | `POST /api/repos/owner/repo/issues` requires `github.create` permission |
| `PUT`, `PATCH` | `update` | `PUT /api/repos/owner/repo/issues/123` requires `github.update` permission |
| `DELETE` | `delete` | `DELETE /api/repos/owner/repo/issues/123` requires `github.delete` permission |

---

## Error Code Reference

### JSON-RPC Error Codes

| Scenario | HTTP | Code | Message | error_type |
|----------|------|------|---------|------------|
| **Auth: Missing signature** | 401 | -32001 | `Missing signature` | `auth/missing_signature` |
| **Auth: Invalid signature** | 401 | -32002 | `Invalid signature` | `auth/invalid_signature` |
| **Auth: Wallet not registered** | 401 | -32003 | `Wallet not registered` | `auth/unknown_wallet` |
| **Auth: Nonce expired/reused** | 401 | -32004 | `Invalid nonce` | `auth/invalid_nonce` |
| **Auth: Timestamp drift** | 401 | -32005 | `Request timestamp outside ±5 min window` | `auth/timestamp_drift` |
| **Permission: No tool access** | 403 | -32010 | `Permission denied: no access to tool` | `permission/no_tool_access` |
| **Permission: No action access** | 403 | -32011 | `Permission denied: action not allowed` | `permission/no_action_access` |
| **Permission: Wallet revoked** | 403 | -32012 | `Wallet revoked` | `permission/revoked` |
| **Request: Malformed** | 400 | -32600 | `Invalid request` | `request/malformed` |
| **Request: Tool not found** | 404 | -32013 | `Tool not found` | `request/unknown_tool` |
| **Service: Upstream error** | 502 | -32020 | `Service error` | `service/upstream_error` |
| **Service: Timeout** | 504 | -32021 | `Service timeout` | `service/timeout` |
| **Service: Unavailable** | 503 | -32022 | `Service unavailable` | `service/unavailable` |
| **Rate: Limit exceeded** | 429 | -32030 | `Rate limit exceeded` | `rate/exceeded` |
| **Internal: Gateway error** | 500 | -32603 | `Internal error` | `internal/error` |

---

## Security Requirements

### Authentication

- **Every request must be signed** with the agent's wallet (EIP-191 standard)
- **Signature recovery** uses `viem`'s `recoverMessageAddress()` API
- **Recovered signer** must match `X-Agent-Address` header
- **Nonce validation** prevents replay attacks (scoped per agent address)
  - Nonce stored in in-memory set for MVP
  - Nonce expires after 5 minutes
  - Duplicate nonce returns 401 with `-32004`
- **Timestamp validation** ensures freshness (±5 minutes from server time)
  - Prevents requests from being replayed hours/days later
  - Returns 401 with `-32005` if outside window

### Authorization

- **Every request checked against RBAC contract** before key injection
- **Permission lookup:** `Agent → Role → Permission (tool, actions)`
- **Permission failure returns 403** before any upstream request made
- **RBAC cache with lazy TTL:**
  - Cache permissions for 5 minutes (configurable)
  - Cache miss triggers blockchain read
  - On chain outage, fail closed (deny all) rather than fail open

### Key Custody

- **API keys loaded from `.env` only** at proxy startup
- **Keys never appear in logs, errors, or responses**
- **Keys injected into request headers** just before forwarding
- **Keys never passed to agents** in any form
- **Logging redacts key_ref values** (e.g., log "injected key for github" not "injected ghp_abc123")

### Audit & Non-Repudiation

- **Every request audited** to blockchain (success and denied)
- **Encrypted audit payload** prevents competitive intelligence leakage
  - Agent, tool, action, endpoint, latency, status — all encrypted
  - Only timestamp and hashes remain public
- **Payload hash ensures integrity** — admin decrypts and re-hashes to verify
- **Agent signature on hash** — proves agent committed to this exact action
  - Agent can't deny making the request (non-repudiation)

### Trust Boundaries

- **Agents untrusted by default** — all inputs validated
- **Signature verified before any business logic** — fail fast
- **Chain responses validated** — type guards narrow contract returns to trusted domain types
- **Configuration loaded and validated at startup** — no runtime config injection

---

## Configuration Format

### config.yaml

```yaml
# Tools available through the proxy
tools:
  - key: github
    description: "GitHub REST API"
    base_url: "https://api.github.com"
    key_ref: "GITHUB_API_KEY"  # References env var
    endpoints:
      - path: "/repos/{owner}/{repo}/issues"
        methods: ["GET", "POST"]
        description: "Manage repository issues"
      - path: "/repos/{owner}/{repo}/issues/{issue_number}"
        methods: ["GET", "PATCH", "DELETE"]
        description: "Manage single issue"

  - key: slack
    description: "Slack API"
    base_url: "https://slack.com/api"
    key_ref: "SLACK_BOT_TOKEN"
    endpoints:
      - path: "/conversations.list"
        methods: ["GET"]
        description: "List conversations"
      - path: "/chat.postMessage"
        methods: ["POST"]
        description: "Send message"

# Roles and their permissions
roles:
  - id: developer
    name: "Developer"
    permissions:
      - tool: github
        actions: ["read", "create", "update"]
      - tool: slack
        actions: ["read"]

  - id: admin
    name: "Administrator"
    permissions:
      - tool: github
        actions: ["read", "create", "update", "delete"]
      - tool: slack
        actions: ["read", "create"]

# HTTP method to action mapping (defaults, can override per tool)
action_mapping:
  read: ["GET", "HEAD"]
  create: ["POST"]
  update: ["PUT", "PATCH"]
  delete: ["DELETE"]

# Chain configuration
chain:
  name: "hedera"  # or "base", "arbitrum", "optimism"
  chain_id: 295  # Hedera testnet
  rpc_url: "${HEDERA_RPC_URL}"  # From .env

# Cache configuration
cache:
  ttl_seconds: 300  # 5 minutes

# Server configuration
server:
  port: 8080
  host: "0.0.0.0"
  read_timeout_ms: 30000
  write_timeout_ms: 60000
```

### .env (Secrets)

```bash
# Tool API keys
GITHUB_API_KEY=ghp_abc123...
SLACK_BOT_TOKEN=xoxb-789xyz...
OPENAI_API_KEY=sk-proj-...

# Audit encryption
AUDIT_ENCRYPTION_KEY=<32-byte-hex-key>

# Blockchain RPC
HEDERA_RPC_URL=https://testnet.hashio.io:50005
HEDERA_ACCOUNT_ID=0.0.12345
HEDERA_PRIVATE_KEY=...

# (Future) Deployed contract addresses
RBAC_CONTRACT_ADDRESS=0x...
AUDIT_CONTRACT_ADDRESS=0x...
```

---

## Solidity Contracts

### RBAC Contract Interface

```solidity
pragma solidity ^0.8.20;

contract RBACContract {

  // Events
  event AgentRegistered(address indexed agent, bytes32 indexed roleId);
  event AgentRevoked(address indexed agent);
  event PermissionGranted(bytes32 indexed roleId, string tool, string action);
  event PermissionRevoked(bytes32 indexed roleId, string tool, string action);

  // Admin interface
  function registerAgent(address agent, bytes32 roleId) external;
  function emergencyRevoke(address agent) external;
  function grantPermission(bytes32 roleId, string calldata tool, string calldata action) external;
  function revokePermission(bytes32 roleId, string calldata tool, string calldata action) external;

  // Query interface (read-only, no gas cost)
  function hasPermission(address agent, string calldata tool, string calldata action) external view returns (bool);
  function getAgentRole(address agent) external view returns (bytes32 roleId, bool isActive);
}
```

### Audit Contract Interface

```solidity
pragma solidity ^0.8.20;

contract AuditContract {

  struct AuditEntry {
    bytes32 auditId;
    uint256 timestamp;
    bytes encryptedPayload;  // AES-256-GCM encrypted
    bytes32 payloadHash;      // SHA256
    bytes agentSignature;     // EIP-191
  }

  // Events (for off-chain indexing)
  event AuditLogged(
    bytes32 indexed auditId,
    address indexed agent,
    string tool,
    uint256 timestamp
  );

  // Write interface (only proxy can call)
  function logAudit(
    bytes32 auditId,
    bytes calldata encryptedPayload,
    bytes32 payloadHash,
    bytes calldata agentSignature
  ) external;

  // Read interface
  function getAuditEntry(bytes32 auditId) external view returns (AuditEntry memory);
}
```

---

## Success Criteria

### Functional Requirements

- ✅ Agents can call `POST /rpc` with `tools/list` and receive filtered tool list based on permissions
- ✅ Agents can call `GET|POST|PUT|PATCH|DELETE /forward/{target_url}` with valid signature
- ✅ Proxy validates signature, recovers signer, checks nonce and timestamp
- ✅ Proxy checks RBAC contract for permission (agent → role → action + tool)
- ✅ On permission failure, proxy returns 403 with JSON-RPC error before contacting upstream
- ✅ On permission success, proxy injects API key into Authorization header and forwards request
- ✅ Proxy returns response from upstream wrapped with `_governance` metadata
- ✅ Proxy logs both successful and denied requests to blockchain asynchronously
- ✅ Admin can call `emergencyRevoke(agent)` on RBAC contract to immediately deny all access
- ✅ Demo agent (OpenClaw skill) demonstrates: request → denied → revoke → request denied

### Non-Functional Requirements

- ✅ **Signature verification latency:** <5ms per request
- ✅ **RBAC lookup latency:** <10ms (from cache) or <100ms (chain read)
- ✅ **Key injection latency:** <1ms per request
- ✅ **Upstream forwarding latency:** ≤30s read, ≤60s write (proxy forwards within these bounds)
- ✅ **Audit write latency:** async, ≤100ms to queue (response returns to agent within 200ms, audit writes continue in background)
- ✅ **Blockchain deployment:** Contract deploys to Hedera testnet, all functionality verified
- ✅ **Type safety:** TypeScript strict mode, 90%+ test coverage on core modules

### Security Requirements

- ✅ **No API keys logged or exposed** to agents
- ✅ **Every request authenticated and authorized** before upstream contact
- ✅ **Signature replay prevention** via nonce scoped per agent
- ✅ **Timestamp freshness** enforced (±5 minutes)
- ✅ **Audit entries immutable** on blockchain
- ✅ **Audit payloads encrypted** (only timestamp public)
- ✅ **Permission cache fail-closed** on chain outage
- ✅ **Wallet signature verification** before any business logic

---

## Deliverables

### Code

1. **HTTP Gateway Service** (`src/api/`, `src/auth/`, `src/proxy/`)
   - Hono HTTP server with signature verification, RBAC, key injection, forwarding, error handling
   - Middleware pipeline: auth → authz → key inject → forward → audit
   - Response wrapping with `_governance` metadata

2. **RBAC Contract & Cache** (`src/rbac/`, `contracts/`)
   - Solidity RBAC contract (register agents, grant/revoke permissions)
   - TypeScript permission model and cache (lazy TTL)
   - Contract bindings via viem + TypeChain

3. **Audit Logging** (`src/audit/`, `contracts/`)
   - Solidity audit contract (immutable log)
   - AES-256-GCM encryption/decryption for payloads
   - Async audit writer (queue + batch to blockchain)
   - Contract bindings via viem + TypeChain

4. **Key Custody** (`src/custody/`)
   - Load API keys from `.env` at startup
   - Never expose outside module
   - Inject into request headers

5. **Chain Driver** (`src/chain/`)
   - Abstract interface for blockchain interactions
   - Hedera implementation
   - Generic EVM fallback (Base, Arbitrum, Optimism)

6. **Configuration & Logging** (`src/config/`, `src/logging.ts`)
   - YAML config loader with JSON Schema validation
   - Structured pino logging with context

7. **Tests** (`tests/`)
   - Unit tests: signature verification, RBAC, tool routing, error mapping
   - Integration tests: blockchain interactions, audit logging, end-to-end flows
   - 90%+ coverage on core modules

### Documentation

1. **Architecture Documentation** (`docs/architecture.md`)
   - System diagram, module breakdown, data models, contract interfaces
   - MVP assumptions and limitations

2. **API Documentation** (`docs/api.md`)
   - Endpoint specifications, request/response examples
   - Error codes, signature format, configuration

3. **Deployment Guide** (`docs/deployment.md`)
   - Config file structure, `.env` setup
   - Chain driver configuration, multi-chain strategy
   - MVP limitations and assumptions

### Contracts

1. **RBAC.sol** — On-chain permission management
2. **Audit.sol** — Immutable access log
3. **Deployment Scripts** — Hardhat Ignition configs for Hedera testnet

### Demo

1. **OpenClaw Skill** — Agent SDK skill that calls Zuul proxy
   - Build request, sign with wallet, forward via `tools/call`
   - Handle permission denied, show emergency revoke flow

2. **Demo Script** — Orchestrates:
   - Deploy contracts to Hedera
   - Configure proxy (tools, roles, agents)
   - Run demo agent (GitHub issue creation)
   - Show denied access
   - Call `emergencyRevoke`
   - Show still denied
   - Success

---

## Constraints & Assumptions

### MVP Constraints

| Constraint | Rationale | Mitigation |
|-----------|-----------|-----------|
| **Governance is opt-in** | Agent must explicitly route through Zuul; no transparent interception | Documented as MVP limitation |
| **HTTP-only** | No WebSocket, gRPC, SSH protocols in MVP | Out of MVP scope |
| **No native MCP support** | Agent cannot use GitHub MCP, Slack MCP directly through Zuul | MVP uses HTTP with MCP-like semantics |
| **No network isolation** | Without infrastructure controls, agents could bypass by making direct HTTP calls | Documented assumption; full governance requires network sandboxing |
| **Coarse-grained RBAC** | Permissions enforced at tool level, not path level (e.g., can't distinguish `/repos/{repo}` from `/admin/`) | Per-tool action mapping is default; per-path RBAC out of scope |
| **Key custody MVP** | API keys in `.env` file, not vault/KMS | Enterprise key storage deferred to future |
| **Lazy TTL cache** | RBAC cache expires on timer | Cache miss → blockchain read; fail-closed on chain outage |

### MVP Assumptions

1. **Agent Configuration** — Agents are configured to explicitly call Zuul proxy for tool access. They don't automatically discover it via MCP.
2. **Wallet Availability** — All agents support EIP-191 wallet signatures (Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA).
3. **Blockchain Availability** — Hedera testnet (or EVM chain) is reachable and RPC calls complete within 100ms. On outage, proxy fails closed (denies).
4. **Key Security** — `.env` file is protected via `.gitignore` and not committed. In production, would be managed by infrastructure.
5. **Admin Trust** — Admin role is trusted to configure tools, roles, permissions, and hold the audit decryption key.
6. **Upstream Tool Contract** — Tools (GitHub, Slack, etc.) accept standard Authorization headers and return parseable responses.

---

## Timeline (4-Day Hackathon)

**Day 1 (Feb 21):**
- Proxy service skeleton + HTTP server (Hono)
- Signature verification middleware
- Tool registry and config loader
- Simple success response (no auth yet)

**Day 2 (Feb 22):**
- RBAC contract (Solidity)
- RBAC cache and permission lookup
- Key custody module (load from `.env`)
- Key injection into requests
- Upstream forwarding + response wrapping
- Error handling and JSON-RPC error codes

**Day 3 (Feb 23, Morning):**
- Audit contract (Solidity)
- Encryption/decryption module
- Async audit logger
- Integration tests with local Hedera/EVM node
- Deploy contracts to Hedera testnet

**Day 3 (Feb 23, Afternoon) & Day 4:**
- OpenClaw skill (agent SDK integration)
- Demo agent script
- End-to-end flow testing
- Polish, documentation, presentation prep

---

## Glossary

| Term | Definition |
|------|-----------|
| **Agent** | An autonomous software entity identified by a wallet address; makes requests to Zuul proxy |
| **RBAC** | Role-Based Access Control; agent → role → permissions (tool + actions) |
| **Permission** | Grant of specific action on a tool (e.g., "github.read", "slack.create") |
| **Key Custody** | Zuul holds API keys; agents never receive them; keys injected at request time |
| **Governance** | Enforcement of authentication, authorization, and audit; trust boundary |
| **Audit Entry** | Immutable record of an access request (success or denied) on blockchain |
| **Non-Repudiation** | Agent can't deny making a request; signature proves intent |
| **EIP-191** | Ethereum Improvement Proposal for off-chain message signing; standard for wallet signatures |
| **JSON-RPC 2.0** | Remote procedure call protocol; used for proxy API (tools/list, tools/call) |
| **Nonce** | Random value used once per request; prevents replay attacks |
| **Fail Closed** | On error, deny access (conservative); opposite of fail open |

---

## References

- **Project:** ETHDenver 2026 Hackathon — Zuul Proxy
- **Problem Statement:** OpenClaw/ClawHub Security Incidents (Feb 2026)
- **Market Validation:** vulnu.com article "The problem isn't OpenClaw. It's the architecture." (Feb 2026)
- **Blockchains:** Hedera (primary), Base/Arbitrum/Optimism (secondary, all EVM)
- **Dependencies:** viem (wallet signatures), Hardhat (contract compilation), Hono (HTTP server), pino (logging), Vitest (testing)

---

**Version History:**
- **v1.0** (Feb 18–19, 2026): Initial MVP PRD, committed scope, all user stories and technical details finalized
