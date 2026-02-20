# Demo Agent Guide

This guide explains how to run the demo agent and understand the Zuul Proxy's governance and audit capabilities.

## Quick Start

Assuming you have Hardhat, Zuul Proxy, and agents already set up:

```bash
# Terminal 1 (if not already running): Start Hardhat
pnpm contracts:dev

# Terminal 2 (if not already done): Deploy contracts and register agents
pnpm setup:dev

# Terminal 3 (if not already running): Start Zuul Proxy
pnpm dev

# Terminal 4: Run the demo
pnpm demo
```

## What the Demo Does

The demo (`demo/scenario.ts`) walks through a complete example of Zuul Proxy in action:

1. **Initialize Agent** — Sets up a wallet with a private key and proxy endpoint
2. **Discover Tools** — Calls `/rpc` to list available tools for the agent's role
3. **Make Authorized Request** — Calls a tool the agent has permission for (GET = read)
4. **Try Unauthorized Request** — Attempts an action denied by permissions (DELETE = not allowed)
5. **Inspect Governance Metadata** — Shows all governance info returned on responses
6. **Verify Audit Trail** — Demonstrates that all requests are logged on-chain

### Expected Output

```
🚀 Zuul Proxy Demo Scenario
============================================================

👤 Agent Address: 0x70997970c51812e339d9b73b0245601513...
🌐 Proxy URL: http://localhost:8080

📍 STEP 1: Discover Available Tools
────────────────────────────────────────────────────────────
✓ Found 2 tools:
  - github: GitHub REST API
    Base URL: https://api.github.com
    Allowed Actions: read, create, update
  - slack: Slack API
    Base URL: https://slack.com/api
    Allowed Actions: read

📍 STEP 2: Call GitHub API (GET /repos)
────────────────────────────────────────────────────────────
✓ GitHub call succeeded
  Response: {"id":123456,"name":"claude-code",...}
  Governance:
    request_id: req-abc123-def456
    agent: 0x70997970c51812e339d9b73b0245601513
    tool: github
    action: read
    latency_ms: 142
    audit_tx: 0xDEF123456789abcdef...
    chain_id: 31337
    timestamp: 1740000000

📍 STEP 3: Try POST (unauthorized action)
────────────────────────────────────────────────────────────
✓ POST blocked as expected: Permission denied: github.create (only allowed: read, update)

📍 STEP 4: Governance Metadata Deep Dive
────────────────────────────────────────────────────────────
ℹ All requests include _governance metadata:
  ✓ request_id  — Unique ID for tracing
  ✓ agent       — Recovered signer address
  ✓ tool        — Matched tool key
  ✓ action      — HTTP method mapped to permission
  ✓ target_url  — Full URL of upstream request
  ✓ latency_ms  — Proxy execution time
  ✓ audit_tx    — Blockchain transaction hash
  ✓ chain_id    — Network identifier
  ✓ timestamp   — Server time (Unix seconds)

📍 STEP 5: Audit Trail Verification
────────────────────────────────────────────────────────────
ℹ All requests audited to blockchain:
  ✓ Valid signatures → Agent recovered correctly
  ✓ Permission checks → Cached with 5min TTL
  ✓ Success and failure → Both audited to chain
  ✓ Governance metadata → Included on all responses
  ✓ Fail-closed behavior → 503 on chain outage (never 403)

============================================================
✅ Demo Scenario Complete
============================================================

Key takeaways:
1. Agent signs requests with EIP-191 (via viem)
2. Proxy verifies signature and recovers signer
3. RBAC permission checks are cached (5min TTL)
4. All requests (success + failure) are audited
5. Governance metadata returned on all responses
6. Fail-closed on chain outage (503, never 403)
7. Audit trail provides irrefutable record

MVP Limitations:
- Governance is opt-in (agent must route through Zuul)
- HTTP-only (no WebSocket, gRPC, SSH in MVP)
- No transparent interception (future version)
- No native MCP support (future version)
```

## Understanding the Flow

### 1. Tool Discovery

The agent calls `POST /rpc` with `tools/list`:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": { "agent_address": "0x70997970..." },
  "id": "req-1"
}
```

**Response** (filtered by agent's permissions):

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
      }
    ]
  },
  "_governance": {
    "request_id": "req-uuid",
    "agent": "0x70997970...",
    "timestamp": 1740000000
  }
}
```

### 2. Making a Signed Request

The agent signs the request using EIP-191:

```
Message to sign:
  GET\nhttps://api.github.com/repos/owner/repo\nreq-uuid-v4\n1740000000

Signed by agent's private key → 0xABC123...
```

Then makes the HTTP request:

```bash
curl -X GET http://localhost:8080/forward/https://api.github.com/repos/owner/repo \
  -H "X-Agent-Address: 0x70997970..." \
  -H "X-Signature: 0xABC123..." \
  -H "X-Nonce: req-uuid-v4" \
  -H "X-Timestamp: 1740000000"
```

### 3. Proxy Processing

The proxy:

1. **Verifies signature** — Recovers agent address from signature
2. **Extracts tool** — Matches URL to tool base_url (longest match)
3. **Maps action** — GET → `read` permission
4. **Checks permissions** — Queries RBAC contract: `hasPermission(agent, github, read)`
5. **Injects API key** — Adds `Authorization` header from key custody
6. **Forwards request** — Makes HTTP call to `https://api.github.com/repos/owner/repo`
7. **Logs audit entry** — Writes encrypted entry to Audit contract
8. **Returns response** — Includes `_governance` metadata

### 4. Understanding Governance Metadata

Every response includes `_governance` with:

| Field | Meaning | Example |
|-------|---------|---------|
| `request_id` | Unique request identifier for tracing | `req-abc123-def456` |
| `agent` | Recovered signer address (validated) | `0x70997970...` |
| `tool` | Matched tool key | `github` |
| `action` | HTTP method mapped to permission | `read` (from GET) |
| `target_url` | Full upstream URL | `https://api.github.com/repos/owner/repo` |
| `latency_ms` | Time spent forwarding to upstream | `142` |
| `audit_tx` | Blockchain transaction hash for audit | `0xDEF123...` |
| `chain_id` | Blockchain network identifier | `31337` (Hardhat) |
| `timestamp` | Server time at request completion | `1740000000` (Unix sec) |
| `error_type` (on error) | Slash-notation error category | `permission/no_action_access` |

## Using a Different Agent

### Option 1: Use a Different Test Agent

The setup script registers 5 test agents. To use Agent 2 (Admin role):

```bash
# Find the Agent 2 address from the setup output, then:
AGENT_PRIVATE_KEY=0x... pnpm demo
```

### Option 2: Register Your Own Agent

Add your agent to the RBAC contract:

```bash
# Edit scripts/setup-dev-agents.ts to add your agent address
# Or manually call:
hardhat run -c scripts/register-my-agent.ts --network localhost
```

Example:

```typescript
import { ethers } from 'hardhat';

async function registerMyAgent() {
  const [admin] = await ethers.getSigners();
  const rbac = await ethers.getContractAt('RBAC', process.env.RBAC_CONTRACT_ADDRESS!);

  const myAgentAddress = '0x...'; // Your wallet
  const developerRole = ethers.keccak256(ethers.toUtf8Bytes('developer'));

  await rbac.connect(admin).registerAgent(myAgentAddress, developerRole);
  console.log(`Registered ${myAgentAddress}`);
}

registerMyAgent();
```

## Key Concepts

### 1. EIP-191 Signatures

Agents sign messages using EIP-191 (wallet standard):

```
Format: "\x19Ethereum Signed Message:\n{length}{message}"
Message: "{METHOD}\n{TARGET_URL}\n{NONCE}\n{TIMESTAMP}"
```

The proxy recovers the signer using viem's `recoverMessageAddress()`:

```typescript
const signer = await recoverMessageAddress({
  message: canonicalPayload,
  signature: xSignature,
});
```

### 2. On-Chain Permission Checks

Permissions are stored on-chain in the RBAC contract:

```solidity
mapping(bytes32 => mapping(string => mapping(string => bool))) public permissions;
// permissions[roleId][tool][action] = bool
```

The proxy queries: `RBAC.hasPermission(agent, tool, action)` which returns:
- `true` if agent is active AND has role with permission
- `false` if agent is revoked OR role doesn't have permission

### 3. Audit Logging

Every request (success or failure) is logged to the Audit contract:

```solidity
struct AuditEntry {
  uint256 timestamp;
  bytes32 payloadHash;      // SHA-256(encrypted payload)
  bytes encryptedPayload;   // AES-256-GCM encrypted
  bytes agentSignature;     // Original X-Signature
  bytes proxySignature;     // Proxy attestation
}
```

The encrypted payload contains:
- Agent address
- Tool and action
- Endpoint called
- Status (success/denied)
- Latency
- Request/response hashes

### 4. Permission Caching

To avoid querying the blockchain on every request, permissions are cached:

```
Cache Hit (95%):
  Time: ~1ms
  Behavior: Return cached permission

Cache Miss (5%):
  Time: ~200-500ms
  Behavior: Query blockchain, cache result (5min TTL)

Cache Expiration:
  After 5 minutes, cache entry is discarded
  Next request triggers a fresh blockchain read

Chain Outage:
  If blockchain is unreachable, return 503 (fail-closed)
  Never grant access when cache is stale
```

## Error Responses

When a request fails, the response includes error details:

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
      "allowed_actions": ["read", "create", "update"]
    }
  },
  "_governance": {
    "request_id": "req-uuid",
    "agent": "0x70997970...",
    "tool": "github",
    "action": "delete",
    "error_type": "permission/no_action_access",
    "audit_tx": "0xFED...",
    "chain_id": 31337,
    "timestamp": 1740000000
  }
}
```

**Common Error Codes:**

| Code | Status | Meaning |
|------|--------|---------|
| -32001 to -32009 | 401 | Authentication errors (invalid signature, nonce reuse, timestamp drift) |
| -32010 to -32019 | 403 | Permission errors (no tool access, no action access, agent revoked) |
| -32020 to -32029 | 502/503/504 | Service errors (upstream unavailable, chain read timeout, etc.) |

## Limitations (MVP)

The current demo showcases the MVP (minimum viable product) limitations:

1. **Opt-in Governance** — Agent must explicitly route through Zuul; no transparent interception
2. **HTTP-Only** — No WebSocket, gRPC, or SSH support
3. **Tool-Level RBAC** — Permissions are at tool level (e.g., `github`), not path level (e.g., `/admin/...`)
4. **No Network Isolation** — Without infrastructure controls, agents could bypass by calling endpoints directly

These limitations are documented in the architecture and will be addressed in future versions.

## Next Steps

### Run Tests

```bash
pnpm test              # Unit tests
pnpm test:coverage     # Coverage report (must be ≥90%)
```

### Review Code

The demo agent code is in `demo/agent.ts`:

```typescript
class ZuulAgent {
  // Makes signed requests to Zuul Proxy
  async callTool(method: string, targetUrl: string, body?: unknown)
  async callToolsList()
}
```

### Deploy to Testnet

See `docs/deployment.md` for deploying to Hedera Testnet or other EVM chains.

### Read Full Docs

- **[docs/agents.md](./agents.md)** — Agent registration and management
- **[docs/api.md](./api.md)** — Complete API specification
- **[docs/architecture.md](./architecture.md)** — System design and security model
- **[docs/security.md](./security.md)** — Threat model and mitigations

---

**Questions?** Check the troubleshooting section in [QUICKSTART.md](../QUICKSTART.md).
