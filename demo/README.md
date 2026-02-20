# Zuul Proxy Demo Agent

Generic TypeScript agent demonstrating end-to-end proxy usage.

## Setup

### Prerequisites

- Node.js 22+
- pnpm
- Zuul proxy running locally (http://localhost:8080)
- Hardhat local node running (http://localhost:8545)

### Installation

```bash
pnpm install
```

### Environment Variables

Create `.env` in project root (optional):

```bash
# Hardhat local node
HARDHAT_NETWORK=localhost

# Demo agent private key (for testing only!)
AGENT_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111

# Proxy configuration
PROXY_URL=http://localhost:8080
```

## Running the Demo

### 1. Start Hardhat Local Node

```bash
pnpm contracts:dev
```

### 2. Deploy Contracts

```bash
pnpm contracts:deploy:local
```

### 3. Start Zuul Proxy

In a new terminal:

```bash
pnpm dev
```

### 4. Run Demo Agent

In another terminal:

```bash
pnpm demo
```

## Scenario Flow

The demo agent runs the following scenario:

1. **Tool Discovery** → Agent calls `tools/list` via RPC
2. **Valid Request** → Agent signs and forwards GET request to GitHub API
3. **Permission Denied** → Agent attempts POST (unauthorized action)
4. **Governance Metadata** → Agent inspects and displays metadata
5. **Audit Trail** → Agent verifies blockchain audit trail information

## Expected Output

```
🚀 Zuul Proxy Demo Scenario
============================================================

👤 Agent Address: 0x1234...
🌐 Proxy URL: http://localhost:8080

📍 STEP 1: Discover Available Tools
------------------------------------------------------------
✓ Found 2 tools:
  - github: GitHub API
    Base URL: https://api.github.com
    Allowed Actions: read
  - slack: Slack API
    Base URL: https://slack.com/api
    Allowed Actions: read

📍 STEP 2: Call GitHub API (GET /repos)
------------------------------------------------------------
✓ GitHub call succeeded
  Response: {"id": 123, "name": "claude-code"...}

📋 Governance Metadata:
  Request ID:   abc-123-def-456
  Agent:        0x1234...
  Tool:         github
  Action:       read
  Latency:      142ms
  Audit TX:     0xDEADBEEF...
  Chain ID:     31337
  Timestamp:    2026-02-21T10:30:45.000Z

📍 STEP 3: Try POST (unauthorized action)
------------------------------------------------------------
✓ POST blocked as expected: Tool call failed: 403 -32011 Permission denied: github.create

📍 STEP 4: Governance Metadata Deep Dive
------------------------------------------------------------
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
------------------------------------------------------------
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

## Code Structure

- **agent.ts** — `ZuulAgent` class
  - `signRequest()` — Sign with EIP-191
  - `callToolsList()` — RPC tools/list discovery
  - `callTool()` — Forward tool execution
  - `printGovernance()` — Pretty-print metadata

- **scenario.ts** — Demo orchestration script
  - Coordinates tool discovery, execution, and error flows
  - Demonstrates governance metadata and audit trail

## Testing Against Remote Proxy

To test against a remote proxy (e.g., Hedera testnet):

```bash
PROXY_URL=https://zuul.example.com pnpm demo
```

## Notes

- This demo agent uses no SDK dependencies (no MCP SDK, no OpenClaw)
- All signing is via viem (EIP-191 standard)
- Responses include `_governance` metadata on all calls
- Audit trail is written to blockchain (queryable on-chain)
- MVP limitation: Governance is opt-in (agent must explicitly route through Zuul)

## Troubleshooting

### Connection refused on localhost:8080

Make sure the Zuul proxy is running (`pnpm dev` in another terminal).

### Connection refused on localhost:8545

Make sure Hardhat local node is running (`pnpm contracts:dev`).

### RPC error: Unknown tool

Tools are defined in config. In MVP, only pre-configured tools are discoverable. GitHub API in demo requires config entry.

### Permission denied errors

Expected for unauthorized actions (e.g., POST when only GET is allowed). This demonstrates the RBAC system working correctly.
