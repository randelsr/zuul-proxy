# Deployment Guide

Instructions for deploying Zuul Proxy locally for development, to testnets for experimentation, and to production.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker](#docker)
3. [Hedera Testnet](#hedera-testnet)
4. [Multi-Chain (Base, Arbitrum, Optimism)](#multi-chain-deployment)
5. [Production Hardening](#production-hardening)
6. [Monitoring and Health](#monitoring-and-health)
7. [Configuration Reference](#configuration-reference)

---

## Local Development

### Prerequisites

- **Node.js 22+** (check version: `node --version`)
- **pnpm** (install: `npm install -g pnpm`)
- **Git** (for cloning repository)

### Quick Start (5 minutes)

**1. Clone and install dependencies:**
```bash
git clone https://github.com/example/zuul-proxy.git
cd zuul-proxy
pnpm install
```

**2. Compile smart contracts:**
```bash
pnpm contracts:build
```

**3. Start local Hardhat node (in terminal 1):**
```bash
pnpm contracts:dev
```

Output should show:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
```

**4. Deploy contracts to local node (in terminal 2):**
```bash
# Setup environment variables
export HARDHAT_NETWORK=localhost

# Deploy
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost
```

Save the contract addresses printed at the end.

**5. Configure Zuul Proxy:**

Create `.env.local`:
```bash
# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=debug

# Chain (local Hardhat)
CHAIN_ID=31337
CHAIN_RPC_URL=http://127.0.0.1:8545
CHAIN_NAME=localhost

# Smart Contracts (from step 4)
RBAC_CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9c21c841F97B39DCd
AUDIT_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# Keys and Secrets
AUDIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590

# Tools (API keys for upstream services)
GITHUB_API_KEY=ghp_...
SLACK_BOT_TOKEN=xoxb-...

# Nonce storage (in-memory, acceptable for dev)
NONCE_TTL_SECONDS=300
```

**6. Start Zuul Proxy (in terminal 3):**
```bash
pnpm dev
```

Output should show:
```
✓ Server running at http://localhost:8080
✓ Health check: http://localhost:8080/health
```

**7. Run demo agent (in terminal 4):**
```bash
pnpm demo
```

Expected output:
```
✓ Discovered 2 tools: github, slack
✓ GET /repos/owner/repo successful (200)
✗ POST /admin/users denied (403 -32012)
✓ Audit trail verified on blockchain
```

### Development Workflow

**Run type check before commits:**
```bash
pnpm typecheck
```

**Run linter:**
```bash
pnpm lint
```

**Run tests:**
```bash
pnpm test              # Unit tests
pnpm test:coverage     # Coverage report (must be ≥90%)
```

**Rebuild contracts after changes:**
```bash
pnpm contracts:build
```

**Restart local Hardhat node if contracts change:**
```bash
# Kill old node
pnpm contracts:dev     # Restarts fresh
```

---

## Docker

Build and run Zuul Proxy in a Docker container for consistent local environment and easier testnet deployment.

### Build Docker Image

```bash
docker build -t zuul-proxy:latest .
```

Check the `Dockerfile`:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 8080
CMD ["node", "dist/api/server.js"]
```

### Run Locally

```bash
docker run -p 8080:8080 \
  -e CHAIN_ID=31337 \
  -e CHAIN_RPC_URL=http://host.docker.internal:8545 \
  -e RBAC_CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9c21c841F97B39DCd \
  -e AUDIT_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  -e AUDIT_ENCRYPTION_KEY=0123456789abcdef... \
  -e WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590 \
  -e GITHUB_API_KEY=ghp_... \
  zuul-proxy:latest
```

Test the container:
```bash
curl http://localhost:8080/health
```

### Push to Registry

```bash
# Tag for Docker Hub
docker tag zuul-proxy:latest myusername/zuul-proxy:latest
docker tag zuul-proxy:latest myusername/zuul-proxy:v1.0.0

# Or tag for GitHub Container Registry
docker tag zuul-proxy:latest ghcr.io/myorg/zuul-proxy:latest

# Push
docker push myusername/zuul-proxy:latest
```

---

## Hedera Testnet

Deploy Zuul Proxy and smart contracts to Hedera Testnet (chainId 295) for cloud testing.

### Prerequisites

1. **Hedera testnet account** — Create at https://portal.hedera.com/register
2. **Account ID and private key** — Copy from portal settings
3. **Testnet Hbar** — Request from faucet (https://testnet.hedera.com/faucet)
4. **Node.js and pnpm** installed

### Step 1: Set Environment Variables

```bash
export HEDERA_ACCOUNT_ID=0.0.1234567      # Your account ID
export HEDERA_PRIVATE_KEY=0xabc123...     # Your private key
export HEDERA_NETWORK=testnet             # testnet or mainnet
```

Verify setup:
```bash
echo "Account: $HEDERA_ACCOUNT_ID"
echo "Network: $HEDERA_NETWORK"
```

### Step 2: Deploy Smart Contracts

```bash
pnpm run deploy:contracts
```

This runs `scripts/deploy-contracts.sh` which:
1. Validates environment variables
2. Compiles contracts via Hardhat
3. Deploys to Hedera Testnet via Hardhat Ignition
4. Saves contract addresses to `ignition/deployments/hedera-testnet/deployed_addresses.json`
5. Prints explorer links

Output:
```
✅ Deployment Complete
====================
Network:   Hedera Testnet (ChainID 295)
RBAC:      0x...
Audit:     0x...

Explorer: https://testnet.hashscan.io
```

**Save these contract addresses!**

### Step 3: Configure Proxy for Hedera

Create `.env.hedera`:

```bash
# Server
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# Chain (Hedera Testnet)
CHAIN_ID=295
CHAIN_RPC_URL=https://testnet.hashio.io/api/v1/http  # or your RPC endpoint
CHAIN_NAME=hedera-testnet

# Smart Contracts (from step 2)
RBAC_CONTRACT_ADDRESS=0x...  # Paste from deployment output
AUDIT_CONTRACT_ADDRESS=0x... # Paste from deployment output

# Keys (use same as deployment)
AUDIT_ENCRYPTION_KEY=0123456789abcdef...
WALLET_PRIVATE_KEY=0x...

# Tools (set real API keys for GitHub, Slack, etc.)
GITHUB_API_KEY=ghp_...
SLACK_BOT_TOKEN=xoxb-...

# Cache and Storage (in-memory for MVP)
NONCE_TTL_SECONDS=300
RBAC_CACHE_TTL_SECONDS=300

# HTTPS (optional, for cloud deployment)
# HTTPS_CERT_PATH=/path/to/cert.pem
# HTTPS_KEY_PATH=/path/to/key.pem
```

### Step 4: Deploy Proxy

**Option A: Using Docker (recommended for cloud)**

```bash
docker build -t zuul-proxy:hedera .
docker run -d \
  --name zuul-proxy \
  -p 8080:8080 \
  --env-file .env.hedera \
  zuul-proxy:hedera
```

Check logs:
```bash
docker logs zuul-proxy -f
```

**Option B: Direct deployment**

```bash
source .env.hedera
pnpm build
node dist/api/server.js
```

### Step 5: Test on Testnet

```bash
# Health check
curl https://zuul.example.com/health

# Discover tools
curl -X POST https://zuul.example.com/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": { "agent_address": "0x..." },
    "id": 1
  }'
```

### Verify Audit Trail

View audit logs on Hedera blockchain:

```bash
# Using Hashscan explorer
open "https://testnet.hashscan.io/contract/$AUDIT_CONTRACT_ADDRESS?tab=contract"
```

---

## Multi-Chain Deployment

Deploy to Base, Arbitrum, or Optimism testnets. Same contract bytecode, network-specific addresses.

### Supported Networks

| Network | ChainId | RPC URL |
|---------|---------|---------|
| Hedera Testnet | 295 | https://testnet.hashio.io/api/v1/http |
| Base Testnet | 84531 | https://goerli.base.org |
| Arbitrum Testnet | 421614 | https://goerli-rollup.arbitrum.io:8443 |
| Optimism Testnet | 420 | https://goerli.optimism.io |

### Deploy to Base Testnet

**1. Set environment:**
```bash
export CHAIN=base-testnet
export CHAIN_ID=84531
export CHAIN_RPC_URL=https://goerli.base.org
```

**2. Deploy contracts:**
```bash
pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
  --network base-testnet \
  --deployment-id base-testnet
```

**3. Create `.env.base`:**
```bash
CHAIN_ID=84531
CHAIN_RPC_URL=https://goerli.base.org
RBAC_CONTRACT_ADDRESS=0x...  # From deployment
AUDIT_CONTRACT_ADDRESS=0x...
# ... other settings
```

**4. Deploy proxy:**
```bash
source .env.base
pnpm dev
```

### Deploy to Multiple Chains Simultaneously

**Script: `scripts/deploy-all-chains.sh` (optional, for advanced setups)**

```bash
#!/bin/bash
set -e

for chain in hedera-testnet base-testnet arbitrum-testnet optimism-testnet; do
  echo "Deploying to $chain..."

  export HARDHAT_NETWORK=$chain
  pnpm hardhat ignition deploy ignition/modules/Zuul.ts \
    --network $chain \
    --deployment-id $chain

  echo "✓ $chain deployment complete"
done
```

---

## Production Hardening

### HTTPS and TLS

**Required in production.** Use Let's Encrypt or your certificate authority.

**1. Obtain certificate:**
```bash
# Using Let's Encrypt with Certbot
certbot certonly --standalone -d zuul.example.com
```

**2. Configure Zuul:**
```bash
# .env.production
HTTPS_CERT_PATH=/etc/letsencrypt/live/zuul.example.com/fullchain.pem
HTTPS_KEY_PATH=/etc/letsencrypt/live/zuul.example.com/privkey.pem
HTTP_ONLY=false
```

**3. Start with HTTPS:**
```bash
node dist/api/server.js
# Server listening on https://0.0.0.0:8080
```

### Firewall and Network Security

**Restrict incoming traffic:**
```bash
# Allow only from known agent IPs
sudo ufw allow from 10.0.0.0/8 to any port 8080
```

**Use a reverse proxy (nginx):**
```nginx
server {
  listen 443 ssl;
  server_name zuul.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:8080;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

### Secrets Management

**Never store secrets in code or config files.**

**1. Use environment variables only:**
```bash
# Load from secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)
export WALLET_PRIVATE_KEY=$(vault kv get secret/zuul/wallet | jq -r .data.data.private_key)
export AUDIT_ENCRYPTION_KEY=$(aws secretsmanager get-secret-value --secret-id zuul/encryption-key | jq -r .SecretString)
```

**2. Docker secrets (for Docker Compose/Swarm):**
```yaml
version: '3.8'
services:
  zuul:
    image: zuul-proxy:latest
    environment:
      - WALLET_PRIVATE_KEY_FILE=/run/secrets/wallet_key
      - AUDIT_ENCRYPTION_KEY_FILE=/run/secrets/encryption_key
    secrets:
      - wallet_key
      - encryption_key

secrets:
  wallet_key:
    external: true
  encryption_key:
    external: true
```

**3. Audit logging for secrets access:**
- All secret reads logged (without exposing values)
- Log rotation and retention policy
- Regular key rotation (recommended: quarterly)

### Rate Limiting (Future)

Reserved for version 2.0. For production MVP, implement at reverse proxy:

```nginx
limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;
limit_req zone=one burst=20;
```

---

## Monitoring and Health

### Health Check Endpoint

**HTTP endpoint (no auth required):**
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

**Integration with monitoring tools (Prometheus, DataDog, New Relic):**
```bash
# Check every 30 seconds
curl --fail http://localhost:8080/health || alert "Zuul unhealthy"
```

### Logging

Zuul uses **structured logging via pino**. Logs output to stdout (JSON format by default).

**Configure log level:**
```bash
LOG_LEVEL=debug   # Verbose (development)
LOG_LEVEL=info    # Normal (production)
LOG_LEVEL=warn    # Warnings only
LOG_LEVEL=error   # Errors only
```

**Example log output:**
```json
{
  "level": 30,
  "time": 1740000000000,
  "pid": 12345,
  "hostname": "zuul-1",
  "msg": "Request processed",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "agent": "0x1234567890abcdef1234567890abcdef12345678",
  "tool": "github",
  "action": "read",
  "latencyMs": 142,
  "auditTx": "0xDEF123456789abcdefDEF123456789abcdefDEF"
}
```

**Collect logs with ELK stack, Loki, or Datadog:**
```bash
# Datadog Agent
echo '{"level":30,"msg":"Request processed",...}' | datadog-agent flare
```

### Metrics

Key metrics to monitor:

| Metric | Target | Alert |
|--------|--------|-------|
| **Request latency (P50, P95, P99)** | <200ms P50, <500ms P95 | >1s P95 |
| **Error rate** | <0.1% (most requests succeed) | >1% errors |
| **Blockchain RPC latency** | <200ms | >1s |
| **Audit queue depth** | <100 pending | >1000 backlog |
| **Cache hit rate** | >90% (cached permissions) | <80% hit rate |
| **Upstream service errors** | <1% | >5% |

### Alerting

**PagerDuty integration (via log hook):**
```bash
# Alert on critical errors
if grep "error_type.*revoked" /var/log/zuul.log; then
  pagerduty trigger --incident="Wallet revocation detected"
fi
```

---

## Configuration Reference

### Server Configuration

```yaml
# config.yaml (optional YAML config file, overrides env vars)

server:
  port: 8080
  host: 0.0.0.0
  nodeEnv: production
  logLevel: info
  httpOnly: false  # false = HTTPS required
  httpsKeyPath: /etc/zuul/key.pem
  httpsCertPath: /etc/zuul/cert.pem

chain:
  id: 295  # Hedera Testnet
  rpcUrl: https://testnet.hashio.io/api/v1/http
  name: hedera-testnet
  timeout: 30000  # ms

contracts:
  rbacAddress: "0x..."
  auditAddress: "0x..."
  confirmations: 1  # blocks to wait

keys:
  auditEncryptionKey: "0x..."  # Never in config file!
  walletPrivateKey: "0x..."    # Never in config file!

cache:
  rbacTtlSeconds: 300
  nonceTtlSeconds: 300

tools:
  - key: github
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
    description: GitHub API for repository management

  - key: slack
    baseUrl: https://slack.com/api
    keyRef: SLACK_BOT_TOKEN
    description: Slack API for messaging
```

### Environment Variables

**All configuration can be set via env vars (recommended for production):**

```bash
# Server
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
HTTP_ONLY=false
HTTPS_CERT_PATH=/etc/zuul/cert.pem
HTTPS_KEY_PATH=/etc/zuul/key.pem

# Chain
CHAIN_ID=295
CHAIN_RPC_URL=https://testnet.hashio.io/api/v1/http
CHAIN_NAME=hedera-testnet
CHAIN_TIMEOUT_MS=30000

# Contracts
RBAC_CONTRACT_ADDRESS=0x...
AUDIT_CONTRACT_ADDRESS=0x...

# Secrets (load from vault, not hardcoded)
AUDIT_ENCRYPTION_KEY=0x...
WALLET_PRIVATE_KEY=0x...

# Tools (API keys)
GITHUB_API_KEY=ghp_...
SLACK_BOT_TOKEN=xoxb-...

# Cache
RBAC_CACHE_TTL_SECONDS=300
NONCE_TTL_SECONDS=300
```

---

## Troubleshooting

### "Chain RPC error"

**Symptom:** All requests return 503 with `-32022`

**Causes & fixes:**
```bash
# 1. Check RPC URL is reachable
curl $CHAIN_RPC_URL

# 2. Verify contract address exists
curl "$CHAIN_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["'$RBAC_CONTRACT_ADDRESS'","latest"]}'

# 3. Check RPC rate limits
# (If using free tiers like Infura, check quota)
```

### "Signature verification failed"

**Symptom:** All requests return 401 with `-32002`

**Causes & fixes:**
```bash
# 1. Verify WALLET_PRIVATE_KEY matches deployed authority
# 2. Check X-Signature is EIP-191 formatted (0x-prefixed hex)
# 3. Verify message payload format (METHOD\nURL\nNONCE\nTIMESTAMP)
```

### Container won't start

**Check logs:**
```bash
docker logs zuul-proxy --tail 50
```

**Common issues:**
- Missing AUDIT_ENCRYPTION_KEY (must be 64 hex chars = 32 bytes)
- Invalid CONTRACT_ADDRESS format
- RPC_URL unreachable
- PORT already in use

---

## Next Steps

1. **Run demo locally** — Verify all tests pass with `pnpm test`
2. **Deploy to Hedera testnet** — Follow "Hedera Testnet" section above
3. **Monitor audit trail** — Check blockchain explorer for audit records
4. **Harden for production** — Use HTTPS, firewall, secrets vault
5. **Scale horizontally** — Run multiple proxy instances behind load balancer
