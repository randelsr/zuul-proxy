# 🚀 Zuul Proxy — Quick Start (5 minutes)

Get Zuul Proxy running locally with the demo agent in **5 minutes**.

## Prerequisites

- **Node.js 22+** — Check: `node --version`
- **pnpm** — Install: `npm install -g pnpm`
- **Git** — For cloning the repo

---

## Step 1: Clone and Install (1 minute)

```bash
git clone https://github.com/example/zuul-proxy.git
cd zuul-proxy
pnpm install
```

---

## Step 2: Set Up Environment Variables (1 minute)

Copy the example configuration:

```bash
cp .env.example .env
```

Now open `.env` and verify the values for local Hardhat:

```bash
# .env should contain:
HEDERA_RPC_URL=http://127.0.0.1:8545
RBAC_CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9c21c841F97B39DCd
AUDIT_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
AUDIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590

# Tool keys (dummy values for local testing)
GITHUB_API_KEY=test-github-api-key
SLACK_BOT_TOKEN=test-slack-bot-token
OPENAI_API_KEY=test-openai-api-key
```

No changes needed for local development — these are test values.

---

## Step 3: Compile Smart Contracts (30 seconds)

```bash
pnpm contracts:build
```

---

## Step 4: Start Local Blockchain (Terminal 1)

```bash
pnpm contracts:dev
```

**Expected output:**
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
```

Keep this terminal running.

---

## Step 5: Start Zuul Proxy (Terminal 2)

```bash
pnpm dev
```

The `.env` file is **automatically loaded** by dotenv. You should see:

**Expected output:**
```
> zuul-proxy@1.0.0 dev
> tsx watch src/index.ts

[INFO] Server running at http://localhost:8080
[INFO] Health check: curl http://localhost:8080/health
```

Keep this terminal running.

---

## Step 6: Run Demo Agent (Terminal 3)

```bash
pnpm demo
```

**Expected output:**
```
✓ Agent initialized: 0x70997970c51812e339d9b73b0245601513...
✓ Discovered 2 tools: github, slack

Step 1: List available tools
  ✓ GET /rpc (tools/list)
  Tools available: github (read, create, update), slack (read, create)

Step 2: Make authorized GET request
  ✓ GET /forward/https://api.github.com/repos/owner/repo/issues
  Status: 200 OK
  Latency: 142ms
  Audit TX: 0xDEF123456789abcdef...

Step 3: Attempt unauthorized DELETE request
  ✗ DELETE /forward/https://api.github.com/repos/owner/repo
  Status: 403 (Permission Denied)
  Error: github.delete not allowed (only read, create, update)

Step 4: Verify governance metadata
  ✓ Request ID matches audit trail
  ✓ Governance metadata includes audit transaction

Step 5: Check audit trail on blockchain
  ✓ Audit entry confirmed on-chain
  ✓ Dual signatures verified (agent + proxy)

All tests passed! ✅
```

---

## ✅ Success!

All three components are now running:

1. **Hardhat** (Terminal 1) — Local blockchain at `http://127.0.0.1:8545`
2. **Zuul Proxy** (Terminal 2) — HTTP gateway at `http://localhost:8080`
3. **Demo Agent** (Terminal 3) — Making signed requests and verifying audit trail

---

## Try It Yourself

### Health Check

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

### Discover Tools

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0x70997970c51812e339d9b73b0245601513..." },
    "id": 1
  }'
```

### Make a Signed Request

See `demo/agent.ts` for the signature generation code, or consult `docs/api.md` for the full signing process.

---

## Environment Variables Explained

The `.env` file is **automatically loaded** when you run `pnpm dev`. Variables include:

| Variable | Purpose | Local Dev Value |
|----------|---------|-----------------|
| `HEDERA_RPC_URL` | Blockchain RPC endpoint | `http://127.0.0.1:8545` (Hardhat) |
| `RBAC_CONTRACT_ADDRESS` | Permission contract | Deployed address |
| `AUDIT_CONTRACT_ADDRESS` | Audit log contract | Deployed address |
| `AUDIT_ENCRYPTION_KEY` | Audit payload encryption | Test key (64 hex chars) |
| `WALLET_PRIVATE_KEY` | Proxy signing key | Hardhat account #0 |
| `GITHUB_API_KEY` | GitHub tool key | Dummy value for testing |
| `SLACK_BOT_TOKEN` | Slack tool key | Dummy value for testing |
| `OPENAI_API_KEY` | OpenAI tool key | Dummy value for testing |

---

## Troubleshooting

### "Connection refused" (Hardhat)
Hardhat node not running. Start in Terminal 1:
```bash
pnpm contracts:dev
```

### "Port 8080 already in use"
Change port:
```bash
PORT=8081 pnpm dev
```

### ".env file not found"
Create it:
```bash
cp .env.example .env
```

### "Missing environment variable: AUDIT_ENCRYPTION_KEY"
Check that `.env` exists and has all required variables:
```bash
cat .env | grep AUDIT_ENCRYPTION_KEY
```

### "Cannot connect to contract at 0x5FbDB2..."
Contract addresses may be different. Deploy contracts and update `.env`:
```bash
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost
pnpm hardhat run scripts/get-contract-address.ts --network localhost
# Copy addresses to .env
```

---

## Next Steps

### Run Tests
```bash
pnpm test              # Unit tests
pnpm test:coverage     # Coverage report
```

### Type Checking
```bash
pnpm typecheck
```

### Review Documentation
- **[README.md](./README.md)** — Project overview
- **[docs/architecture.md](./docs/architecture.md)** — System design
- **[docs/api.md](./docs/api.md)** — Complete API reference
- **[docs/deployment.md](./docs/deployment.md)** — Deploy to testnet/production
- **[docs/security.md](./docs/security.md)** — Threat model and security

### Deploy to Testnet
See [docs/deployment.md](./docs/deployment.md#hedera-testnet) for Hedera testnet deployment.

---

## Project Structure

```
zuul-proxy/
├── src/
│   ├── index.ts               ← Entry point (loads .env, starts server)
│   ├── api/server.ts          ← HTTP server and middleware
│   ├── auth/                  ← Signature verification
│   ├── rbac/                  ← Permission checking
│   ├── custody/               ← API key management
│   ├── proxy/                 ← HTTP forwarding
│   ├── audit/                 ← Blockchain logging
│   ├── chain/                 ← Blockchain drivers
│   └── config/                ← Configuration loading
├── contracts/                 ← Smart contracts (RBAC, Audit)
├── tests/                     ← Unit and integration tests
├── demo/                      ← Demo agent with signing
├── .env                       ← Local configuration (gitignored)
├── .env.example               ← Configuration template
├── config.yaml                ← Tool and role definitions
└── README.md                  ← Full documentation
```

---

## What's Happening?

1. **Hardhat** provides a local Ethereum-compatible blockchain
2. **Smart contracts** (RBAC, Audit) are deployed to Hardhat
3. **Zuul Proxy** starts an HTTP server that:
   - Verifies agent signatures (EIP-191)
   - Checks permissions on-chain (RBAC contract)
   - Injects API keys into upstream requests
   - Logs all requests to blockchain (Audit contract)
4. **Demo Agent** makes signed requests to test the full flow
5. **Audit trail** is recorded on the local blockchain

---

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Signature recovery | ~10ms | viem library |
| RBAC cache hit | ~1ms | In-memory Map |
| RBAC chain read | ~200-500ms | First request per agent |
| HTTP forward | ~100-1000ms | Depends on upstream |
| Total (with cache) | ~100-200ms | P50 |
| Total (first time) | ~500-1000ms | P95 |

---

That's it! You now have Zuul Proxy running locally with full governance and audit trails. 🎉