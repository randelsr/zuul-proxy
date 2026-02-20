# Agent Setup and Management

This guide explains how test agents are registered on-chain and how to use them with the Zuul Proxy in local development.

## Overview

**Agents** are identified by their wallet addresses and have assigned **roles** that grant **permissions** to use specific tools.

- **Local Config** (`config.yaml`) — Defines tools and roles with their permissions
- **Smart Contract** (RBAC on-chain) — Stores agent registrations and permission checks
- **Demo Setup** (`scripts/setup-dev-agents.ts`) — Registers test agents to the blockchain

## Quick Setup

To register test agents to the local blockchain:

```bash
# Terminal 1: Start Hardhat node
pnpm contracts:dev

# Terminal 2: Deploy contracts and register agents
pnpm setup:dev
```

This script:
1. Deploys RBAC contract (manages permissions)
2. Deploys Audit contract (logs all requests)
3. Registers 5 test agents from Hardhat accounts
4. Assigns each agent a role
5. Grants all permissions to each role

## Test Agent Accounts

The setup script creates test agents using Hardhat's built-in test accounts. These are deterministic and always the same when you restart Hardhat:

| Agent # | Address | Role | Notes |
|---------|---------|------|-------|
| 1 | `0x70997970c51812e339d9b73b0245601513...` | Developer | read, create, update on tools |
| 2 | `0x3c44cdddb6a900756dcdbca3b663dcc21a5df3...` | Admin | Full access to all tools |
| 3-5 | (from config.yaml) | (varies) | Additional test accounts |

**Find the exact addresses:**
```bash
# After running pnpm setup:dev, the addresses are printed
pnpm setup:agents
```

## Configuration

Roles and permissions are defined in `config.yaml`:

```yaml
roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read, create, update]
      - tool: slack
        actions: [read]

  - id: admin
    name: Administrator
    permissions:
      - tool: github
        actions: [read, create, update, delete]
      - tool: slack
        actions: [read, create]
      - tool: openai
        actions: [read, create]
```

## How It Works

### 1. Local Config (config.yaml)

Tools and roles are defined statically:

```
tools:
  github: { baseUrl: https://api.github.com, ... }
  slack: { baseUrl: https://slack.com/api, ... }

roles:
  developer: { permissions: github.read, slack.read }
  admin: { permissions: github.*, slack.*, openai.* }
```

### 2. Blockchain Registration (RBAC Contract)

During `pnpm setup:dev`, agents are registered on-chain:

```solidity
// Pseudo-code
rbac.registerAgent(agent_1_address, keccak256("developer"))
rbac.grantPermission(keccak256("developer"), "github", "read")
rbac.grantPermission(keccak256("developer"), "slack", "read")
// ... etc for all roles and permissions
```

### 3. Runtime Permission Checks

When a request arrives, the proxy:

1. Recovers agent address from signature
2. Looks up agent's role on-chain: `RBAC.getAgentRole(agent_address)`
3. Checks permission: `RBAC.hasPermission(agent_address, tool, action)`
4. Returns 403 if permission denied

**Permission Lookup Flow:**

```
Request from Agent
    ↓
Verify Signature → Recover Address
    ↓
Check RBAC Cache (TTL 5min)
    ├─ Cache Hit → Return cached role
    └─ Cache Miss → Read from blockchain → Cache result
    ↓
Check Permission (Role → Tool → Action)
    ├─ Granted → Forward to upstream
    └─ Denied → Return 403 error
```

## Using a Specific Agent

### With the Demo

The demo script (`demo/scenario.ts`) uses a hardcoded agent. To use a different test agent:

```bash
# Use Agent 1 (Developer)
AGENT_PRIVATE_KEY=0x70997970c51812e339d9b73b0245601513... pnpm demo

# Or use Agent 2 (Admin) — check the setup output for the address
```

### With curl

To make manual requests with a specific agent, you need to:

1. **Get the agent's private key** (from Hardhat or use a test key)
2. **Sign the request** using EIP-191
3. **Include headers:**
   - `X-Agent-Address`: Agent wallet address
   - `X-Signature`: Signed payload
   - `X-Nonce`: UUID v4 (for replay protection)
   - `X-Timestamp`: Unix seconds

Example:

```bash
# Using Hardhat's test account 1
AGENT_ADDRESS="0x70997970c51812e339d9b73b0245601513..."

curl -X GET http://localhost:8080/forward/https://api.github.com/repos/owner/repo \
  -H "X-Agent-Address: $AGENT_ADDRESS" \
  -H "X-Signature: 0x..." \
  -H "X-Nonce: $(uuidgen)" \
  -H "X-Timestamp: $(date +%s)"
```

See `demo/agent.ts` for signature generation code.

## Adding New Agents

### For Local Development

Add new test accounts to `scripts/setup-dev-agents.ts`:

```typescript
// Get Hardhat test accounts
const allAccounts = await ethers.getSigners();
const demoAgents = allAccounts.slice(1, 6); // Currently uses accounts 1-5

// To use more accounts, increase the slice:
const demoAgents = allAccounts.slice(1, 10); // Accounts 1-9
```

Then re-run setup:

```bash
pnpm setup:agents
```

### For Testnet/Production

Use the RBAC contract's admin interface:

```bash
# Call the RBAC contract directly
hardhat run scripts/register-agent.ts --network hederaTestnet
```

Example script:

```typescript
import { ethers } from 'hardhat';

async function registerAgent() {
  const [admin] = await ethers.getSigners();
  const rbac = await ethers.getContractAt('RBAC', RBAC_ADDRESS);

  const agentAddress = '0x...'; // Your agent wallet
  const roleId = ethers.keccak256(ethers.toUtf8Bytes('developer'));

  await rbac.connect(admin).registerAgent(agentAddress, roleId);
  console.log(`Registered ${agentAddress} as developer`);
}
```

## Permission Actions

Actions map to HTTP methods:

| Action | HTTP Methods | Meaning |
|--------|--------------|---------|
| `read` | GET, HEAD | Read-only access |
| `create` | POST | Create new resources |
| `update` | PUT, PATCH | Modify existing resources |
| `delete` | DELETE | Remove resources |

Example: A user with `github.read` permission can only make GET/HEAD requests to GitHub.

## Emergency Revocation

To immediately deny access to an agent:

```bash
# Via hardhat
hardhat run scripts/revoke-agent.ts --network localhost
```

Or call the contract directly:

```typescript
await rbac.emergencyRevoke(agentAddress);
```

This sets `agentActive[address] = false`, causing all permission checks to fail.

## Caching and TTL

Permission checks are cached in memory with a TTL (default 5 minutes):

- **Cache Hit** — Response within ~1ms (no blockchain call)
- **Cache Miss** — Response within ~200-500ms (blockchain read + retry logic)
- **Chain Outage** — Returns 503, never grants access (fail-closed)

To change TTL:

```bash
# In .env
RBAC_CACHE_TTL_SECONDS=600  # 10 minutes
```

## Troubleshooting

### "No agents found" error

**Cause**: Agents haven't been registered to the RBAC contract.

**Fix**:
```bash
pnpm setup:agents
```

### "Permission denied" on allowed action

**Cause**: Agent's role doesn't have the permission, or permission cache is stale.

**Fix**:
```bash
# Re-register agents and grant permissions
pnpm setup:agents

# Or wait 5 minutes for cache to expire
```

### "Contract read failed (503)"

**Cause**: Hardhat node is not running or unreachable.

**Fix**:
```bash
# Terminal 1
pnpm contracts:dev
```

### Agent address not recovering correctly

**Cause**: Invalid signature or signature not matching canonical payload.

**Fix**: See `docs/api.md` for the correct signature format.

## Advanced Topics

### Custom Role Setup

To create custom roles for testing:

1. Edit `config.yaml` to add a new role
2. Run `pnpm setup:agents` (uses all roles in config)
3. Or manually register via Hardhat task

### Multi-Chain Deployment

On other chains (Base, Arbitrum, Optimism), agent registration follows the same pattern:

```bash
pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network arbitrumOne
pnpm hardhat run scripts/setup-dev-agents.ts --network arbitrumOne
```

### Audit Trail Inspection

To see audited requests, read from the Audit contract:

```typescript
const audit = await ethers.getContractAt('Audit', AUDIT_ADDRESS);
const entries = await audit.queryEntries(startTime, endTime);
```

See `docs/audit.md` for details on audit log structure.

---

**Next**: Read `docs/api.md` for the complete HTTP API specification.
