# Hedera Testnet Deployment Guide

**Zuul Proxy on Hedera (Chain ID 295) - Complete Configuration & Deployment**

Last Updated: February 20, 2026

---

## Table of Contents

1. [Network Overview](#network-overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Environment Configuration](#environment-configuration)
4. [Smart Contract Deployment](#smart-contract-deployment)
5. [Agent Registration](#agent-registration)
6. [Proxy Deployment](#proxy-deployment)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Blockchain Explorer](#monitoring--blockchain-explorer)
9. [Cost Analysis](#cost-analysis)
10. [Troubleshooting](#troubleshooting)

---

## Network Overview

### Hedera Testnet Details

| Property | Value |
|----------|-------|
| **Network Name** | Hedera Testnet |
| **Chain ID** | 295 |
| **Official RPC Endpoint** | https://testnet.hashio.io/api |
| **Public RPC Endpoint (Hashio)** | https://testnet.hashio.io/api |
| **Block Time** | ~3 seconds |
| **Throughput** | 10,000+ TPS |
| **Finality** | Instant (Byzantine Fault Tolerance) |
| **Consensus Model** | Hedera Hashgraph (not Proof of Work/Stake) |
| **EVM Compatibility** | Yes (Solidity contracts supported) |

### Why Hedera?

**Cost Efficiency:**
- Write operations: **$0.003-0.005 USD** per transaction (fixed)
- Read operations: **Free** (no consensus needed)
- Compare to Base: **$0.30-0.60 USD** per write operation
- **100x cheaper** for audit logging use cases

**Predictability:**
- Fixed costs in USD (not volatile ETH pricing)
- No gas limit concept (deterministic fees)
- Perfect for governance and audit scenarios

---

## Prerequisites & Setup

### 1. Hedera Testnet Account

**Create a Hedera account:**
1. Go to https://portal.hedera.com/register
2. Sign up with email
3. Verify your email
4. Access the Hedera Testnet Portal

**Note your Account ID:**
- Format: `0.0.XXXXXXX` (e.g., `0.0.123456`)
- Found under "Account" in portal settings
- This is your Hedera testnet account

### 2. Generate Private Key

**Option A: Use Portal-Generated Key (Recommended for testing)**

1. In portal, go to "Account" → "Private Key"
2. Click "Generate Key"
3. Download and save the private key file
4. Keep this file secure (never commit to git)

**Option B: Generate Local ECDSA Key**

```bash
# Using OpenSSL
openssl ecparam -genkey -name prime256v1 -noout -out hedera_key.pem

# Extract hex format
openssl ec -in hedera_key.pem -text -noout | grep -A 5 "priv:" | tail -n 1 | \
  xxd -r -p | od -An -tx1 | tr -d ' \n'
```

**Store the private key:**
```bash
# Save to environment (never hardcode)
export HEDERA_PRIVATE_KEY=0xabc123...  # Full hex format with 0x prefix
```

### 3. Fund Your Account (Testnet HBAR)

**Get testnet HBAR from faucet:**

1. Go to https://testnet.hedera.com/faucet
2. Enter your account ID (e.g., `0.0.123456`)
3. Click "Request" to receive 100 testnet HBAR
4. Wait ~30 seconds for confirmation

**Verify funding:**
```bash
# Check balance via Hashscan explorer
# https://testnet.hashscan.io/account/0.0.123456
```

**Funding details:**
- Each faucet request: **100 testnet HBAR**
- Can request once per 24 hours
- Estimate costs for full deployment: 5-20 testnet HBAR

### 4. Install Dependencies

```bash
# Node.js 22+ required
node --version  # Should be v22.0.0 or higher

# Install pnpm
npm install -g pnpm

# Clone repository
git clone https://github.com/example/zuul-proxy.git
cd zuul-proxy

# Install dependencies
pnpm install

# Verify Hardhat installation
pnpm hardhat --version
```

---

## Environment Configuration

### Step 1: Create Hedera Environment File

Create `.env.hedera` in project root:

```bash
# ============================================================================
# Hedera Testnet Configuration
# ============================================================================

# ============================================================================
# Server Configuration
# ============================================================================
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
HTTP_ONLY=true

# ============================================================================
# Blockchain Configuration (Hedera Testnet)
# ============================================================================
# RPC URL for Hedera Testnet
HEDERA_RPC_URL=https://testnet.hashio.io/api

# Your Hedera testnet private key (the one you created above)
# Format: 0x followed by 64 hex characters (32 bytes)
HEDERA_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Optional: Alternative RPC endpoints (for redundancy)
# HEDERA_RPC_URL_FALLBACK=https://testnet.hashio.io/api

# ============================================================================
# Smart Contract Addresses (from deployment, fill in after deploy)
# ============================================================================
# Leave empty initially, will be populated after contract deployment
RBAC_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
AUDIT_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# ============================================================================
# Encryption and Security Keys
# ============================================================================
# WARNING: Test key for development only
# For production: Generate with: openssl rand -hex 32
AUDIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Wallet private key (must match HEDERA_PRIVATE_KEY or be authorized signer)
WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590

# ============================================================================
# Tool API Keys (Real values for production)
# ============================================================================
# GitHub: https://github.com/settings/tokens
GITHUB_API_KEY=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Slack: https://api.slack.com/apps
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================================================
# Cache Configuration
# ============================================================================
RBAC_CACHE_TTL_SECONDS=300        # Cache RBAC permissions for 5 minutes
NONCE_TTL_SECONDS=300              # Cache nonces for 5 minutes

# ============================================================================
# Chain Driver Configuration
# ============================================================================
# Which chain driver to use: 'hedera', 'base', 'arbitrum', 'optimism'
CHAIN_DRIVER=hedera
CHAIN_ID=295                        # Hedera testnet chain ID
```

### Step 2: Load Environment

```bash
# Load the environment file
source .env.hedera

# Verify variables are set
echo "HEDERA_RPC_URL: $HEDERA_RPC_URL"
echo "HEDERA_PRIVATE_KEY: ${HEDERA_PRIVATE_KEY:0:10}..." # Show only first 10 chars
```

### Step 3: Environment Variable Explanations

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `HEDERA_RPC_URL` | Hedera JSON-RPC endpoint | `https://testnet.hashio.io/api` | Yes |
| `HEDERA_PRIVATE_KEY` | Private key for contract deployment (must fund this account) | `0xabc123...` | Yes |
| `RBAC_CONTRACT_ADDRESS` | Deployed RBAC contract address | `0x1234...` | After deploy |
| `AUDIT_CONTRACT_ADDRESS` | Deployed Audit contract address | `0x5678...` | After deploy |
| `AUDIT_ENCRYPTION_KEY` | 32-byte AES-256 encryption key | `0x01234567...` (64 hex chars) | Yes |
| `WALLET_PRIVATE_KEY` | Signing key for requests | `0xac0974be...` | Yes |
| `RBAC_CACHE_TTL_SECONDS` | RBAC permission cache duration | `300` | No (default: 300) |
| `NONCE_TTL_SECONDS` | Nonce validation cache duration | `300` | No (default: 300) |

---

## Smart Contract Deployment

### Step 1: Build Contracts

```bash
# Compile Solidity contracts
pnpm contracts:build

# Output should show:
# ✓ Compiled 2 Solidity files successfully
# - RBAC.sol
# - Audit.sol
```

### Step 2: Deploy to Hedera Testnet

**Option A: Using Hardhat Ignition (Recommended)**

```bash
# Deploy to Hedera testnet using Hardhat Ignition
pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
  --network hederaTestnet \
  --deployment-id hedera-testnet

# Output will show deployed contract addresses
```

**Option B: Using npm script**

```bash
# Create deployment script if not present
export HARDHAT_NETWORK=hederaTestnet
pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
  --network hederaTestnet \
  --deployment-id hedera-testnet
```

### Step 3: Extract Contract Addresses

After deployment, you'll see output like:

```
✓ Deployment complete

Deployments:
RBAC contract: 0x1234567890abcdef1234567890abcdef12345678
Audit contract: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
```

**Update .env.hedera:**

```bash
# Copy addresses from deployment output
RBAC_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
AUDIT_CONTRACT_ADDRESS=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
```

### Step 4: Verify Deployment on Hashscan

Visit Hashscan explorer to verify:

```
https://testnet.hashscan.io/contract/0x1234567890abcdef1234567890abcdef12345678
```

Check:
- ✅ Contract is verified (shows code)
- ✅ Contract has transactions (deployment receipt)
- ✅ Contract state is accessible (can view storage)

---

## Agent Registration

### Step 1: Prepare Agent Registration Script

The `scripts/register-agents.ts` script registers test agents with RBAC contract.

**Review the script:**
```bash
cat scripts/register-agents.ts
```

### Step 2: Run Agent Registration

```bash
# Load Hedera environment
source .env.hedera

# Compile and run registration script
npx tsx scripts/register-agents.ts

# Output:
# 🤖 Registering test agents to RBAC contract...
#
# 📍 Admin signer: 0x...
# 📍 RBAC contract: 0x...
#
# 📋 Found 2 roles:
#    • Developer (developer_role)
#    • Administrator (admin_role)
#
# 📝 Registering 2 test agents:
#    Agent 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
#    Role: Developer
#    ✓ Registered (tx: 0x...)
#    ✓ Role activated (tx: 0x...)
#
# ✅ Agent registration complete!
```

### Step 3: Verify Agent Registration

Check registered agents by viewing `.agents.json`:

```bash
cat .agents.json
```

Example output:
```json
{
  "1": {
    "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "hardhatAccountIndex": 0,
    "role": "Developer",
    "permissions": [
      {
        "tool": "github",
        "actions": ["read", "create", "update"]
      },
      {
        "tool": "slack",
        "actions": ["read"]
      }
    ]
  },
  "2": {
    "address": "0x8C8d35429F74ec245F8Ef2f4Fd1e551cFF97d650",
    "hardhatAccountIndex": 1,
    "role": "Administrator",
    "permissions": [
      {
        "tool": "github",
        "actions": ["read", "create", "update", "delete"]
      }
    ]
  }
}
```

---

## Proxy Deployment

### Step 1: Build TypeScript Code

```bash
# Compile TypeScript to JavaScript
pnpm build

# Verify build succeeded
ls -la dist/
```

### Step 2: Start Zuul Proxy

**Option A: Direct Node Process (Development)**

```bash
source .env.hedera
pnpm build
node dist/api/server.js

# Output:
# ✓ Server running on http://0.0.0.0:8080
# ✓ Health check: http://localhost:8080/health
# ✓ RPC enabled at http://localhost:8080/rpc
```

**Option B: Using npm dev script**

```bash
source .env.hedera
pnpm dev

# Hot-reload enabled (watches for file changes)
```

**Option C: Docker Container (Production)**

```bash
# Build Docker image
docker build -t zuul-proxy:hedera .

# Run container with Hedera environment
docker run -d \
  --name zuul-proxy \
  -p 8080:8080 \
  --env-file .env.hedera \
  zuul-proxy:hedera

# Check logs
docker logs zuul-proxy -f

# Stop container
docker stop zuul-proxy
```

### Step 3: Verify Proxy is Running

**Health check:**
```bash
curl http://localhost:8080/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": 1740000000
# }
```

**Check logs:**
```bash
# From running process:
# [INFO] Server listening on http://0.0.0.0:8080
# [INFO] RBAC cache initialized (TTL: 300s)
# [INFO] Audit queue started
```

---

## Post-Deployment Verification

### Step 1: Test Discovery Endpoint

Discover available tools for an agent:

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {
      "agent_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    },
    "id": 1
  }'

# Expected response:
# {
#   "jsonrpc": "2.0",
#   "id": 1,
#   "result": {
#     "tools": [
#       {
#         "key": "github",
#         "base_url": "https://api.github.com",
#         "allowed_actions": ["read", "create", "update"],
#         "description": "GitHub API"
#       },
#       {
#         "key": "slack",
#         "base_url": "https://slack.com/api",
#         "allowed_actions": ["read"],
#         "description": "Slack API"
#       }
#     ]
#   },
#   "_governance": {
#     "request_id": "550e8400-e29b-41d4-a716-446655440000",
#     "agent": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
#     "timestamp": 1740000000
#   }
# }
```

### Step 2: Test Admin Endpoints (Localhost Only)

**Query audit logs:**
```bash
curl http://localhost:8080/admin/audit/search \
  ?agent=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  &decrypt=false \
  &limit=10

# Expected: List of audit entries (empty if no requests yet)
```

**Emergency revoke agent:**
```bash
curl -X POST http://localhost:8080/admin/rbac/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "agent_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  }'

# Expected response:
# {
#   "message": "Agent revoked",
#   "txHash": "0x..."
# }
```

### Step 3: Run End-to-End Demo

```bash
# Run full demo scenario
pnpm demo

# Expected output:
# 📍 STEP 1: Discover Tools
# ✓ Found 2 tools
#
# 📍 STEP 2: Make Tool Calls
# ✓ GET /repos/owner/repo successful
# ✗ DELETE /admin/users denied (403 -32012)
#
# 📍 STEP 3: Verify Audit Trail
# ✓ 2 entries audited on blockchain
#
# 📍 STEP 4-8: Admin Operations
# ✓ Emergency revoke successful
# ✓ Audit queries working
```

---

## Monitoring & Blockchain Explorer

### Step 1: View Contracts on Hashscan

**RBAC Contract:**
```
https://testnet.hashscan.io/contract/0x1234567890abcdef1234567890abcdef12345678
```

Check:
- Contract code
- State variables (agent → role mappings)
- Function calls
- Events (AgentRevoked, RoleStatusChanged)

**Audit Contract:**
```
https://testnet.hashscan.io/contract/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
```

Check:
- Audit entries (recordEntry calls)
- Stored encrypted payloads
- Indexes (entriesByAgent, entriesByTool)

### Step 2: Monitor Transactions

**View transaction details:**
```bash
# After a request goes through, check the audit transaction:
# https://testnet.hashscan.io/tx/0x...

# You should see:
# - Transaction type: Smart contract call
# - Function: recordEntry
# - Input data: Encrypted payload
# - Gas used: ~5-20k gas (Hedera units)
# - Status: Success
```

### Step 3: Monitor Logs

**Application logs:**
```bash
# From running proxy:
tail -f /var/log/zuul-proxy.log

# Expected output:
# {"level":30,"msg":"Request processed","agent":"0x...","tool":"github","action":"read","latencyMs":142,"auditTx":"0x..."}
# {"level":30,"msg":"Audit entry written to blockchain","encryptedPayload":"0x...","payloadHash":"0x..."}
```

**Container logs (if using Docker):**
```bash
docker logs zuul-proxy -f --tail 100
```

---

## Cost Analysis

### Transaction Costs on Hedera Testnet

**Estimated costs (Hedera testnet operates at fixed USD rates):**

| Operation | Cost | Notes |
|-----------|------|-------|
| Contract deployment | ~$1-2 per contract | One-time |
| recordEntry (audit write) | $0.003-0.005 | Per request |
| getEntriesByAgent (read) | Free | O(1) index lookup |
| getEntriesByTool (read) | Free | O(1) index lookup |
| setAgentRole (register agent) | ~$0.001-0.002 | One-time per agent |
| emergencyRevoke | ~$0.001-0.002 | Per revocation |

**Monthly estimate (10k audit entries + 50k queries):**

| Activity | Count/Month | Cost |
|----------|------------|------|
| Audit writes | 300,000 | $1,200-1,500 |
| Read queries | 1,500,000 | Free |
| Agent registration/revoke | 100 | ~$0.20 |
| **Total** | | **$1,200-1,500** |

**Compare to Base mainnet:**
- Same audit volume would cost **$135,000-210,000/month** on Base
- **100x cheaper on Hedera**

See `docs/gas-cost-analysis.md` for detailed cost comparison.

---

## Troubleshooting

### Issue: "Chain RPC error" (503 -32022)

**Symptom:** All requests return service unavailable

**Root causes & fixes:**

1. **RPC URL unreachable:**
```bash
# Test RPC endpoint
curl -X POST $HEDERA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","result":"0x127","id":1}
```

2. **Contract address invalid:**
```bash
# Check if contract exists
curl -X POST $HEDERA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getCode",
    "params":["'$RBAC_CONTRACT_ADDRESS'","latest"],
    "id":1
  }'

# Should return non-empty bytecode (not 0x)
```

3. **Account not funded:**
```bash
# Check account balance
# https://testnet.hashscan.io/account/0.0.YOUR_ACCOUNT_ID

# Fund from faucet: https://testnet.hedera.com/faucet
```

### Issue: "Invalid contract address" (400)

**Symptom:** Deployment fails or contract not found

**Fixes:**
1. Verify `RBAC_CONTRACT_ADDRESS` and `AUDIT_CONTRACT_ADDRESS` are set
2. Ensure addresses are lowercase and properly formatted (0x + 40 hex chars)
3. Verify addresses exist on Hashscan: `https://testnet.hashscan.io/contract/0x...`

### Issue: "Signature verification failed" (401 -32002)

**Symptom:** Agent requests rejected with invalid signature

**Checks:**
1. Verify `WALLET_PRIVATE_KEY` is set correctly
2. Confirm private key format: `0x` + 64 hex characters
3. Test signature locally:
```bash
# Use the demo agent to verify signing works
pnpm demo
```

### Issue: "Agent not authorized" (403 -32012)

**Symptom:** Agent discovers 0 tools

**Fixes:**
1. Verify agent is registered:
```bash
cat .agents.json  # Check if agent is in file
```

2. Verify RBAC contract has agent → role mapping:
   - Visit Hashscan contract page
   - Check state (agentRoles mapping)

3. Verify roles in config.yaml match registered roles:
```bash
cat config.yaml | grep -A 10 "roles:"
```

4. Re-run agent registration:
```bash
pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
  --network hederaTestnet \
  --deployment-id hedera-testnet

npx tsx scripts/register-agents.ts
```

### Issue: "Nonce already used" (401 -32004)

**Symptom:** Agent gets replay attack error even on first request

**Fixes:**
1. Ensure `NONCE_TTL_SECONDS` is set (default: 300)
2. Use unique nonce for each request (UUID recommended)
3. Clear nonce cache if needed (in-memory cache, restart proxy)

### Issue: Container won't start (Docker)

**Check logs:**
```bash
docker logs zuul-proxy 2>&1 | head -50
```

**Common issues & fixes:**

| Issue | Fix |
|-------|-----|
| `AUDIT_ENCRYPTION_KEY not set` | Export in shell before `docker run` |
| `Port 8080 already in use` | Use `docker ps` to find and stop conflicting container, or change PORT env var |
| `Cannot find module 'viem'` | Rebuild image: `docker build -t zuul-proxy:hedera .` |
| `RPC connection timeout` | Verify HEDERA_RPC_URL is accessible (might be network/firewall issue) |

### Issue: High gas usage

**Hedera testnet uses "gas units" (not ETH):**
- 1 gas unit on Hedera ≠ 1 gwei on Ethereum
- Costs are fixed in USD, not variable

**If costs seem high:**
1. Check Hashscan transaction details
2. Verify payload size (encrypted payloads can be large)
3. Review audit contract indexing (indexes add to gas cost)

---

## Advanced Configuration

### Multiple RPC Endpoints (Failover)

**For production resilience, configure multiple RPC endpoints:**

```bash
# Primary endpoint
HEDERA_RPC_URL=https://testnet.hashio.io/api

# Fallback endpoints (optional, for redundancy)
HEDERA_RPC_URL_FALLBACK_1=https://testnet-rpc.hashio.io/api
HEDERA_RPC_URL_FALLBACK_2=https://hedera.hashio.io/api
```

### Custom RPC Endpoint

**If running your own Hedera node:**

```bash
# Point to local or custom RPC
HEDERA_RPC_URL=http://your-hedera-node:50111

# Verify connectivity
curl -X POST $HEDERA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### HTTPS Deployment

**For production, use HTTPS:**

```bash
# Generate self-signed cert (testing only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365

# Or use Let's Encrypt
certbot certonly --standalone -d zuul.example.com

# Configure Zuul
HTTPS_KEY_PATH=/etc/letsencrypt/live/zuul.example.com/privkey.pem
HTTPS_CERT_PATH=/etc/letsencrypt/live/zuul.example.com/fullchain.pem
HTTP_ONLY=false
```

---

## Next Steps

1. **Verify deployment** — Run `pnpm demo` and check all steps pass
2. **Monitor audit trail** — Visit Hashscan to see audit transactions
3. **Test admin endpoints** — Query audit logs and test emergency revoke
4. **Scale to mainnet** (optional) — Deploy to Hedera mainnet using same config (chainId 295 stays the same)
5. **Monitor costs** — Track HBAR spending via Hashscan

---

## References

- **Hedera Docs:** https://docs.hedera.com
- **Hedera Testnet Portal:** https://portal.hedera.com
- **Hashscan Explorer:** https://testnet.hashscan.io
- **Hedera Fee Schedule:** https://docs.hedera.com/hedera/networks/testnet/fees
- **Hedera EVM Guide:** https://docs.hedera.com/hedera/core-concepts/smart-contracts/implementing-hedera-smart-contracts
- **Hardhat Documentation:** https://hardhat.org/getting-started
- **Zuul Proxy Architecture:** See `docs/architecture.md`
- **API Documentation:** See `docs/api.md`

---

**Last Updated:** February 20, 2026
**Maintained By:** Claude Code
**Status:** Complete Configuration Guide
