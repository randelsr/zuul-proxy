# Running the Demo Agent

After running `pnpm setup:dev`, run the demo with the appropriate private key for your registered agent.

## Quick Start (4 Terminals)

### Terminal 1: Start Hardhat Node
```bash
pnpm contracts:dev
```

**Expected output:**
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
```

### Terminal 2: Deploy Contracts & Register Agents
```bash
pnpm setup:dev
```

This outputs registered test agents:
```
✅ Agent registration complete!

📋 TEST AGENTS:
==============

Agent 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Role: Developer
  ℹ️  Hardhat Account #0
  Permissions:
    • github: read, create, update
    • slack: read

Agent 2: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  Role: Administrator
  ℹ️  Hardhat Account #1
  Permissions:
    • github: read, create, update, delete
    • slack: read, create
    • openai: read, create

📁 Agent info saved to: .agents.json
```

### Terminal 3: Start Zuul Proxy Server
```bash
pnpm dev
```

**Expected output:**
```
[INFO] Server running at http://localhost:8080
[INFO] Health check: curl http://localhost:8080/health
[INFO] Loaded 3 tools from config: github, slack, openai
[INFO] Permission cache initialized with TTL 300s
```

### Terminal 4: Get Private Keys and Run Demo

First, get the Hardhat test account private keys:
```bash
npx tsx scripts/get-test-account-keys.ts
```

**Output shows which accounts are registered:**
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

**Run demo with Agent 1 (Developer):**
```bash
export AGENT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
pnpm demo
```

**Or run with Agent 2 (Administrator) for more permissions:**
```bash
export AGENT_PRIVATE_KEY="0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5"
pnpm demo
```

**Expected demo output:**
```
🚀 Zuul Proxy Demo Scenario
============================================================

Agent Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
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

📍 STEP 2-5: Call tools, verify audit trail, check governance metadata
...

============================================================
✅ Demo Scenario Complete
============================================================
```

## How It Works

1. **Setup Phase** (`pnpm setup:dev`):
   - Deploys RBAC and Audit contracts to Hardhat
   - Reads roles and permissions from `config.yaml`
   - Registers Hardhat test accounts (0-5) as agents with corresponding roles
   - Grants all role permissions on-chain via RBAC contract
   - Stores agent info in `.agents.json` for demo reference

2. **Contract Reading**:
   - Dev server uses viem to read agent roles from RBAC contract
   - Role ID is hashed with `keccak256(utf8("developer"))` to match on-chain storage
   - Permissions are cached with 5-minute TTL for performance
   - On chain outage, system fails closed (denies access) not open

3. **Key Generation**:
   - Hardhat uses standard BIP39 mnemonic: "test test test test test test test test test test test junk"
   - Run `npx tsx scripts/get-test-account-keys.ts` to show available test accounts and their private keys
   - Each account has a deterministic private key derived from the mnemonic

4. **Demo Phase** (`pnpm demo`):
   - Demo agent signs requests with provided private key using EIP-191
   - Proxy verifies signature and recovers agent address
   - Checks RBAC permissions for that address on-chain
   - Returns filtered tool list based on agent permissions
   - Shows governance metadata including audit transaction hash

## Troubleshooting

### "Found 0 tools"
The agent address doesn't match any registered agents. Make sure you:
1. Ran `pnpm setup:dev` to register agents on-chain
2. Used the correct private key from `npx tsx scripts/get-test-account-keys.ts`
3. The private key matches one of the registered agents

### Private key error
Make sure the private key is 32 bytes (64 hex characters after `0x`). Get the correct keys with:
```bash
npx tsx scripts/get-test-account-keys.ts
```

### Contract returns no data
The RBAC contract may not be deployed or Hardhat was restarted. Redeploy:
```bash
# Terminal 1: Start fresh Hardhat
pnpm contracts:dev

# Terminal 2: Deploy contracts and register agents
pnpm setup:dev
```

### Connection refused to Hardhat
Make sure Hardhat node is running:
```bash
pnpm contracts:dev  # Terminal 1
```

Check it's responding:
```bash
curl -X POST http://localhost:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Dev server can't connect to contract
Make sure:
1. Hardhat is running on `http://127.0.0.1:8545`
2. `.env` has correct contract addresses from `pnpm setup:dev` output
3. Dev server is restarted after deploying contracts:
```bash
pkill -f "tsx src/index.ts"
pnpm dev
```
