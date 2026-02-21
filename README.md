# Zuul Proxy

On-chain governance proxy for agent tool access.

Zuul is an HTTP gateway that enforces role-based access control via Ethereum-compatible smart contracts. Agents explicitly route tool calls through Zuul, which verifies signatures, checks permissions, injects API keys, and audits every request to an immutable blockchain log.

**MVP: Opt-in governance for HTTP tools. No transparent interception.**

## Quick Start

Get Zuul Proxy running locally in 5 minutes:

```bash
pnpm install           # 1. Install dependencies
pnpm contracts:build   # 2. Compile smart contracts
pnpm contracts:dev     # 3. Start Hardhat (Terminal 1)

# Then in another terminal:
pnpm setup:dev         # 4. Deploy contracts & register agents (Terminal 2)

# Optional: Add external agents (third-party wallet addresses)
# Edit scripts/register-agents.ts and add to EXTERNAL_AGENTS array, then:
# npx tsx scripts/register-agents.ts

pnpm dev               # 5. Start Zuul Proxy (Terminal 3)

# Then in another terminal:
npx tsx scripts/get-test-account-keys.ts  # 6. Get test account private keys (Terminal 4)
export AGENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
pnpm demo              # 7. Run demo agent
```

**See [DEMO_SETUP.md](./DEMO_SETUP.md) for detailed instructions with expected output.**

**New to Zuul?** Start with **[QUICKSTART.md](./QUICKSTART.md)** for detailed instructions.

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

Start here:
- **[Quick Start](./QUICKSTART.md)** — Get Zuul running in 5 minutes (recommended for new users)
- **[Demo Setup](./DEMO_SETUP.md)** — Step-by-step guide to running the demo agent (4 terminals)

## Documentation Portal

**New to Zuul?** Start with **[GETTING_STARTED.md](./GETTING_STARTED.md)** — Complete guide with learning paths for different roles

Then explore:
- **[Agent Setup](./docs/agents.md)** — Registering agents on-chain (including external third-party agents)
- **[Architecture](./docs/architecture.md)** — System design, module breakdown, trust boundaries
- **[API Reference](./docs/api.md)** — Endpoint specs, error codes, signature format
- **[Deployment](./docs/deployment.md)** — Configuration, secrets, multi-chain setup
- **[Hedera Deployment](./docs/hedera-deployment.md)** — Comprehensive guide to Hedera testnet deployment (recommended)
- **[Gas Cost Analysis](./docs/gas-cost-analysis.md)** — Hedera vs Base: 100x cheaper for audit logging
- **[Cost Optimization](./.plans/cost-optimization-analysis.md)** — v1.1 roadmap: 90% cost reduction via batching
- **[Security](./docs/security.md)** — Threat model, audit trail, key custody
- **[Hackathon Plan](./docs/ethdenver-hackathon.md)** — ETHDenver 2026 scope and bounty strategy

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

## Admin Operations

After Zuul is running, admins can use localhost-only endpoints to manage access and inspect audit logs.

### Emergency Revoke Agent

Immediately block a compromised agent:

```bash
curl -X POST http://localhost:8080/admin/rbac/revoke \
  -H 'Content-Type: application/json' \
  -d '{"agent_address": "0x1234567890123456789012345678901234567890"}'
```

**Response:**
```json
{
  "message": "Agent revoked successfully",
  "agent_address": "0x1234567890123456789012345678901234567890",
  "tx_hash": "0xDEF123..."
}
```

### Query Audit Logs via CLI (Recommended)

Use the `audit:search` CLI tool for convenient audit log queries:

```bash
# By agent
pnpm audit:search --agent 0x1234567890123456789012345678901234567890

# By agent with decryption
pnpm audit:search --agent 0x1234567890123456789012345678901234567890 --decrypt

# By time range (last 24 hours)
pnpm audit:search --from 2024-02-20 --to 2024-02-21 --limit 50

# Help
pnpm audit:search --help
```

### Query Audit Logs via HTTP

Or use raw HTTP requests:

```bash
# By agent
curl 'http://localhost:8080/admin/audit/search?agent=0x1234567890123456789012345678901234567890&limit=10'

# By time range (last hour)
HOUR_AGO=$(($(date +%s) - 3600))
curl "http://localhost:8080/admin/audit/search?startTime=$HOUR_AGO&endTime=$(date +%s)&limit=10"

# With decryption
curl 'http://localhost:8080/admin/audit/search?agent=0x1234...&decrypt=true&limit=5'
```

**Response (with decryption):**
```json
{
  "query": { "agent": "0x1234...", "decrypt": true, ... },
  "count": 3,
  "entries": [
    {
      "agent": "0x1234...",
      "timestamp": 1740000000,
      "tool": "github",
      "isSuccess": true,
      "payload": {
        "action": "read",
        "endpoint": "/repos/owner/repo/issues",
        "status": 200,
        "latencyMs": 142
      }
    }
  ]
}
```

**Important:**
- Admin endpoints are **localhost-only** (127.0.0.1, localhost, ::1)
- At least one filter (agent, tool, or time range) must be specified
- Pagination: default limit 50, max 100
- Decryption requires `decrypt=true` parameter

**Full documentation:**
- [**Admin API Reference**](./docs/api.md#admin-endpoints-localhost-only) — HTTP endpoint details
- [**CLI Tool Guide**](./docs/api.md#admin-cli-tool-auditsearch) — `pnpm audit:search` command reference

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

# Demo (all 14 user stories)
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
