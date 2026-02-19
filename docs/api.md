# HTTP API Reference

Zuul Proxy exposes HTTP endpoints with JSON-RPC 2.0 semantics for tool discovery and execution. All responses include governance metadata (`_governance`) for audit trail verification.

## Overview

**Base URL**: `http://localhost:8080` (dev) or `https://zuul.example.com` (production)

**Two API surfaces:**
- **`POST /rpc`** — JSON-RPC 2.0 discovery and metadata queries
- **`ANY /forward/{target_url}`** — HTTP forwarding with governance

## Discovery Endpoint: `POST /rpc`

### `tools/list` — Discover accessible tools

Returns all tools the agent has at least one permission for.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {
    "agent_address": "0x1234567890abcdef1234567890abcdef12345678"
  },
  "id": "req-1"
}
```

**Response (Success):**
```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": {
    "tools": [
      {
        "key": "github",
        "base_url": "https://api.github.com",
        "allowed_actions": ["read", "create", "update"],
        "description": "GitHub API for repository management"
      },
      {
        "key": "slack",
        "base_url": "https://slack.com/api",
        "allowed_actions": ["read", "create"],
        "description": "Slack API for messaging and workspace management"
      }
    ]
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "timestamp": 1740000000
  }
}
```

**Response (Error):**
```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "error": {
    "code": -32022,
    "message": "Service unavailable: chain RPC error",
    "data": {
      "upstream_status": null
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": 1740000000
  }
}
```

**Details:**
- **No signature verification required** for discovery
- Agent address used to filter results
- Only tools with at least one permission are included
- API keys never returned
- HTTP 200 (success) or 503 (chain error)

---

## Forwarding Endpoint: `GET|POST|PUT|PATCH|DELETE /forward/{target_url}`

Execute a tool call through Zuul with full governance. Requires cryptographic signature and nonce.

### Request Format

**Path Pattern:**
```
GET /forward/https://api.github.com/repos/owner/repo/issues
POST /forward/https://slack.com/api/conversations.list
PUT /forward/https://api.linear.app/graphql
```

Everything after `/forward/` is the target URL. URL-encode special characters (?, &, #, etc.).

**Required Headers:**

| Header | Value | Example |
|--------|-------|---------|
| `X-Agent-Address` | Agent wallet address | `0x1234...` |
| `X-Signature` | EIP-191 signature | `0x9876...` |
| `X-Nonce` | UUID (replay protection) | `abc-123-def-456` |
| `X-Timestamp` | Unix epoch seconds | `1740000000` |

**Signature Payload (Canonical Format):**

Signature is computed over this exact payload:

```
{HTTP_METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}
```

**Example payload:**
```
GET
https://api.github.com/repos/owner/repo/issues
abc-123-def-456
1740000000
```

**Signing steps:**
1. Construct payload as shown above (lines separated by `\n`)
2. Compute `keccak256(payload)` hash
3. Sign hash with EIP-191 personal_sign: `eth_sign("\\x19Ethereum Signed Message:\\n" + len(payload) + payload)`
4. Include signature in `X-Signature` header (0x-prefixed hex)

See [demo/agent.ts](../demo/agent.ts) for working implementation.

### Request Examples

**GET request with query string:**
```bash
curl -X GET "http://localhost:8080/forward/https://api.github.com/repos/owner/repo/issues%3Fstate%3Dopen" \
  -H "X-Agent-Address: 0x1234567890abcdef1234567890abcdef12345678" \
  -H "X-Signature: 0x1234567890abcdef..." \
  -H "X-Nonce: abc-123-def-456" \
  -H "X-Timestamp: 1740000000"
```

**POST request with body:**
```bash
curl -X POST "http://localhost:8080/forward/https://api.github.com/repos/owner/repo/issues" \
  -H "X-Agent-Address: 0x1234567890abcdef1234567890abcdef12345678" \
  -H "X-Signature: 0x1234567890abcdef..." \
  -H "X-Nonce: abc-123-def-456" \
  -H "X-Timestamp: 1740000000" \
  -H "Content-Type: application/json" \
  -d '{"title": "Bug report", "body": "Details here"}'
```

### Response Format

**JSON Response (with governance metadata):**
```json
{
  "result": {
    "id": 1,
    "title": "Example Issue",
    "body": "This is the issue body"
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "action": "read",
    "target_url": "https://api.github.com/repos/owner/repo/issues",
    "latency_ms": 142,
    "audit_tx": "0xDEF123456789abcdefDEF123456789abcdefDEF",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

**Binary/Non-JSON Response:**

For images, files, or non-JSON responses, `_governance` is injected as a base64-encoded response header:

```
HTTP/1.1 200 OK
Content-Type: image/png
X-Governance: eyJyZXF1ZXN0X2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0=
Content-Length: 1024

<binary image data>
```

**Server-Sent Events (SSE):**

For streaming responses, `_governance` is injected as the first SSE event:

```
event: _governance
data: {"request_id": "550e8400-e29b-41d4-a716-446655440000", ...}

event: message
data: {"content": "First chunk"}

event: message
data: {"content": "Second chunk"}
```

**Error Response (Any Layer):**

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32011,
    "message": "Permission denied: github.delete",
    "data": {
      "tool": "github",
      "action": "delete",
      "allowed_actions": ["read", "create", "update"],
      "upstream_status": null
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "audit_tx": "0xFED123456789abcdefFED123456789abcdefFED",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

### HTTP Method to Action Mapping

| HTTP Method | RBAC Action | Permission Required |
|-------------|-------------|----------------------|
| `GET`, `HEAD` | `read` | `{tool}.read` |
| `POST` | `create` | `{tool}.create` |
| `PUT`, `PATCH` | `update` | `{tool}.update` |
| `DELETE` | `delete` | `{tool}.delete` |

**Example:** `GET /forward/https://api.github.com/repos/owner/repo/issues` requires `github.read` permission.

### Tool Extraction (Longest Prefix Match)

Tools are registered with a `base_url`. Zuul extracts the tool using longest prefix matching:

Given config:
```yaml
tools:
  - key: github
    base_url: https://api.github.com
  - key: slack
    base_url: https://slack.com/api
```

**Examples:**
- `https://api.github.com/repos/owner/repo/issues` → tool `github`
- `https://slack.com/api/conversations.list` → tool `slack`
- `https://example.com/unknown` → 404 (unknown tool)

---

## Health Check Endpoint: `GET /health`

Liveness check for monitoring and load balancers.

**Request:**
```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1740000000
}
```

**HTTP Status:** 200 (OK) or 503 (Service Unavailable)

---

## Error Codes

All errors follow JSON-RPC 2.0 format with machine-readable error types.

### Authentication Errors (401)

| Code | Error Type | Message | Cause |
|------|-----------|---------|-------|
| **-32001** | `auth/missing_signature` | Missing signature header | X-Signature header absent |
| **-32002** | `auth/invalid_signature` | Signature verification failed | Signature invalid or recovered signer mismatch |
| **-32003** | `auth/malformed_address` | Invalid agent address format | X-Agent-Address not valid Ethereum address |
| **-32004** | `auth/nonce_reuse` | Nonce already used (replay attack) | Nonce previously submitted for this agent |
| **-32005** | `auth/stale_timestamp` | Timestamp outside acceptable range | ±5 min window violation |
| **-32006** | `auth/missing_nonce` | Missing nonce header | X-Nonce header absent |
| **-32007** | `auth/malformed_nonce` | Invalid nonce format | X-Nonce is not a valid UUID |
| **-32008** | `auth/missing_timestamp` | Missing timestamp header | X-Timestamp header absent |
| **-32009** | `auth/malformed_timestamp` | Timestamp is not a valid Unix epoch | X-Timestamp not numeric |

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32004,
    "message": "Nonce already used (replay attack)",
    "data": {
      "nonce": "abc-123-def-456"
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "error_type": "auth/nonce_reuse",
    "timestamp": 1740000000
  }
}
```

### Permission Errors (403)

| Code | Error Type | Message | Cause |
|------|-----------|---------|-------|
| **-32010** | `permission/unknown_agent` | Agent wallet not registered | Agent has no roles assigned |
| **-32011** | `permission/no_tool_access` | No access to tool | Agent missing all permissions for tool |
| **-32012** | `permission/no_action_access` | No permission for this action | Agent can use tool but not this HTTP method |
| **-32013** | `permission/wallet_revoked` | Wallet revoked (emergency) | Agent emergency revocation triggered |

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32012,
    "message": "Permission denied: github.delete",
    "data": {
      "tool": "github",
      "action": "delete",
      "allowed_actions": ["read", "create", "update"]
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "timestamp": 1740000000
  }
}
```

### Service Errors (502/503/504)

| Code | HTTP Status | Error Type | Message | Cause |
|------|-------------|-----------|---------|-------|
| **-32020** | 502 | `service/upstream_error` | Upstream service error | Tool returned 4xx/5xx |
| **-32021** | 504 | `service/upstream_timeout` | Upstream timeout | Tool did not respond within limit |
| **-32022** | 503 | `service/chain_unavailable` | Blockchain unavailable | RPC error during RBAC/audit check |
| **-32023** | 502 | `service/chain_error` | Blockchain error | Contract call failed |
| **-32024** | 500 | `service/internal_error` | Internal gateway error | Unrecoverable proxy error |

**Example Response (upstream error):**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32020,
    "message": "Upstream service error",
    "data": {
      "tool": "github",
      "upstream_status": 500,
      "upstream_message": "Internal Server Error"
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "error_type": "service/upstream_error",
    "audit_tx": "0xFED123456789abcdefFED123456789abcdefFED",
    "timestamp": 1740000000
  }
}
```

### Request Errors (400/404)

| Code | HTTP Status | Error Type | Message | Cause |
|------|-------------|-----------|---------|-------|
| **-32030** | 404 | `request/unknown_tool` | Unknown tool | Target URL doesn't match any registered tool |
| **-32031** | 400 | `request/malformed_url` | Malformed target URL | URL parsing failed |
| **-32032** | 400 | `request/http_only` | HTTP-only targets not allowed | HTTP URL in production (HTTPS required) |

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32030,
    "message": "Unknown tool",
    "data": {
      "target_url": "https://unknown.example.com/api"
    }
  },
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "error_type": "request/unknown_tool",
    "timestamp": 1740000000
  }
}
```

### Rate Limiting (429)

| Code | HTTP Status | Error Type | Message | Cause |
|------|-------------|-----------|---------|-------|
| **-32040** | 429 | `ratelimit/exceeded` | Rate limit exceeded | Too many requests in time window |
| **-32041** | 429 | `ratelimit/per_agent` | Agent rate limit exceeded | Agent-specific quota exhausted |

**Note:** Rate limiting is a stretch goal for version 2.0 and not included in MVP.

---

## Middleware Pipeline Order

Zuul processes requests in this strict order:

1. **Parse Request** — Extract target URL, validate format
2. **Signature Verification** — Recover signer from `X-Signature`, verify freshness (nonce/timestamp)
3. **Tool Extraction** — Match target URL against registered tools (longest prefix)
4. **RBAC Permission Check** — Verify agent has permission for `{tool}.{action}`
5. **Key Injection** — Inject API key as Authorization header (from custody)
6. **Forward Request** — Make upstream HTTP call (30s read, 60s write timeout)
7. **Audit Logging** — Encrypt and queue audit entry to blockchain (non-blocking)
8. **Response Wrapping** — Inject `_governance` metadata, return to agent

If any stage fails, the response includes the error code from that stage, and execution stops (no further stages).

---

## Governance Metadata (`_governance`)

Present on all responses (success and error). Contains audit trail information.

**Fields:**
- `request_id` (string, UUID) — Unique request identifier
- `agent` (string, optional) — Agent wallet address (on success, or known on auth error)
- `tool` (string, optional) — Tool key (on success, or known on tool-specific error)
- `action` (string, optional) — RBAC action mapped from HTTP method
- `target_url` (string, optional) — Full target URL (on success)
- `latency_ms` (number, optional) — Round-trip latency to upstream tool
- `audit_tx` (string, optional) — Blockchain transaction hash (on successful audit write)
- `chain_id` (number, optional) — Blockchain network ID (Hedera=295, Base=8453, etc.)
- `error_type` (string, optional) — Machine-readable error code (e.g., `auth/nonce_reuse`)
- `timestamp` (number, Unix epoch seconds) — Server time when request was processed

**Example (success):**
```json
{
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "action": "read",
    "target_url": "https://api.github.com/repos/owner/repo/issues",
    "latency_ms": 142,
    "audit_tx": "0xDEF123456789abcdefDEF123456789abcdefDEF",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

**Example (error):**
```json
{
  "_governance": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "agent": "0x1234567890abcdef1234567890abcdef12345678",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "timestamp": 1740000000
  }
}
```

---

## Timeouts

All upstream HTTP calls enforce timeouts:

- **Read operations** (GET, HEAD, OPTIONS): 30 seconds
- **Write operations** (POST, PUT, PATCH, DELETE): 60 seconds
- **Blockchain RPC calls**: 30 seconds (configurable per chain)

Exceeding timeout returns 504 with `-32021` error code.

---

## URL Encoding

Query strings in target URLs must be URL-encoded:

**Incorrect:**
```
GET /forward/https://api.github.com/search?q=language:go
```

**Correct:**
```
GET /forward/https://api.github.com/search%3Fq%3Dlanguage%3Ago
```

Most HTTP clients handle this automatically when constructing URLs.

---

## Signature Verification (Agent Implementation)

Agents must compute signatures as follows:

**TypeScript (with viem):**
```typescript
import { keccak256, toBytes, recoverMessageAddress } from 'viem';

const payload = `${method}\n${targetUrl}\n${nonce}\n${timestamp}`;
const messageHash = keccak256(toBytes(payload));

// Sign with EIP-191 personal_sign
const signature = await wallet.signMessage({
  message: payload,
});

// Recover to verify
const recoveredAddress = await recoverMessageAddress({
  message: payload,
  signature: signature,
});
```

See [demo/agent.ts](../demo/agent.ts) for complete implementation.

---

## Examples

### Discovery Flow

```bash
# 1. Discover tools (no signature required)
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0x1234..." },
    "id": "req-1"
  }'

# Response includes list of tools with allowed actions
```

### Execution Flow

```bash
# 1. Generate nonce and timestamp
NONCE=$(uuidgen)
TIMESTAMP=$(date +%s)

# 2. Sign the payload
PAYLOAD="${METHOD}\n${TARGET_URL}\n${NONCE}\n${TIMESTAMP}"
SIGNATURE=$(sign-eip191 "$PAYLOAD" "$PRIVATE_KEY")

# 3. Execute tool call
curl -X GET "http://localhost:8080/forward/https://api.github.com/repos/owner/repo/issues" \
  -H "X-Agent-Address: 0x1234..." \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Nonce: $NONCE" \
  -H "X-Timestamp: $TIMESTAMP"

# Response includes _governance metadata with audit_tx
```

---

## MVP Limitations

1. **HTTP-only** — WebSocket, gRPC, SSH not supported
2. **Tool-level RBAC** — No path-level permissions (e.g., `/repos/{owner}/{repo}` vs `/admin/`)
3. **No rate limiting** — Reserved for version 2.0
4. **Opt-in governance** — Agents must explicitly route through Zuul

---

## Stretch Goals (2.0)

- **Transparent HTTP interception** via `HTTP_PROXY` environment variable
- **WebSocket/gRPC/SSH** protocol support
- **Path-level RBAC** for fine-grained permissions
- **Rate limiting** per agent or global
