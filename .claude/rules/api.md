---
paths:
  - "src/**/*.ts"
---

# HTTP API: Path-Based Routing with RPC Discovery

## MVP Design

The Zuul proxy exposes **two distinct HTTP surfaces**:

1. **`POST /rpc`** — JSON-RPC 2.0 endpoint for tool discovery and metadata queries
2. **`ANY /forward/{target_url}`** — HTTP forwarding for actual tool calls

This design is **NOT the MCP protocol**. It's HTTP-based governance where agents explicitly route through Zuul. Agents know they must call Zuul to access HTTP services. Governance is opt-in and explicit, not transparent.

---

## Core Principle

**Path-based forwarding makes intent explicit.** Agent signs over the full URL + method. No ambiguity, no post-hoc parameter extraction. Tool extraction and RBAC validation happen at ingress.

---

## Endpoint 1: RPC Discovery (`POST /rpc`)

JSON-RPC 2.0 endpoint for tool discovery and agent metadata queries. **Signature verification NOT required** for `tools/list` (agent address used to filter results).

### tools/list

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {
    "agent_address": "0x1234..."
  },
  "id": "req-1"
}
```

**Response:**
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
        "description": "GitHub API"
      },
      {
        "key": "slack",
        "base_url": "https://slack.com/api",
        "allowed_actions": ["read"],
        "description": "Slack API"
      }
    ]
  },
  "_governance": {
    "request_id": "req-uuid-v4",
    "agent": "0x1234...",
    "timestamp": 1740000000
  }
}
```

**Behavior:**
- Filter tools by agent's RBAC permissions
- Agent only sees tools they have at least one permission for
- Returns tool key, base_url, allowed_actions, description
- Does NOT return API keys
- No signature verification required for discovery

### tools/describe (Optional)

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/describe",
  "params": {
    "agent_address": "0x1234...",
    "tool_key": "github"
  },
  "id": "req-2"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "req-2",
  "result": {
    "tool_key": "github",
    "base_url": "https://api.github.com",
    "description": "GitHub API",
    "paths": [
      {
        "path": "/repos/{owner}/{repo}/issues",
        "methods": ["GET", "POST"],
        "description": "Manage repository issues"
      }
    ]
  },
  "_governance": {
    "request_id": "req-uuid-v4",
    "agent": "0x1234...",
    "timestamp": 1740000000
  }
}
```

---

## Endpoint 2: HTTP Forwarding (`GET|POST|PUT|PATCH|DELETE /forward/{target_url}`)

### Request Path Pattern

```
GET /forward/https://api.github.com/repos/owner/repo/issues
POST /forward/https://slack.com/api/conversations.list
PUT /forward/https://api.linear.app/graphql
```

The HTTP method is preserved and forwarded to the backend. Everything after `/forward/` is the target URL (must be URL-encoded if it contains query strings).

### Request Headers (Required)

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Agent-Address` | `0x1234...` | Agent wallet address |
| `X-Signature` | `0x9876...` | Signature over canonical payload |
| `X-Nonce` | UUID | Replay protection (per agent) |
| `X-Timestamp` | Unix epoch seconds | Freshness check (±5 min) |

### Signature Payload (Canonical)

**Format:**
```
{METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}
```

**Example:**
```
GET\nhttps://api.github.com/repos/owner/repo/issues\nabc-123\n1740000000
```

Agent computes `keccak256(payload)`, signs with EIP-191, and includes signature in `X-Signature` header.

This ensures:
- Method and full URL are covered (can't replay GET as POST)
- Nonce prevents replay attacks
- Timestamp prevents stale requests (±5 minutes)

### Request Flow (Middleware Pipeline)

1. **Parse Request** — Extract target URL from path, validate format
2. **Signature Verification** — Recover signer from `X-Signature`, must match `X-Agent-Address`
3. **Nonce Check** — Validate nonce not used before (scoped to agent address)
4. **Timestamp Check** — Validate within ±5 minutes of server time
5. **Tool Extraction** — Match target URL against registered tool `base_url` (longest match wins)
6. **RBAC Check** — Verify agent has permission for `{tool_key}.{action}` where action is inferred from HTTP method
7. **Key Injection** — Inject `Authorization` header with API key from custody
8. **Forward** — Make upstream HTTP call (30s read timeout, 60s write timeout)
9. **Audit** — Write encrypted audit entry to blockchain (non-blocking)
10. **Response Wrap** — Inject `_governance` metadata, return to agent

### Response Format

**JSON Response:**
```json
{
  "result": {
    ... original upstream response body ...
  },
  "_governance": {
    "request_id": "req-uuid-v4",
    "agent": "0x1234...",
    "tool": "github",
    "action": "read",
    "target_url": "https://api.github.com/repos/owner/repo/issues",
    "latency_ms": 142,
    "audit_tx": "0xDEF...",
    "chain_id": 8453,
    "timestamp": 1740000000
  }
}
```

**Non-JSON Response (Binary, Images, Text):**
- `_governance` injected in `X-Governance` response header as base64-encoded JSON
- Response body passed through unchanged

**Server-Sent Events (SSE):**
- `_governance` injected as first SSE event: `event: _governance\ndata: {...}\n\n`

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
      "allowed_actions": ["read"],
      "upstream_status": null
    }
  },
  "_governance": {
    "request_id": "req-uuid-v4",
    "agent": "0x1234...",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "audit_tx": "0xFED...",
    "chain_id": 8453,
    "timestamp": 1740000000
  }
}
```

---

## HTTP Method to RBAC Action Mapping

```
GET    -> read
HEAD   -> read
POST   -> create
PUT    -> update
PATCH  -> update
DELETE -> delete
```

Example: `GET /forward/https://api.github.com/repos/owner/repo/issues` requires `github.read` permission.

---

## Tool Extraction Logic

Tools are registered in `config.yaml` with a `base_url` field. Tool extraction uses **longest prefix match**:

```yaml
tools:
  - key: github
    base_url: https://api.github.com
    key_ref: GITHUB_API_KEY
    description: GitHub API

  - key: openai
    base_url: https://api.openai.com
    key_ref: OPENAI_API_KEY
    description: OpenAI API

  - key: slack
    base_url: https://slack.com/api
    key_ref: SLACK_BOT_TOKEN
    description: Slack API
```

**Example:**
- Request: `GET /forward/https://api.github.com/repos/owner/repo/issues`
- Extract target URL: `https://api.github.com/repos/owner/repo/issues`
- Longest prefix match: `https://api.github.com` → tool key `github`
- No match → 404 with `-32004` (unknown tool)

---

## Health & Discovery Endpoints

### GET /health

Liveness check, no authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1740000000
}
```

### GET /.well-known/zuul (Optional)

MCP-compatible discovery manifest (for future integration).

**Response:**
```json
{
  "name": "zuul-proxy",
  "version": "1.0.0",
  "baseUrl": "https://zuul:8080",
  "rpcs": {
    "tools/list": "POST /rpc"
  },
  "forwarding": {
    "pattern": "/forward/{target_url}",
    "authenticated": true
  }
}
```

---

## URL Encoding and Special Cases

**Query strings in target URL:**
```
GET /forward/https://api.github.com/repos/owner/repo/issues?state=open&sort=created
```

URL-encode the query string if it contains special characters:
```
GET /forward/https://api.github.com/repos/owner/repo/issues%3Fstate%3Dopen%26sort%3Dcreated
```

Most HTTP frameworks (Hono, Fastify) can be configured to preserve the full path after `/forward/` including `?` and `&`. Verify this in your router.

**HTTPS enforcement:**
- Only HTTPS target URLs allowed in production
- HTTP allowed in local dev mode only (via config flag)
- Non-HTTPS → 400 with error

**Redirects:**
- Zuul does NOT follow 3xx redirects
- Return redirect to agent as-is (agent decides)
- Reason: redirect target may be outside tool's `base_url`, bypassing scope

**Request body forwarding:**
- For `POST`/`PUT`/`PATCH`, stream request body to upstream unchanged
- Do not buffer large bodies in memory
- Support chunked transfer encoding

---

## Known Limitations (MVP)

1. **Governance is opt-in** — Agent must explicitly route through Zuul
2. **HTTP-only** — No WebSocket, gRPC, SSH in MVP
3. **No native MCP support** — Agent cannot use GitHub MCP, Slack MCP directly
4. **No network isolation** — Without infrastructure controls, agents could bypass by making direct HTTP calls
5. **Tool scope is coarse** — RBAC enforced at tool level (e.g., `github`), not at path level (e.g., `/repos/...` vs `/admin/...`)

---

## Stretch Goals (2.0)

- **Transparent HTTP_PROXY** — Intercept normal HTTP calls via environment variable
- **Native MCP Server Support** — Zuul acts as MCP gateway to backend servers
- **Path-level RBAC** — Fine-grained permissions per endpoint path
- **WebSocket, gRPC, SSH** — Non-HTTP protocol support
