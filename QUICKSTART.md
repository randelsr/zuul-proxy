# 🚀 Zuul Proxy — Quick Start

Get Zuul Proxy running **in 5 minutes (local) or 15 minutes (Hedera testnet)**.

## Choose Your Path

| Path | Time | Best For | Blockchain |
|------|------|----------|-----------|
| 🏠 **Local Hardhat** | 5 min | Learning, fast development | Local node (http://127.0.0.1:8545) |
| 🌍 **Hedera Testnet** | 15 min | Real blockchain testing, demos | Hedera Testnet (chainId 295) |

**Recommended:** Start with Local Hardhat, then try Hedera Testnet once you understand the system.

## Prerequisites

- **Node.js 22+** — Check: `node --version`
- **pnpm** — Install: `npm install -g pnpm`
- **Git** — For cloning the repo

---

## Choose Your Environment

Pick one:

### 🏠 **Local Development (Hardhat)** — Recommended for learning
- No blockchain setup needed
- Instant deployments (no waiting for blocks)
- Full control over test accounts
- Free testnet HBAR not needed
- Fastest feedback loop

### 🌍 **Hedera Testnet** — For real blockchain testing
- Test on actual Hedera testnet
- Verify contracts on Hashscan explorer
- Real blockchain behavior
- Costs ~$2-3 for deployment

---

## Step 1: Clone and Install (1 minute)

```bash
git clone https://github.com/example/zuul-proxy.git
cd zuul-proxy
pnpm install
```

---

## Step 2: Choose Environment Setup

### Option A: Local Hardhat (Recommended for MVP)

Create `.env` for local development:

```bash
cp .env.example .env
```

Verify `.env` contains (for local Hardhat):

```bash
# Blockchain
HEDERA_RPC_URL=http://127.0.0.1:8545

# Contracts (will be auto-updated by deployment script)
RBAC_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
AUDIT_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Keys
AUDIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590

# Tool keys (dummy values)
GITHUB_API_KEY=test-github-api-key
SLACK_BOT_TOKEN=test-slack-bot-token
OPENAI_API_KEY=test-openai-api-key
```

No RPC URL change needed — uses local Hardhat node at `http://127.0.0.1:8545`

**→ Skip to "Step 3: Compile Smart Contracts"**

---

### Option B: Hedera Testnet (Real Blockchain)

**Prerequisites:**
1. Create Hedera testnet account: https://portal.hedera.com/register
2. Fund with testnet HBAR: https://testnet.hedera.com/faucet (get 100 HBAR)
3. Copy your account ID and private key from portal

Create `.env.hedera` for Hedera testnet:

```bash
# Blockchain Configuration
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_PRIVATE_KEY=0x<your_private_key_from_hedera_portal>

# Contracts (will be auto-populated after deployment)
RBAC_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
AUDIT_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Keys
AUDIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
WALLET_PRIVATE_KEY=0x<same_as_HEDERA_PRIVATE_KEY>

# Tool keys (dummy values for testing)
GITHUB_API_KEY=test-github-api-key
SLACK_BOT_TOKEN=test-slack-bot-token
OPENAI_API_KEY=test-openai-api-key
```

**Make sure:**
- `HEDERA_RPC_URL` points to testnet RPC endpoint
- `HEDERA_PRIVATE_KEY` is funded with testnet HBAR
- `WALLET_PRIVATE_KEY` matches `HEDERA_PRIVATE_KEY` (same account signs transactions)

**Load Hedera environment:**
```bash
cp .env.hedera .env    # Use Hedera config
# OR keep as separate file and load explicitly when needed
```

**→ Continue to "Step 3: Compile Smart Contracts"**

---

## Step 3: Compile Smart Contracts (30 seconds)

```bash
pnpm contracts:build
```

**Expected console output:**
```
> zuul-proxy@1.0.0 contracts:build
> hardhat compile && echo && echo '✓ Compiled contracts created in artifacts/:' && ls -1 artifacts/contracts/*/

Compiled 2 Solidity files with solc 0.8.20 (evm target: shanghai)
No Solidity tests to compile

✓ Compiled contracts created in artifacts/:
artifacts/contracts/Audit.sol/:
artifacts.d.ts
Audit.json

artifacts/contracts/RBAC.sol/:
artifacts.d.ts
RBAC.json
```

**Note:** You may see a Node.js version warning (if using Node 23). This is safe to ignore for MVP development.

**What was created:**

| File | Purpose |
|------|---------|
| `artifacts/contracts/RBAC.sol/RBAC.json` | Compiled RBAC contract (ABI + bytecode) |
| `artifacts/contracts/Audit.sol/Audit.json` | Compiled Audit contract (ABI + bytecode) |
| `artifacts/contracts/*/artifacts.d.ts` | TypeScript type definitions |

These compiled artifacts are used when you deploy the contracts to the blockchain in Step 4. Each `.json` file contains:
- **ABI** — Function signatures (what functions exist and their parameters)
- **Bytecode** — Machine code to deploy to blockchain
- **Metadata** — Compiler version, optimization settings, etc.

---

## Step 4: Deploy Smart Contracts

### For Local Hardhat Development

#### 4a. Start Local Blockchain (Terminal 1)

```bash
pnpm contracts:dev
```

**Expected output:**
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
```

Keep this terminal running.

#### 4b. Deploy Contracts (Terminal 2)

```bash
# Deploy to local Hardhat
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost
```

**Expected output:**
```
✓ Deployment complete

Deployments:
RBAC contract: 0x5FbDB2315678afccb333f8a9c21c841F97B39DCd
Audit contract: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

**Save these addresses!** Update `.env`:
```bash
RBAC_CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9c21c841F97B39DCd
AUDIT_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

---

### For Hedera Testnet Deployment

#### 4a. Deploy Contracts to Hedera

```bash
# Load Hedera environment
export $(cat .env.hedera | grep -v '#' | xargs)

# Deploy to Hedera testnet
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet
```

**Expected output:**
```
✓ Deployment complete

Deployments:
RBAC contract: 0xCCCC1111...
Audit contract: 0xDDDD2222...
```

**Save these addresses!** Update `.env.hedera`:
```bash
RBAC_CONTRACT_ADDRESS=0xCCCC1111...
AUDIT_CONTRACT_ADDRESS=0xDDDD2222...
```

#### 4b. Verify Deployment on Hashscan

Visit Hashscan explorer to verify contracts were deployed:
```
https://testnet.hashscan.io/contract/0xCCCC1111...
https://testnet.hashscan.io/contract/0xDDDD2222...
```

Both should show the contract code.

---

## Step 5: Register Test Agents

### For Local Hardhat

Register test agents on your local deployment:

```bash
# Make sure .env is loaded (local Hardhat config)
npx tsx scripts/register-agents.ts
```

**Expected output:**
```
🤖 Registering test agents to RBAC contract...

📍 Admin signer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
📍 RBAC contract: 0x5FbDB2315678afccb333f8a9c21c841F97B39DCd

📋 Found 2 roles:
   • Developer (developer_role)
   • Administrator (admin_role)

📝 Registering 2 test agents:
   Agent 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
   Role: Developer
   ✓ Registered (tx: 0x...)
   ✓ Role activated (tx: 0x...)

✅ Agent registration complete!
```

---

### For Hedera Testnet

Register test agents on Hedera:

```bash
# Load Hedera environment
export $(cat .env.hedera | grep -v '#' | xargs)

# Register agents on Hedera
npx tsx scripts/register-agents.ts
```

**Expected output:** Same as above, but transactions go to Hedera testnet

**Verify on Hashscan:**
```
https://testnet.hashscan.io/contract/0xCCCC1111...
# Check "State" tab to see agentRoles mapping populated
```

---

## Step 6: Start Zuul Proxy

### For Local Hardhat (Terminal 3)

```bash
# Make sure .env is loaded (local config)
pnpm dev
```

**Expected output:**
```
> zuul-proxy@1.0.0 dev
> tsx watch src/index.ts

[INFO] Server running at http://localhost:8080
[INFO] Health check: curl http://localhost:8080/health
[INFO] Loaded 3 tools from config: github, slack, openai
[INFO] Permission cache initialized with TTL 300s
[INFO] Connected to Hardhat node at http://127.0.0.1:8545
```

Keep this terminal running.

---

### For Hedera Testnet (Terminal 3)

```bash
# Load Hedera environment first
export $(cat .env.hedera | grep -v '#' | xargs)

# Start proxy with Hedera config
pnpm dev
```

**Expected output:**
```
> zuul-proxy@1.0.0 dev
> tsx watch src/index.ts

[INFO] Server running at http://localhost:8080
[INFO] Health check: curl http://localhost:8080/health
[INFO] Loaded 3 tools from config: github, slack, openai
[INFO] Permission cache initialized with TTL 300s
[INFO] Connected to Hedera testnet at https://testnet.hashio.io/api
```

---

## Step 7: Get Test Account Private Keys (Terminal 4)

Get the private keys for registered agents:

### For Local Hardhat

```bash
npx tsx scripts/get-test-account-keys.ts
```

**Expected output:**
```
🔑 Hardhat Test Account Private Keys

📁 Loaded registered agents from .agents.json

Registered agents:
  Agent 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Developer)
  Agent 2: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Administrator)

Available Test Accounts:
=======================

Account 0:
  Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  ✓ Registered as Agent 1 (Developer)

Account 1:
  Address:     0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  Private key: 0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5
  ✓ Registered as Agent 2 (Administrator)
```

### For Hedera Testnet

**Use the private key you used for deployment:**
```bash
# The private key from your Hedera portal (from .env.hedera)
export AGENT_PRIVATE_KEY="0x<your_hedera_private_key>"
```

---

## Step 8: Run Demo Agent (Terminal 4)

### For Local Hardhat

Run the demo agent with one of the Hardhat test account private keys:

```bash
# Use Agent 1 (Developer) with 2 tools
export AGENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
pnpm demo
```

Or try Agent 2 (Administrator) with more permissions:

```bash
# Use Agent 2 (Administrator) with 3 tools
export AGENT_PRIVATE_KEY="0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5"
pnpm demo
```

---

### For Hedera Testnet

Run the demo agent with your Hedera testnet private key:

```bash
# Load Hedera environment
export $(cat .env.hedera | grep -v '#' | xargs)

# Run demo against Hedera
pnpm demo
```

**What happens:**
1. Agent authenticates with your Hedera account
2. Proxy queries RBAC contract on Hedera testnet
3. Finds your role and permissions
4. Returns available tools
5. Logs demo requests to Hedera blockchain
6. You can verify requests on Hashscan explorer

**Expected output for Agent 1 (Developer):**
```
🚀 Zuul Proxy Demo Scenario
============================================================
📁 Loaded registered agents from .agents.json

Registered agents:
  Agent 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Developer)
  Agent 2: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Administrator)

👤 Agent Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
🌐 Proxy URL: http://localhost:8080

📍 STEP 1: Discover Available Tools
------------------------------------------------------------
✓ Found 2 tools:
  - github: GitHub REST API
    Base URL: https://api.github.com
    Allowed Actions: read, create, update
  - slack: Slack API
    Base URL: https://slack.com/api
    Allowed Actions: read

📍 STEP 2: Call GitHub API (GET /repos)
------------------------------------------------------------
ℹ GitHub call attempt (expected in MVP): Error: Tool call failed: 401 undefined undefined

📍 STEP 3: Try POST (unauthorized action)
------------------------------------------------------------
✓ POST blocked as expected: Error: Tool call failed: 401 undefined undefined

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
```

---

## ✅ Success!

All components are now set up and running:

1. **Hardhat** (Terminal 1) — Local blockchain at `http://127.0.0.1:8545`
2. **Contracts & Agents** (Terminal 2) — Setup complete, agents registered on-chain
3. **Zuul Proxy** (Terminal 3) — HTTP gateway at `http://localhost:8080`
4. **Demo Agent** (Terminal 4) — Making signed requests and verifying audit trail

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

### Discover Tools for Agent 1 (Developer)

List the 2 tools available to the Developer role:

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    "id": 1
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "key": "github",
        "base_url": "https://api.github.com",
        "description": "GitHub REST API",
        "allowed_actions": ["read", "create", "update"]
      },
      {
        "key": "slack",
        "base_url": "https://slack.com/api",
        "description": "Slack API",
        "allowed_actions": ["read"]
      }
    ]
  },
  "_governance": {
    "request_id": "14064c03-efac-4105-bf70-d8502538ec9b",
    "agent": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

### Discover Tools for Agent 2 (Administrator)

List the 3 tools available to the Administrator role (includes openai):

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
    "id": 1
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "key": "github",
        "base_url": "https://api.github.com",
        "description": "GitHub REST API",
        "allowed_actions": ["read", "create", "update", "delete"]
      },
      {
        "key": "slack",
        "base_url": "https://slack.com/api",
        "description": "Slack API",
        "allowed_actions": ["read", "create"]
      },
      {
        "key": "openai",
        "base_url": "https://api.openai.com/v1",
        "description": "OpenAI API",
        "allowed_actions": ["read", "create"]
      }
    ]
  },
  "_governance": {
    "request_id": "d9ef70a7-70d6-431e-8b0b-7122c1ccdbba",
    "agent": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "chain_id": 295,
    "timestamp": 1740000000
  }
}
```

### Make a Signed Request

See `demo/agent.ts` for the signature generation code, or consult `docs/api.md` for the full signing process. The `pnpm demo` command shows how to sign requests with EIP-191.

---

## Environment Variables Explained

The `.env` file is **automatically loaded** when you run `pnpm dev`. Variables include:

| Variable | Purpose | Local Dev Value | Updated By |
|----------|---------|-----------------|------------|
| `HEDERA_RPC_URL` | Blockchain RPC endpoint | `http://127.0.0.1:8545` (Hardhat) | Manual setup |
| `RBAC_CONTRACT_ADDRESS` | Permission contract address | Deployed by Ignition | `pnpm setup:dev` |
| `AUDIT_CONTRACT_ADDRESS` | Audit log contract address | Deployed by Ignition | `pnpm setup:dev` |
| `AUDIT_ENCRYPTION_KEY` | Audit payload encryption | Test key (64 hex chars) | Manual setup |
| `GITHUB_API_KEY` | GitHub tool API key | Dummy value for testing | Manual setup |
| `SLACK_BOT_TOKEN` | Slack tool bot token | Dummy value for testing | Manual setup |
| `OPENAI_API_KEY` | OpenAI tool API key | Dummy value for testing | Manual setup |

**Note:** Contract addresses are **automatically updated** by `pnpm setup:dev` when contracts are deployed. You don't need to update them manually.

---

## Deployment Comparison: Local vs Hedera

| Aspect | Local Hardhat | Hedera Testnet |
|--------|---|---|
| **Setup time** | 2 minutes | 10 minutes |
| **Blockchain** | Local (fast) | Real testnet |
| **Cost** | Free | ~$2-3 |
| **Block time** | Instant | ~3 seconds |
| **Verification** | Local logs | Hashscan explorer |
| **Persistence** | Lost on restart | Permanent |
| **Best for** | Learning, development | Testing, demos |

---

## Troubleshooting

### Local Hardhat Issues

#### "Connection refused" (Hardhat node)
Hardhat node not running. Start in Terminal 1:
```bash
pnpm contracts:dev
```

#### "Port 8080 already in use"
Change port:
```bash
PORT=8081 pnpm dev
```

#### ".env file not found"
Create it:
```bash
cp .env.example .env
```

#### "Cannot connect to contract at 0x5FbDB2..."
Contract addresses may be different after restarting Hardhat. Redeploy:
```bash
# Kill old Hardhat node and restart
pnpm contracts:dev    # In Terminal 1

# Then redeploy contracts and register agents
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost

# Register agents
npx tsx scripts/register-agents.ts
```

#### "No agents registered" or "permission denied" errors
Make sure you registered agents:
```bash
npx tsx scripts/register-agents.ts
```

---

### Hedera Testnet Issues

#### "Connection refused" (Hedera RPC)
Hedera testnet RPC is down or your IP is blocked. Verify:
```bash
curl -X POST https://testnet.hashio.io/api \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","result":"0x127","id":1}
```

#### "Account not funded"
Get testnet HBAR from faucet:
```bash
# Go to https://testnet.hedera.com/faucet
# Enter your account ID (from Hedera portal)
# Request 100 testnet HBAR
```

Wait 30 seconds, then verify balance:
```bash
# Check on Hashscan
https://testnet.hashscan.io/account/0.0.YOUR_ACCOUNT_ID
```

#### "Invalid private key format"
Make sure private key is in correct format:
```bash
# ✅ Correct: 0x followed by 64 hex characters
HEDERA_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ❌ Wrong: Raw hex without 0x
HEDERA_PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

#### "Contract address not found after deployment"
Deployment may have failed or not been saved. Check .env.hedera:
```bash
cat .env.hedera | grep CONTRACT_ADDRESS

# Should show addresses, not 0x0000...
```

If empty, redeploy:
```bash
export $(cat .env.hedera | grep -v '#' | xargs)
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet
```

#### "Transaction timeout"
Hedera testnet may be slow. Wait a few seconds and retry:
```bash
# Transaction may still be processing on-chain
# Check Hashscan: https://testnet.hashscan.io/transaction/0x...
```

#### "Verify deployment on Hashscan"
After deployment, verify contracts exist:
```bash
# Check RBAC contract
https://testnet.hashscan.io/contract/0xCCCC1111...

# Check Audit contract
https://testnet.hashscan.io/contract/0xDDDD2222...

# Both should show contract code and state
```

---

### General Issues

#### "Missing environment variable: AUDIT_ENCRYPTION_KEY"
Check that `.env` or `.env.hedera` has all required variables:
```bash
cat .env | grep AUDIT_ENCRYPTION_KEY
# or
cat .env.hedera | grep AUDIT_ENCRYPTION_KEY
```

All variables must be present (even if dummy values for local testing).

#### "Agent discovered 0 tools"
Agent not registered on RBAC contract. Register them:
```bash
# For local Hardhat
npx tsx scripts/register-agents.ts

# For Hedera testnet
export $(cat .env.hedera | grep -v '#' | xargs)
npx tsx scripts/register-agents.ts
```

#### "Cannot read role from chain"
RBAC contract may not exist at the address in .env. Verify:
```bash
# For local Hardhat
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x5FbDB2315678afccb333f8a9c21c841F97B39DCd","latest"],"id":1}'

# For Hedera
curl -X POST https://testnet.hashio.io/api \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0xCCCC1111...","latest"],"id":1}'

# Should return bytecode (not 0x)
```

---

## ✅ You're Done!

You now have Zuul Proxy running with full governance and audit trails on your chosen blockchain (local Hardhat or Hedera testnet).

---

## Next Steps

### 🧪 Run Tests
```bash
pnpm test              # Unit tests
pnpm test:coverage     # Coverage report (must be ≥90%)
```

### ✔️ Type Checking
```bash
pnpm typecheck
```

### 📚 Learn More

**Understanding the system:**
- **[GETTING_STARTED.md](./GETTING_STARTED.md)** — Complete guide with learning paths
- **[docs/architecture.md](./docs/architecture.md)** — System design and trust boundaries
- **[docs/api.md](./docs/api.md)** — Complete HTTP API reference

**Deployment options:**
- **[docs/hedera-deployment.md](./docs/hedera-deployment.md)** — Step-by-step Hedera testnet (from scratch)
- **[docs/deployment.md](./docs/deployment.md)** — Multi-chain deployment guide

**Security & Operations:**
- **[docs/security.md](./docs/security.md)** — Threat model, audit design, key custody
- **[docs/agents.md](./docs/agents.md)** — How agents work with Zuul

**Business & Strategy:**
- **[docs/ethdenver-hackathon.md](./docs/ethdenver-hackathon.md)** — Hackathon scope and bounties
- **[docs/gas-cost-analysis.md](./docs/gas-cost-analysis.md)** — Cost comparison: Hedera vs Base
- **[.plans/cost-optimization-analysis.md](./.plans/cost-optimization-analysis.md)** — v1.1 roadmap: 90% cost savings

### 🚀 Move to Production
Once you're ready to deploy to production:
1. Use Hedera mainnet (same RPC URL as testnet, different chain ID)
2. Get real API keys from GitHub, Slack, OpenAI
3. Use secrets management (Vault, AWS Secrets Manager, KMS)
4. See [docs/deployment.md](./docs/deployment.md#production-hardening) for hardening

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

### Local Hardhat Flow

1. **Hardhat** provides a local Ethereum-compatible blockchain (instant, free)
2. **Smart contracts** (RBAC, Audit) are deployed to local Hardhat node
3. **Test agents** are registered on-chain with roles from `config.yaml`:
   - Agent 1: "Developer" role (read/create/update on github, read on slack)
   - Agent 2: "Admin" role (full access to all tools)
4. **Zuul Proxy** starts HTTP server that:
   - Verifies agent signatures (EIP-191)
   - Checks permissions on-chain (cached 5 minutes)
   - Injects API keys into upstream requests
   - Logs all requests to blockchain (non-blocking)
5. **Demo Agent** makes signed requests to test the full flow
6. **Audit trail** recorded on local blockchain

### Hedera Testnet Flow

1. **Hedera testnet** provides real blockchain at chainId 295 (3-second blocks)
2. **Smart contracts** (RBAC, Audit) are deployed to actual Hedera blockchain
3. **Your account** is registered as an agent with your chosen role
4. **Zuul Proxy** connects to Hedera RPC endpoint and performs same checks:
   - Verifies agent signatures via Hedera
   - Checks permissions from real blockchain
   - Logs audit trail to permanent blockchain
5. **Demo Agent** makes signed requests to Hedera-backed Zuul
6. **Audit trail** visible on Hashscan explorer: https://testnet.hashscan.io

---

## Performance

### Local Hardhat

| Operation | Latency | Notes |
|-----------|---------|-------|
| Signature recovery | ~10ms | viem library |
| RBAC cache hit | ~1ms | In-memory Map |
| RBAC chain read | ~5-50ms | Instant local blockchain |
| HTTP forward | ~100-1000ms | Depends on upstream |
| Total (with cache) | ~100-200ms | P50 |
| Total (first time) | ~100-200ms | P95 |

### Hedera Testnet

| Operation | Latency | Notes |
|-----------|---------|-------|
| Signature recovery | ~10ms | viem library |
| RBAC cache hit | ~1ms | In-memory Map |
| RBAC chain read | ~200-500ms | Hedera consensus (3s blocks) |
| HTTP forward | ~100-1000ms | Depends on upstream |
| Total (with cache) | ~100-200ms | P50 |
| Total (first time) | ~300-600ms | P95 |

---

## Quick Reference: Common Commands

### Local Hardhat Setup
```bash
# Terminal 1: Start blockchain
pnpm contracts:dev

# Terminal 2: Deploy contracts
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost

# Terminal 2: Register agents
npx tsx scripts/register-agents.ts

# Terminal 3: Start proxy
pnpm dev

# Terminal 4: Run demo
export AGENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
pnpm demo
```

### Hedera Testnet Setup
```bash
# One terminal: Deploy contracts
export $(cat .env.hedera | grep -v '#' | xargs)
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network hederaTestnet

# Register agents
npx tsx scripts/register-agents.ts

# Start proxy
pnpm dev

# Run demo
export $(cat .env.hedera | grep -v '#' | xargs)
pnpm demo

# Verify on Hashscan
# https://testnet.hashscan.io/contract/0xCCCC1111...
```

---

That's it! You now have Zuul Proxy running with full governance and audit trails. 🎉